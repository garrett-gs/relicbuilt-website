import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { logProposalEvent, ipFromHeaders } from "@/lib/audit";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

function receiptEmailHtml(opts: {
  clientName: string;
  invoiceNumber: string;
  description: string;
  amountPaid: number;
  date: string;
}) {
  const { clientName, invoiceNumber, description, amountPaid, date } = opts;
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#222;background:#fff;">
  <div style="padding:20px 32px;border-bottom:3px solid #c4a24d;margin-bottom:0;">
    <img src="https://relicbuilt.com/logo-full.png" alt="RELIC Custom Fabrications" style="height:56px;object-fit:contain;display:block;" />
  </div>
  <div style="padding:32px;">
    <h2 style="margin:0 0 6px;font-size:22px;color:#111;">Payment Received</h2>
    <p style="margin:0 0 24px;color:#666;font-size:14px;">${invoiceNumber}</p>

    <p style="font-size:15px;color:#333;margin:0 0 16px;">Hi ${clientName},</p>
    <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.6;">
      Thank you! We have received your payment. A summary of your transaction is below.
    </p>

    <div style="background:#f8f6f0;border:1px solid #e5e0d8;padding:20px 24px;margin-bottom:24px;">
      <table style="width:100%;font-size:14px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#666;">Invoice #:</td>
          <td style="padding:6px 0;text-align:right;font-weight:600;color:#111;">${invoiceNumber}</td>
        </tr>
        <tr style="border-top:1px solid #e5e0d8;">
          <td style="padding:8px 0 6px;color:#666;">Project / Description:</td>
          <td style="padding:8px 0 6px;text-align:right;font-weight:600;color:#111;">${description}</td>
        </tr>
        <tr style="border-top:1px solid #e5e0d8;">
          <td style="padding:8px 0 6px;color:#666;">Payment Method:</td>
          <td style="padding:8px 0 6px;text-align:right;color:#111;">Card</td>
        </tr>
        <tr style="border-top:1px solid #e5e0d8;">
          <td style="padding:8px 0 6px;color:#666;">Date:</td>
          <td style="padding:8px 0 6px;text-align:right;color:#111;">${date}</td>
        </tr>
        <tr style="border-top:2px solid #c4a24d;">
          <td style="padding:10px 0 6px;font-size:15px;font-weight:bold;color:#111;">Amount Paid:</td>
          <td style="padding:10px 0 6px;text-align:right;font-size:18px;font-weight:bold;color:#c4a24d;font-family:monospace;">${money(amountPaid)}</td>
        </tr>
      </table>
    </div>

    <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.6;">
      Your payment has been received and recorded. If you have any questions, don&apos;t hesitate to reach out.
    </p>

    <p style="font-size:14px;color:#555;margin:0 0 8px;">Phone: <strong>(402) 235-8179</strong></p>
    <p style="font-size:14px;color:#555;margin:0 0 8px;">Web: <a href="https://relicbuilt.com" style="color:#c4a24d;">relicbuilt.com</a></p>

    <p style="margin-top:32px;font-size:11px;color:#aaa;">
      RELIC Custom Fabrications &nbsp;&middot;&nbsp; relicbuilt.com
    </p>
  </div>
</div>`;
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, invoiceId } = await req.json();
    if (!sessionId || !invoiceId) {
      return NextResponse.json({ error: "Missing sessionId or invoiceId" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    if (session.metadata?.invoice_id !== invoiceId) {
      return NextResponse.json({ error: "Session invoice mismatch" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (error || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status === "paid") {
      return NextResponse.json({
        ok: true,
        already_paid: true,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
      });
    }

    const totalPaid = (session.amount_total ?? 0) / 100;
    const today = new Date().toISOString().split("T")[0];
    const existingPayments = Array.isArray(invoice.payments) ? invoice.payments : [];

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        payments: [
          ...existingPayments,
          {
            amount: totalPaid,
            method: "card",
            date: today,
            note: "Paid online via Stripe",
            ref: sessionId,
            created_at: new Date().toISOString(),
          },
        ],
      })
      .eq("id", invoiceId);

    if (updateError) {
      console.error("confirm-payment update error:", updateError);
      return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
    }

    // ── Auto-create project when an estimate's deposit invoice is paid
    // This is the "deposit paid → project exists" gate. Now that the
    // client has paid the deposit via Stripe, we promote the accepted
    // estimate to a real custom_work record without Garrett having to
    // click anything in Axiom.
    if (invoice.invoice_type === "deposit" && invoice.estimate_id) {
      try {
        const { data: estimate } = await supabase
          .from("estimates")
          .select("*")
          .eq("id", invoice.estimate_id)
          .single();

        if (estimate && !estimate.deposit_paid_at && estimate.proposal_status === "approved") {
          // Inline calc to avoid circular imports
          interface Li { quantity?: number; unit_price?: number }
          interface La { cost?: number }
          const m = (estimate.line_items as Li[] || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
          const l = (estimate.labor_items as La[] || []).reduce((s, li) => s + (li.cost || 0), 0);
          const total = Math.round((m + l) * (1 + (estimate.markup_percent || 0) / 100) * 100) / 100;

          // Change orders attach to the parent project — don't create a new one
          let customWorkId = estimate.custom_work_id || estimate.change_order_for_id;
          if (!customWorkId) {
            const { data: newProject } = await supabase
              .from("custom_work")
              .insert({
                project_name: estimate.project_name || "Untitled Project",
                client_name: estimate.client_name || "",
                client_email: estimate.client_email || null,
                client_phone: estimate.client_phone || null,
                customer_id: estimate.customer_id || null,
                quoted_amount: total,
                project_description: estimate.notes || null,
                inspiration_images: estimate.images || [],
                proposal_highlights: estimate.proposal_highlights || [],
                proposal_scope: estimate.proposal_scope || null,
                proposal_images: estimate.images || [],
                proposal_images_included: estimate.proposal_images_included !== false,
                proposal_status: "approved",
                proposal_approved_at: estimate.proposal_approved_at || new Date().toISOString(),
                status: "in_progress",
              })
              .select("id")
              .single();
            if (newProject) customWorkId = newProject.id;
          }

          if (customWorkId) {
            // Stamp estimate as paid and link to project
            await supabase.from("estimates").update({
              deposit_paid_at: new Date().toISOString(),
              custom_work_id: customWorkId,
              updated_at: new Date().toISOString(),
            }).eq("id", estimate.id);

            // Link this invoice + the balance invoice to the new project
            await supabase.from("invoices").update({ custom_work_id: customWorkId }).eq("id", invoiceId);
            await supabase.from("invoices")
              .update({ custom_work_id: customWorkId })
              .eq("estimate_id", estimate.id)
              .eq("invoice_type", "final");

            // Audit trail: deposit was paid via Stripe
            await logProposalEvent({
              supabase,
              estimateId: estimate.id,
              eventType: "deposit_paid",
              signerEmail: estimate.client_email || null,
              ipAddress: ipFromHeaders(req.headers),
              userAgent: req.headers.get("user-agent") || null,
              metadata: {
                amount: totalPaid,
                method: "card",
                stripe_session_id: sessionId,
                invoice_id: invoiceId,
                invoice_number: invoice.invoice_number,
                custom_work_id: customWorkId,
              },
            });
          }
        }
      } catch (autoErr) {
        // Non-fatal — payment is still recorded; Garrett can manually create
        // the project from the estimator if this fails for any reason
        console.error("confirm-payment auto-project error:", autoErr);
      }
    }

    // Send receipt email if client email exists
    if (invoice.client_email) {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const dateFormatted = new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        const html = receiptEmailHtml({
          clientName: invoice.client_name || "there",
          invoiceNumber: invoice.invoice_number,
          description: invoice.description || "Invoice Payment",
          amountPaid: totalPaid,
          date: dateFormatted,
        });
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "RELIC Custom Fabrications <notifications@relicbuilt.com>",
            to: [invoice.client_email],
            subject: `Payment Receipt — ${invoice.invoice_number}`,
            html,
          }),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      invoice_number: invoice.invoice_number,
      amount_paid: totalPaid,
      client_name: invoice.client_name,
      description: invoice.description,
      client_email: invoice.client_email,
    });
  } catch (err) {
    console.error("confirm-payment error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
