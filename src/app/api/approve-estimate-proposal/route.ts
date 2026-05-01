import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

interface EstimateLineItem { quantity?: number; unit_price?: number }
interface EstimateLaborItem { cost?: number }

function calcTotals(est: { line_items?: EstimateLineItem[]; labor_items?: EstimateLaborItem[]; markup_percent?: number }) {
  const materialTotal = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const laborTotal = (est.labor_items || []).reduce((s, l) => s + (l.cost || 0), 0);
  const subtotal = materialTotal + laborTotal;
  const markup = subtotal * ((est.markup_percent || 0) / 100);
  const total = Math.round((subtotal + markup) * 100) / 100;
  return { materialTotal, laborTotal, subtotal, markup, total };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, signatureName } = body;
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    if (!signatureName || typeof signatureName !== "string" || signatureName.trim().length < 2) {
      return NextResponse.json({ error: "Please enter your name to sign." }, { status: 400 });
    }

    // Service role bypasses RLS — needed because the client is unauthenticated
    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    // Look up estimate by proposal_token
    const { data: estimate, error: estErr } = await supabase
      .from("estimates")
      .select("*")
      .eq("proposal_token", token)
      .single();
    if (estErr || !estimate) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    // Already approved? — idempotent return
    if (estimate.proposal_status === "approved") {
      return NextResponse.json({
        already_approved: true,
        project_name: estimate.project_name,
        custom_work_id: estimate.custom_work_id,
      });
    }

    // Compute totals from the live estimate data
    const totals = calcTotals(estimate);
    const totalAmount = totals.total;

    // Load settings for default deposit % + biz info
    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_phone,biz_email,deposit_percent")
      .limit(1)
      .single();

    // ── Check expiration ─────────────────────────────────────────────
    if (estimate.proposal_expires_at) {
      const expiresAt = new Date(estimate.proposal_expires_at);
      if (Date.now() > expiresAt.getTime()) {
        return NextResponse.json({ error: "This proposal has expired. Please contact us for an updated quote." }, { status: 410 });
      }
    }

    const depositPct = estimate.deposit_percent ?? settings?.deposit_percent ?? 50;
    const depositAmount = Math.round(totalAmount * depositPct) / 100;
    const balanceAmount = Math.round((totalAmount - depositAmount) * 100) / 100;

    // ── Create deposit and final invoices ────────────────────────────
    // Note: NO project (custom_work) is created here. Project creation
    // is deferred until the user marks the deposit paid in Axiom — that
    // way the projects tab only shows projects with money down.
    const y = new Date().getFullYear();
    const today = new Date().toISOString().split("T")[0];
    const depositInvoiceNum = `INV-${y}-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalInvoiceNum = `INV-${y}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Deposit invoice — due date = proposal expiration (same date)
    const depositDueDate = estimate.proposal_expires_at
      ? new Date(estimate.proposal_expires_at).toISOString().split("T")[0]
      : today;

    const { data: depositInvoice, error: depErr } = await supabase
      .from("invoices")
      .insert({
        invoice_number: depositInvoiceNum,
        estimate_id: estimate.id,
        client_name: estimate.client_name || "",
        client_email: estimate.client_email || null,
        description: `Deposit — ${estimate.project_name || estimate.estimate_number}`,
        subtotal: depositAmount > 0 ? depositAmount : totalAmount,
        issued_date: today,
        due_date: depositDueDate,
        tax_rate: 0,
        status: "unpaid",
        invoice_type: "deposit",
      })
      .select()
      .single();
    if (depErr) {
      console.error("[approve-estimate-proposal] deposit invoice failed:", depErr);
      return NextResponse.json({ error: `Could not create deposit invoice: ${depErr.message}` }, { status: 500 });
    }

    if (balanceAmount > 0) {
      await supabase.from("invoices").insert({
        invoice_number: finalInvoiceNum,
        estimate_id: estimate.id,
        client_name: estimate.client_name || "",
        client_email: estimate.client_email || null,
        description: `Balance — ${estimate.project_name || estimate.estimate_number}`,
        subtotal: balanceAmount,
        issued_date: today,
        tax_rate: 0,
        status: "unpaid",
        invoice_type: "final",
      });
    }

    // ── Mark estimate approved (project NOT created yet) ──────────────
    await supabase
      .from("estimates")
      .update({
        proposal_status: "approved",
        proposal_approved_at: new Date().toISOString(),
        status: "accepted",
        notes: [
          estimate.notes || "",
          `Signed by ${signatureName.trim()} on ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}`,
        ].filter(Boolean).join("\n"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", estimate.id);

    // ── Email the deposit invoice ────────────────────────────────────
    // Try to email immediately on acceptance so the client has it in
    // their inbox before they leave the page. Failures here don't block
    // the response — the invoice is still created and visible in Axiom.
    const resendKey = process.env.RESEND_API_KEY;
    let toEmail = (estimate.client_email || "").trim();
    if (!toEmail && estimate.customer_id) {
      const { data: cust } = await supabase
        .from("customers")
        .select("email")
        .eq("id", estimate.customer_id)
        .single();
      if (cust?.email) toEmail = cust.email.trim();
    }

    if (resendKey && toEmail) {
      const dueByText = depositDueDate
        ? new Date(depositDueDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : "";
      const bizName = settings?.biz_name || "RELIC Custom Fabrications";
      const bizPhone = settings?.biz_phone || "";
      const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "relicbuilt.com"}`;
      const payUrl = `${origin}/pay/${depositInvoice.id}`;

      const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#222;background:#fff;">
  <div style="padding:20px 32px;border-bottom:3px solid #c4a24d;">
    <img src="https://relicbuilt.com/logo-full.png" alt="${esc(bizName)}" style="height:56px;display:block;" />
  </div>
  <div style="padding:32px;">
    <h2 style="margin:0 0 6px;font-size:22px;color:#111;">Deposit Invoice</h2>
    <p style="margin:0 0 24px;color:#666;font-size:14px;">${esc(depositInvoice.invoice_number)}</p>

    <p style="font-size:15px;color:#333;margin:0 0 20px;">Hi ${esc(estimate.client_name || "there")},</p>
    <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.6;">
      Thank you for approving your proposal for <strong>${esc(estimate.project_name || estimate.estimate_number)}</strong>.
      A deposit is required to begin work. Please find your deposit details below.
    </p>

    <div style="background:#f8f6f0;border:1px solid #e5e0d8;padding:20px 24px;margin-bottom:24px;">
      <table style="width:100%;font-size:14px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#666;">Project:</td>
          <td style="padding:6px 0;text-align:right;font-weight:600;color:#111;">${esc(estimate.project_name || "")}</td>
        </tr>
        <tr style="border-top:1px solid #e5e0d8;">
          <td style="padding:10px 0 6px;font-size:15px;font-weight:bold;color:#111;">Deposit Due:</td>
          <td style="padding:10px 0 6px;text-align:right;font-size:18px;font-weight:bold;color:#c4a24d;font-family:monospace;">${money(depositAmount)}</td>
        </tr>
        ${dueByText ? `
        <tr>
          <td style="padding:4px 0;color:#666;font-size:12px;">Due By:</td>
          <td style="padding:4px 0;text-align:right;color:#111;font-size:12px;font-weight:600;">${esc(dueByText)}</td>
        </tr>` : ""}
        ${balanceAmount > 0 ? `
        <tr>
          <td style="padding:4px 0;color:#999;font-size:12px;">Balance Due Prior to Delivery:</td>
          <td style="padding:4px 0;text-align:right;color:#999;font-size:12px;font-family:monospace;">${money(balanceAmount)}</td>
        </tr>` : ""}
      </table>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${payUrl}" style="display:inline-block;background:#c4a24d;color:#0a0a0a;padding:16px 36px;text-decoration:none;font-weight:bold;letter-spacing:0.08em;font-size:14px;text-transform:uppercase;">
        Pay Deposit Now → Card or ACH
      </a>
    </div>
    <p style="font-size:11px;color:#aaa;text-align:center;margin:0 0 24px;line-height:1.5;">
      Card (instant, 2.9% + $0.30 fee) or ACH bank transfer (3–5 days, lower fee).
      Prefer check or other method? Just reply.
    </p>

    <p style="font-size:13px;color:#888;margin:0 0 12px;line-height:1.6;">
      <strong style="color:#7a5a00;">Balances are due prior to delivery.</strong>
    </p>

    <p style="font-size:13px;color:#888;margin:0;line-height:1.6;">
      Questions? Reply to this email or call ${bizPhone ? esc(bizPhone) : "us"}.
    </p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">
    ${esc(bizName)}
  </div>
</div>
      `.trim();

      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${bizName} <notifications@relicbuilt.com>`,
            to: [toEmail],
            subject: `Deposit Invoice ${depositInvoice.invoice_number} — ${estimate.project_name || ""}`.trim(),
            html,
            reply_to: settings?.biz_email || "garrett@relicbuilt.com",
          }),
        });
      } catch (emailErr) {
        console.error("[approve-estimate-proposal] deposit email failed:", emailErr);
        // Non-fatal — the client is already approved and the invoice exists
      }
    }

    return NextResponse.json({
      success: true,
      project_name: estimate.project_name || estimate.estimate_number,
      deposit_invoice_id: depositInvoice.id,
      deposit_invoice_number: depositInvoice.invoice_number,
      deposit_amount: depositAmount,
      balance_amount: balanceAmount,
      total_amount: totalAmount,
      deposit_percent: depositPct,
      deposit_due_date: depositDueDate,
      biz_name: settings?.biz_name || "RELIC",
      emailed_to: toEmail || null,
    });
  } catch (err) {
    console.error("[approve-estimate-proposal] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
