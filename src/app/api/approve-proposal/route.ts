import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

function depositEmailHtml(opts: {
  clientName: string;
  projectName: string;
  depositAmount: number;
  balanceAmount: number;
  invoiceNumber: string;
  bizName: string;
  bizPhone?: string;
  payUrl?: string;
}) {
  const { clientName, projectName, depositAmount, balanceAmount, invoiceNumber, bizName, bizPhone, payUrl } = opts;
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#222;background:#fff;">
  <div style="padding:20px 32px;border-bottom:3px solid #c4a24d;margin-bottom:0;">
    <img src="https://relicbuilt.com/logo-full.png" alt="RELIC Custom Fabrications" style="height:56px;object-fit:contain;display:block;" />
  </div>
  <div style="padding:32px;">
    <h2 style="margin:0 0 6px;font-size:22px;color:#111;">Deposit Invoice</h2>
    <p style="margin:0 0 24px;color:#666;font-size:14px;">${invoiceNumber}</p>

    <p style="font-size:15px;color:#333;margin:0 0 20px;">Hi ${clientName},</p>
    <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.6;">
      Thank you for approving your proposal for <strong>${projectName}</strong>.
      A deposit is required to begin work. Please find your deposit details below.
    </p>

    <div style="background:#f8f6f0;border:1px solid #e5e0d8;padding:20px 24px;margin-bottom:24px;">
      <table style="width:100%;font-size:14px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#666;">Project:</td>
          <td style="padding:6px 0;text-align:right;font-weight:600;color:#111;">${projectName}</td>
        </tr>
        <tr style="border-top:1px solid #e5e0d8;">
          <td style="padding:10px 0 6px;font-size:15px;font-weight:bold;color:#111;">Deposit Due:</td>
          <td style="padding:10px 0 6px;text-align:right;font-size:18px;font-weight:bold;color:#c4a24d;font-family:monospace;">${money(depositAmount)}</td>
        </tr>
        ${balanceAmount > 0 ? `
        <tr>
          <td style="padding:4px 0;color:#999;font-size:12px;">Balance Due at Completion:</td>
          <td style="padding:4px 0;text-align:right;color:#999;font-size:12px;font-family:monospace;">${money(balanceAmount)}</td>
        </tr>` : ""}
      </table>
    </div>

    ${payUrl ? `
    <div style="margin:24px 0;text-align:center;">
      <a href="${payUrl}" style="display:inline-block;background:#c4a24d;color:#fff;text-decoration:none;padding:14px 36px;font-size:15px;font-weight:bold;">Pay Deposit Online &rarr;</a>
    </div>` : ""}

    <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.6;">
      To pay your deposit, please use the button above or contact us. You can also pay by check payable to <strong>${bizName}</strong>.
    </p>

    ${bizPhone ? `<p style="font-size:14px;color:#555;margin:0 0 8px;">Phone: <strong>${bizPhone}</strong></p>` : ""}

    <p style="margin-top:32px;font-size:11px;color:#aaa;">
      ${bizName} &nbsp;&middot;&nbsp; relicbuilt.com
    </p>
  </div>
</div>`;
}

function adminNotifyHtml(opts: {
  clientName: string;
  projectName: string;
  depositAmount: number;
  depositInvoiceNum: string;
  finalInvoiceNum: string;
  approvedAt: string;
}) {
  const { clientName, projectName, depositAmount, depositInvoiceNum, finalInvoiceNum, approvedAt } = opts;
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
  <div style="padding:16px 24px;border-bottom:3px solid #c4a24d;margin-bottom:0;">
    <img src="https://relicbuilt.com/logo-full.png" alt="RELIC" style="height:40px;object-fit:contain;display:block;" />
  </div>
  <div style="padding:24px;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#111;">Proposal Approved</h2>
    <p style="font-size:14px;color:#555;margin:0 0 16px;">
      <strong>${clientName}</strong> approved the proposal for <strong>${projectName}</strong> on ${approvedAt}.
    </p>
    <table style="font-size:13px;border-collapse:collapse;width:100%;">
      <tr><td style="padding:4px 0;color:#777;">Deposit Invoice:</td><td style="padding:4px 0;font-weight:600;">${depositInvoiceNum} — ${money(depositAmount)}</td></tr>
      <tr><td style="padding:4px 0;color:#777;">Final Invoice:</td><td style="padding:4px 0;font-weight:600;">${finalInvoiceNum} (draft — send when ready)</td></tr>
    </table>
    <p style="font-size:12px;color:#aaa;margin-top:24px;">Log in to Axiom to manage invoices and update the project status.</p>
  </div>
</div>`;
}

async function sendEmail(resendKey: string, to: string, subject: string, html: string, fromName = "RELIC Custom Fabrications") {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${fromName} <notifications@relicbuilt.com>`,
      to: [to],
      subject,
      html,
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });

    // Use service role key to bypass RLS for invoice creation
    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    // Find project by token
    const { data: project, error } = await supabase
      .from("custom_work")
      .select("*")
      .eq("proposal_token", token)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    // Already approved?
    if (project.proposal_status === "approved") {
      return NextResponse.json({ already_approved: true, project_name: project.project_name });
    }

    // Calculate amounts
    const costSection = project.proposal_cost_section;
    const depositAmount = costSection?.deposit_amount || 0;
    const totalAmount = project.quoted_amount || 0;
    const balanceAmount = depositAmount > 0 ? totalAmount - depositAmount : 0;

    // Generate invoice numbers
    const y = new Date().getFullYear();
    const depositInvoiceNum = `INV-${y}-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalInvoiceNum   = `INV-${y}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString().split("T")[0];

    // Create deposit invoice
    const { data: depositInvoice, error: depositError } = await supabase.from("invoices").insert({
      invoice_number: depositInvoiceNum,
      custom_work_id: project.id,
      client_name: project.client_name || "",
      client_email: project.client_email || "",
      description: `Deposit — ${project.project_name}`,
      subtotal: depositAmount > 0 ? depositAmount : totalAmount,
      issued_date: now,
      tax_rate: 0,
      status: "unpaid",
      invoice_type: "deposit",
    }).select().single();

    if (depositError) {
      console.error("Deposit invoice creation failed:", depositError.message, depositError.details);
      return NextResponse.json({ error: `Failed to create deposit invoice: ${depositError.message}` }, { status: 500 });
    }

    // Create final invoice (not emailed — admin sends manually when ready)
    const { data: finalInvoice, error: finalError } = await supabase.from("invoices").insert({
      invoice_number: finalInvoiceNum,
      custom_work_id: project.id,
      client_name: project.client_name || "",
      client_email: project.client_email || "",
      description: `Balance — ${project.project_name}`,
      subtotal: depositAmount > 0 ? balanceAmount : totalAmount,
      issued_date: now,
      tax_rate: 0,
      status: "unpaid",
      invoice_type: "final",
    }).select().single();

    if (finalError) {
      console.error("Final invoice creation failed:", finalError.message, finalError.details);
    }

    // Mark proposal approved
    await supabase.from("custom_work").update({
      proposal_status: "approved",
      proposal_approved_at: new Date().toISOString(),
    }).eq("id", project.id);

    // Load settings for biz info + team
    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_phone,team_members")
      .limit(1)
      .single();

    const bizName = settings?.biz_name || "RELIC Custom Fabrications";
    const bizPhone = settings?.biz_phone;
    const teamMembers: Array<{ name: string; email: string; notifications?: { portal_updates?: boolean } }> =
      settings?.team_members || [];

    const sends: Promise<Response>[] = [];

    // Email deposit invoice to client
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://relicbuilt.com").trim().replace(/\/$/, "");
    if (project.client_email && depositInvoice) {
      const payUrl = `${siteUrl}/pay/${depositInvoice.id}`;
      const html = depositEmailHtml({
        clientName: project.client_name || "there",
        projectName: project.project_name,
        depositAmount: depositAmount > 0 ? depositAmount : totalAmount,
        balanceAmount,
        invoiceNumber: depositInvoice.invoice_number,
        bizName,
        bizPhone,
        payUrl,
      });
      sends.push(sendEmail(resendKey, project.client_email, `Deposit Invoice — ${project.project_name}`, html, bizName));
    }

    // Notify admin team
    const adminHtml = adminNotifyHtml({
      clientName: project.client_name || "Client",
      projectName: project.project_name,
      depositAmount: depositAmount > 0 ? depositAmount : totalAmount,
      depositInvoiceNum: depositInvoice?.invoice_number || depositInvoiceNum,
      finalInvoiceNum: finalInvoice?.invoice_number || finalInvoiceNum,
      approvedAt: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    });

    const adminSubject = `Proposal Approved — ${project.project_name}`;
    const adminEmails = teamMembers
      .filter((m) => m.email && (m.notifications?.portal_updates !== false))
      .map((m) => m.email);

    // Always send to at least the primary notifications email
    const allAdminEmails = adminEmails.length > 0 ? adminEmails : [];
    allAdminEmails.forEach((email) => {
      sends.push(sendEmail(resendKey, email, adminSubject, adminHtml, bizName));
    });

    await Promise.allSettled(sends);

    return NextResponse.json({
      ok: true,
      project_name: project.project_name,
      client_name: project.client_name,
      deposit_invoice_id: depositInvoice?.id,
      final_invoice_id: finalInvoice?.id,
      deposit_amount: depositAmount > 0 ? depositAmount : totalAmount,
    });
  } catch (err) {
    console.error("approve-proposal error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
