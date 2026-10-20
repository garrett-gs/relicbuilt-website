import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateMasterProposalHtml, composeClientAddress, type MasterProposalBuild } from "@/lib/proposal-html";
import { proposalBiz, resolveEntityProfile } from "@/lib/entity-profile";
import { renderHtmlToPdf } from "@/lib/render-pdf";
import { logProposalEvent, ipFromHeaders } from "@/lib/audit";
import type { Estimate } from "@/types/axiom";

export const runtime = "nodejs";
export const maxDuration = 60;

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

interface LineItem { quantity?: number; unit_price?: number }
interface LaborItem { cost?: number }
function calcTotals(est: { line_items?: LineItem[]; labor_items?: LaborItem[]; markup_percent?: number; adjustment?: number }) {
  const materialTotal = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const laborTotal = (est.labor_items || []).reduce((s, li) => s + (li.cost || 0), 0);
  const subtotal = materialTotal + laborTotal;
  const markupAmount = subtotal * ((est.markup_percent || 0) / 100);
  const total = Math.round((subtotal + markupAmount + (est.adjustment || 0)) * 100) / 100;
  return { materialTotal, laborTotal, markupAmount, total };
}

export async function POST(req: NextRequest) {
  try {
    const { master_project_id, subject: subjectOverride, message: messageOverride } = await req.json();
    if (!master_project_id) {
      return NextResponse.json({ error: "master_project_id required" }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: master, error: mErr } = await supabase
      .from("master_projects")
      .select("*")
      .eq("id", master_project_id)
      .single();
    if (mErr || !master) {
      return NextResponse.json({ error: "Master project not found" }, { status: 404 });
    }

    const { data: estimates } = await supabase
      .from("estimates")
      .select("*")
      .eq("master_project_id", master.id)
      .order("created_at", { ascending: true });
    const builds = (estimates || []) as Estimate[];
    if (builds.length === 0) {
      return NextResponse.json({ error: "No estimates are linked to this master project yet." }, { status: 400 });
    }

    // Resolve recipient — first build's client email, else its customer record.
    let toEmail = (builds.find((b) => b.client_email)?.client_email || "").trim();
    const customerId = builds.find((b) => b.customer_id)?.customer_id || master.customer_id || null;
    if (!toEmail && customerId) {
      const { data: cust } = await supabase.from("customers").select("email").eq("id", customerId).single();
      if (cust?.email) toEmail = cust.email.trim();
    }
    if (!toEmail) {
      return NextResponse.json({ error: "No client email on these builds. Add a client email to an estimate first." }, { status: 400 });
    }

    // Ensure a proposal token on the master, stamp sent + 30-day expiry.
    const token = master.proposal_token || `mprop_${crypto.randomUUID().replace(/-/g, "")}`;
    const sentAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    const isResend = master.proposal_status === "sent" || master.proposal_status === "approved";
    await supabase.from("master_projects").update({
      proposal_token: token,
      proposal_status: "sent",
      proposal_sent_at: sentAt,
      proposal_expires_at: expiresAt,
      updated_at: sentAt,
    }).eq("id", master.id);

    // Mirror "sent" onto each build so the estimate list reflects it and the
    // per-build expiry matches the combined one.
    await supabase.from("estimates").update({
      proposal_status: "sent",
      proposal_sent_at: sentAt,
      proposal_expires_at: expiresAt,
      updated_at: sentAt,
    }).eq("master_project_id", master.id).neq("proposal_status", "approved");

    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_phone,biz_email,biz_address,biz_city,biz_state,biz_zip,deposit_percent,terms_text,relic_profile")
      .limit(1)
      .single();

    const entity = builds[0]?.entity;
    const profile = resolveEntityProfile(entity, settings);
    const bizName = profile.name;
    const bizPhone = profile.phone || "";

    // Client company / address from the first linked customer.
    let clientCompany: string | undefined;
    let clientAddress: string | undefined;
    if (customerId) {
      const { data: cust } = await supabase.from("customers").select("company_id,company_name,address").eq("id", customerId).single();
      clientAddress = composeClientAddress(cust) || undefined;
      if (cust?.company_name) clientCompany = cust.company_name;
      else if (cust?.company_id) {
        const { data: co } = await supabase.from("companies").select("name").eq("id", cust.company_id).single();
        if (co?.name) clientCompany = co.name;
      }
    }

    const buildArgs: MasterProposalBuild[] = builds.map((e) => ({ estimate: e, totals: calcTotals(e) }));
    const grandTotal = buildArgs.reduce((s, b) => s + b.totals.total, 0);

    const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "relicbuilt.com"}`;
    const proposalUrl = `${origin}/proposal/master/${token}`;
    const expiresText = new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // ── Render combined proposal PDF ─────────────────────────────────
    let pdfBase64 = "";
    let pdfError: string | null = null;
    const pdfFilename = `${(master.name || "Proposal").replace(/[^A-Za-z0-9 -]/g, "").trim() || "Proposal"}.pdf`;
    try {
      const proposalHtml = generateMasterProposalHtml({
        masterName: master.name,
        builds: buildArgs,
        biz: proposalBiz(entity, settings),
        clientCompany,
        clientAddress,
        sentAt,
        expiresAt,
        logoUrl: entity === "relic" ? `${origin}/relic-shield-gold.png` : (profile.logoUrl || undefined),
        brandName: profile.name,
      });
      const pdfBuffer = await renderHtmlToPdf(proposalHtml);
      pdfBase64 = pdfBuffer.toString("base64");
    } catch (e) {
      pdfError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error("[send-master-proposal-email] PDF render failed:", pdfError, e);
    }

    const clientName = builds.find((b) => b.client_name)?.client_name || "there";
    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#222;background:#fff;">
  <div style="padding:20px 32px;border-bottom:3px solid ${profile.accent};">
    ${profile.logoUrl ? `<img src="${profile.logoUrl}" alt="${bizName}" style="height:36px;display:block;" />` : `<span style="font-size:20px;font-weight:bold;color:#111;">${bizName}</span>`}
  </div>
  <div style="padding:32px;">
    <h2 style="margin:0 0 6px;font-size:22px;color:#111;">Your Proposal Is Ready</h2>
    <p style="margin:0 0 24px;color:#666;font-size:14px;">${esc(master.name)} — ${builds.length} ${builds.length === 1 ? "build" : "builds"}</p>
    ${(typeof messageOverride === "string" && messageOverride.trim())
      ? renderMessage(messageOverride)
      : `
    <p style="font-size:15px;color:#333;margin:0 0 20px;">Hi ${esc(clientName)},</p>
    <p style="font-size:14px;color:#555;margin:0 0 18px;line-height:1.6;">
      Thanks for the opportunity to put this together. Your combined proposal for
      <strong>${esc(master.name)}</strong> — covering ${builds.length} ${builds.length === 1 ? "build" : "builds"} — is ready to review${grandTotal > 0 ? `, with a total investment of <strong>${money(grandTotal)}</strong>` : ""}. One signature approves them all.
    </p>`}
    ${pdfBase64 ? `
    <p style="font-size:13px;color:#666;margin:0 0 24px;padding:12px 14px;background:#f8f6f0;border:1px solid #e5e0d8;line-height:1.6;">A PDF copy is attached for your records. When you&apos;re ready, click below to review and sign electronically.</p>` : ""}
    <div style="text-align:center;margin:32px 0;">
      <a href="${proposalUrl}" style="display:inline-block;background:${profile.accent};color:#0a0a0a;padding:16px 32px;text-decoration:none;font-weight:bold;letter-spacing:0.08em;font-size:14px;text-transform:uppercase;">Review &amp; Sign Proposal</a>
    </div>
    <p style="font-size:13px;color:#888;margin:0 0 8px;text-align:center;">This proposal is valid through <strong>${expiresText}</strong>.</p>
    <p style="font-size:13px;color:#888;margin:24px 0 0;line-height:1.6;">Questions? Just reply to this email or call ${bizPhone ? esc(bizPhone) : "us"}.</p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">${esc(bizName)}</div>
</div>`.trim();

    const attachments: { filename: string; content: string }[] = [];
    if (pdfBase64) attachments.push({ filename: pdfFilename, content: pdfBase64 });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${profile.fromName} <${profile.fromEmail}>`,
        to: [toEmail],
        subject: (typeof subjectOverride === "string" && subjectOverride.trim())
          ? subjectOverride.trim()
          : `Proposal for ${master.name}`,
        html,
        reply_to: settings?.biz_email || "garrett@relicbuilt.com",
        ...(attachments.length ? { attachments } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err.message || `Resend returned ${res.status}` }, { status: 500 });
    }

    // Audit: log a sent/resent event against each build in the group.
    for (const b of builds) {
      try {
        await logProposalEvent({
          supabase,
          estimateId: b.id,
          eventType: isResend ? "resent" : "sent",
          signerEmail: toEmail,
          ipAddress: ipFromHeaders(req.headers),
          userAgent: req.headers.get("user-agent") || null,
          metadata: { recipient: toEmail, master_project_id: master.id, master_proposal_token: token, combined: true },
        });
      } catch { /* best-effort */ }
    }

    return NextResponse.json({
      success: true,
      sent_to: toEmail,
      builds: builds.length,
      total: grandTotal,
      pdf_attached: !!pdfBase64,
      proposal_url: proposalUrl,
      ...(pdfError ? { pdf_error: pdfError } : {}),
    });
  } catch (err) {
    console.error("[send-master-proposal-email] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

function renderMessage(message: string): string {
  return message.trim().split(/\n{2,}/)
    .map((p) => `<p style="font-size:14px;color:#555;margin:0 0 18px;line-height:1.6;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
