import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateEstimateProposalHtml } from "@/lib/proposal-html";
import { renderHtmlToPdf } from "@/lib/render-pdf";
import { logProposalEvent, ipFromHeaders } from "@/lib/audit";
import type { Estimate, ProposalHighlight, ProposalScope } from "@/types/axiom";

// Allow up to 60 seconds for the PDF generation step. Vercel Hobby has a
// 10s default, Pro has 300s. PDF render typically takes 3-5s.
export const runtime = "nodejs";
export const maxDuration = 60;

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

interface LineItem { quantity?: number; unit_price?: number }
interface LaborItem { cost?: number }

function calcTotals(est: { line_items?: LineItem[]; labor_items?: LaborItem[]; markup_percent?: number }) {
  const materialTotal = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const laborTotal = (est.labor_items || []).reduce((s, li) => s + (li.cost || 0), 0);
  const subtotal = materialTotal + laborTotal;
  const markupAmount = subtotal * ((est.markup_percent || 0) / 100);
  const total = Math.round((subtotal + markupAmount) * 100) / 100;
  return { materialTotal, laborTotal, markupAmount, total };
}

export async function POST(req: NextRequest) {
  try {
    const { estimate_id } = await req.json();
    if (!estimate_id) {
      return NextResponse.json({ error: "estimate_id required" }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: estimate, error: estErr } = await supabase
      .from("estimates")
      .select("*")
      .eq("id", estimate_id)
      .single();
    if (estErr || !estimate) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }
    if (!estimate.proposal_token) {
      return NextResponse.json({ error: "Proposal hasn't been generated yet — save the estimate first." }, { status: 400 });
    }

    // Resolve recipient — prefer estimate.client_email, fall back to customer
    let toEmail = (estimate.client_email || "").trim();
    if (!toEmail && estimate.customer_id) {
      const { data: cust } = await supabase
        .from("customers")
        .select("email")
        .eq("id", estimate.customer_id)
        .single();
      if (cust?.email) toEmail = cust.email.trim();
    }
    if (!toEmail) {
      return NextResponse.json({ error: "No client email on this estimate. Add a client email first." }, { status: 400 });
    }

    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_phone,biz_email,biz_address,biz_city,biz_state,biz_zip,deposit_percent,terms_text")
      .limit(1)
      .single();

    const bizName = settings?.biz_name || "RELIC Custom Fabrications";
    const bizPhone = settings?.biz_phone || "";

    const totals = calcTotals(estimate);
    const total = totals.total;
    const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "relicbuilt.com"}`;
    const proposalUrl = `${origin}/proposal/${estimate.proposal_token}`;
    const expiresText = estimate.proposal_expires_at
      ? new Date(estimate.proposal_expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "";

    // ── Render the proposal as a PDF for the email attachment ────────
    let pdfBase64 = "";
    let pdfFilename = `Proposal-${(estimate.estimate_number || "RELIC").replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
    try {
      // Look up linked company so the proposal shows "[Client] of [Company]"
      let clientCompany: string | undefined;
      if (estimate.customer_id) {
        const { data: cust } = await supabase
          .from("customers")
          .select("company_id,company_name")
          .eq("id", estimate.customer_id)
          .single();
        if (cust?.company_name) {
          clientCompany = cust.company_name;
        } else if (cust?.company_id) {
          const { data: co } = await supabase.from("companies").select("name").eq("id", cust.company_id).single();
          if (co?.name) clientCompany = co.name;
        }
      }

      const proposalHtml = generateEstimateProposalHtml({
        estimate: estimate as Estimate & {
          proposal_highlights?: ProposalHighlight[];
          proposal_scope?: ProposalScope;
        },
        biz: settings || {},
        totals,
        clientCompany,
      });
      const pdfBuffer = await renderHtmlToPdf(proposalHtml);
      pdfBase64 = pdfBuffer.toString("base64");
      pdfFilename = `${(estimate.project_name || estimate.estimate_number || "Proposal").replace(/[^A-Za-z0-9 -]/g, "").trim() || "Proposal"}.pdf`;
    } catch (pdfErr) {
      console.error("[send-proposal-email] PDF render failed:", pdfErr);
      // Non-fatal — fall back to email-without-attachment
    }

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#222;background:#fff;">
  <div style="padding:20px 32px;border-bottom:3px solid #c4a24d;">
    <img src="https://relicbuilt.com/logo-full.png" alt="${bizName}" style="height:56px;display:block;" />
  </div>
  <div style="padding:32px;">
    <h2 style="margin:0 0 6px;font-size:22px;color:#111;">Your Proposal Is Ready</h2>
    <p style="margin:0 0 24px;color:#666;font-size:14px;">${escape(estimate.estimate_number)}</p>

    <p style="font-size:15px;color:#333;margin:0 0 20px;">
      Hi ${escape(estimate.client_name || "there")},
    </p>
    <p style="font-size:14px;color:#555;margin:0 0 18px;line-height:1.6;">
      Thanks for the opportunity to put this together. Your proposal for
      <strong>${escape(estimate.project_name || "your project")}</strong> is ready
      to review${total > 0 ? `, with a total investment of <strong>${money(total)}</strong>` : ""}.
    </p>

    ${pdfBase64 ? `
    <p style="font-size:13px;color:#666;margin:0 0 24px;padding:12px 14px;background:#f8f6f0;border:1px solid #e5e0d8;line-height:1.6;">
      📎 A PDF copy is attached to this email for your records. When you&apos;re ready, click the button below to review and sign electronically.
    </p>
    ` : ""}

    <div style="text-align:center;margin:32px 0;">
      <a href="${proposalUrl}" style="display:inline-block;background:#c4a24d;color:#0a0a0a;padding:16px 32px;text-decoration:none;font-weight:bold;letter-spacing:0.08em;font-size:14px;text-transform:uppercase;">
        Review &amp; Sign Proposal
      </a>
    </div>

    ${expiresText ? `
    <p style="font-size:13px;color:#888;margin:0 0 8px;text-align:center;">
      This proposal is valid through <strong>${expiresText}</strong>.
    </p>
    ` : ""}

    <p style="font-size:13px;color:#888;margin:24px 0 0;line-height:1.6;">
      Questions? Just reply to this email or call ${bizPhone ? escape(bizPhone) : "us"}.
    </p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">
    ${escape(bizName)}
  </div>
</div>
    `.trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${bizName} <notifications@relicbuilt.com>`,
        to: [toEmail],
        subject: `Proposal for ${estimate.project_name || estimate.estimate_number}`,
        html,
        reply_to: settings?.biz_email || "garrett@relicbuilt.com",
        ...(pdfBase64 ? {
          attachments: [{
            filename: pdfFilename,
            content: pdfBase64,
          }],
        } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err.message || `Resend returned ${res.status}` }, { status: 500 });
    }

    // Log audit event — was this the first send or a re-send?
    const { data: priorSends } = await supabase
      .from("proposal_audit_events")
      .select("id")
      .eq("estimate_id", estimate.id)
      .eq("event_type", "sent")
      .limit(1);
    const eventType = priorSends && priorSends.length > 0 ? "resent" : "sent";
    await logProposalEvent({
      supabase,
      estimateId: estimate.id,
      eventType,
      signerEmail: toEmail,
      ipAddress: ipFromHeaders(req.headers),
      userAgent: req.headers.get("user-agent") || null,
      metadata: {
        recipient: toEmail,
        proposal_token: estimate.proposal_token,
        had_pdf_attachment: !!pdfBase64,
      },
    });

    return NextResponse.json({ success: true, sent_to: toEmail });
  } catch (err) {
    console.error("[send-proposal-email] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

function escape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
