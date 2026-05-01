import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderHtmlToPdf } from "@/lib/render-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AuditEvent {
  id: string;
  event_type: string;
  signer_name: string | null;
  signer_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  document_hash: string | null;
  document_snapshot_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string): { date: string; time: string; full: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" }),
    full: d.toISOString(),
  };
}

function eventLabel(t: string): string {
  switch (t) {
    case "sent": return "Proposal Emailed";
    case "resent": return "Proposal Re-sent";
    case "viewed": return "Proposal Opened by Client";
    case "signed": return "Electronically Signed";
    case "deposit_paid": return "Deposit Paid";
    case "voided": return "Proposal Voided";
    default: return t;
  }
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

/**
 * Generate a formal audit-trail certificate as a PDF.
 * Lists every recorded event for the estimate's proposal lifecycle:
 * sent → viewed → signed → deposit paid. Includes IP, user agent,
 * document hash, and links to the signed snapshot for the "signed"
 * event so the merchant can produce a defensible record on demand.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ estimate_id: string }> }) {
  try {
    const { estimate_id } = await ctx.params;
    if (!estimate_id) return NextResponse.json({ error: "estimate_id required" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const [{ data: estimate }, { data: events }, { data: settings }] = await Promise.all([
      supabase.from("estimates").select("*").eq("id", estimate_id).single(),
      supabase.from("proposal_audit_events").select("*").eq("estimate_id", estimate_id).order("created_at", { ascending: true }),
      supabase.from("settings").select("biz_name,biz_phone,biz_email,biz_address,biz_city,biz_state,biz_zip").limit(1).single(),
    ]);

    if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

    const bizName = settings?.biz_name || "RELIC Custom Fabrications";
    const bizPhone = settings?.biz_phone || "";
    const bizEmail = settings?.biz_email || "";
    const generatedAt = fmtDate(new Date().toISOString());

    const signedEvent = (events as AuditEvent[] | null)?.find((e) => e.event_type === "signed");

    const eventsHtml = (events && events.length > 0)
      ? events.map((e: AuditEvent, i: number) => {
          const t = fmtDate(e.created_at);
          return `
            <tr style="border-top:1px solid #e5e0d8;">
              <td style="padding:14px 16px;vertical-align:top;font-family:monospace;font-size:11px;color:#666;width:36px;">${i + 1}.</td>
              <td style="padding:14px 16px;vertical-align:top;">
                <p style="margin:0 0 4px;font-weight:bold;font-size:14px;color:#111;">${esc(eventLabel(e.event_type))}</p>
                <p style="margin:0 0 8px;font-size:11px;color:#999;font-family:monospace;">${esc(t.full)}</p>
                <p style="margin:0;font-size:12px;color:#444;">${esc(t.date)} at ${esc(t.time)}</p>
                ${e.signer_name ? `<p style="margin:6px 0 0;font-size:12px;color:#444;"><strong>Signed by:</strong> ${esc(e.signer_name)}</p>` : ""}
                ${e.signer_email ? `<p style="margin:2px 0 0;font-size:12px;color:#444;"><strong>Email:</strong> ${esc(e.signer_email)}</p>` : ""}
                ${e.ip_address ? `<p style="margin:2px 0 0;font-size:11px;color:#666;font-family:monospace;"><strong style="font-family:Arial,sans-serif;">IP:</strong> ${esc(e.ip_address)}</p>` : ""}
                ${e.user_agent ? `<p style="margin:2px 0 0;font-size:10px;color:#888;word-break:break-all;"><strong style="font-family:Arial,sans-serif;font-size:11px;">User Agent:</strong> ${esc(e.user_agent)}</p>` : ""}
                ${e.document_hash ? `<p style="margin:6px 0 0;font-size:10px;color:#666;font-family:monospace;word-break:break-all;"><strong style="font-family:Arial,sans-serif;font-size:11px;">Document SHA-256:</strong> ${esc(e.document_hash)}</p>` : ""}
                ${e.document_snapshot_url ? `<p style="margin:4px 0 0;font-size:11px;"><a href="${esc(e.document_snapshot_url)}" style="color:#c4a24d;">View signed document snapshot ↗</a></p>` : ""}
              </td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="2" style="padding:24px;text-align:center;color:#888;font-style:italic;">No audit events recorded yet.</td></tr>`;

    const totalAmount = ((estimate.line_items as Array<{ quantity?: number; unit_price?: number }> | null) || []).reduce(
      (s: number, li: { quantity?: number; unit_price?: number }) => s + (li.quantity || 0) * (li.unit_price || 0),
      0,
    ) + ((estimate.labor_items as Array<{ cost?: number }> | null) || []).reduce(
      (s: number, li: { cost?: number }) => s + (li.cost || 0),
      0,
    );
    const total = Math.round(totalAmount * (1 + (estimate.markup_percent || 0) / 100) * 100) / 100;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Audit Trail — ${esc(estimate.estimate_number)}</title>
  <style>
    body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; color: #222; }
    @page { margin: 0.5in; }
  </style>
</head>
<body>
  <div style="max-width: 720px; margin: 0 auto; padding: 32px 40px;">

    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c4a24d;padding-bottom:20px;margin-bottom:32px;">
      <div>
        <img src="https://relicbuilt.com/logo-full.png" alt="${esc(bizName)}" style="height:60px;display:block;margin-bottom:8px;" />
        <p style="margin:0;font-size:11px;color:#666;line-height:1.5;">
          ${esc(bizName)}<br/>
          ${esc([settings?.biz_address, [settings?.biz_city, settings?.biz_state].filter(Boolean).join(", "), settings?.biz_zip].filter(Boolean).join(" · "))}<br/>
          ${esc(bizPhone)}${bizPhone && bizEmail ? " · " : ""}${esc(bizEmail)}
        </p>
      </div>
      <div style="text-align:right;">
        <h1 style="margin:0;font-size:22px;text-transform:uppercase;letter-spacing:2px;color:#111;">Audit Trail</h1>
        <p style="margin:4px 0 0;font-size:11px;color:#999;font-family:monospace;">Certificate of Electronic Signature</p>
      </div>
    </div>

    <!-- Document Summary -->
    <div style="background:#fafafa;border:1px solid #e5e0d8;padding:20px 24px;margin-bottom:28px;">
      <p style="margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#888;">Document</p>
      <p style="margin:0 0 12px;font-size:16px;font-weight:bold;color:#111;">${esc(estimate.project_name || "Untitled")}</p>
      <table style="width:100%;font-size:12px;">
        <tr><td style="padding:3px 0;color:#666;">Proposal Number:</td><td style="padding:3px 0;text-align:right;font-family:monospace;color:#111;">${esc(estimate.estimate_number)}</td></tr>
        <tr><td style="padding:3px 0;color:#666;">Client:</td><td style="padding:3px 0;text-align:right;color:#111;">${esc(estimate.client_name || "—")}</td></tr>
        ${estimate.client_email ? `<tr><td style="padding:3px 0;color:#666;">Client Email:</td><td style="padding:3px 0;text-align:right;color:#111;">${esc(estimate.client_email)}</td></tr>` : ""}
        <tr><td style="padding:3px 0;color:#666;">Total Amount:</td><td style="padding:3px 0;text-align:right;font-family:monospace;color:#111;">${money(total)}</td></tr>
        <tr><td style="padding:3px 0;color:#666;">Status:</td><td style="padding:3px 0;text-align:right;color:#111;text-transform:capitalize;">${esc(estimate.proposal_status || estimate.status)}</td></tr>
      </table>
    </div>

    <!-- Signature Summary (if signed) -->
    ${signedEvent ? `
    <div style="border:2px solid #22c55e;background:#f0fdf4;padding:20px 24px;margin-bottom:28px;">
      <p style="margin:0 0 6px;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#15803d;font-weight:bold;">✓ Electronically Signed</p>
      <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#111;font-family:Georgia,serif;font-style:italic;">${esc(signedEvent.signer_name || "")}</p>
      <p style="margin:0;font-size:12px;color:#444;">${esc(fmtDate(signedEvent.created_at).date)} at ${esc(fmtDate(signedEvent.created_at).time)}</p>
      ${signedEvent.ip_address ? `<p style="margin:4px 0 0;font-size:11px;color:#666;">From IP ${esc(signedEvent.ip_address)}</p>` : ""}
    </div>
    ` : ""}

    <!-- Events table -->
    <h2 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:2px;color:#666;font-weight:bold;">Event Log</h2>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e0d8;">
      <thead>
        <tr style="background:#fafafa;">
          <th style="padding:10px 16px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:1px solid #e5e0d8;">#</th>
          <th style="padding:10px 16px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:1px solid #e5e0d8;">Event</th>
        </tr>
      </thead>
      <tbody>
        ${eventsHtml}
      </tbody>
    </table>

    <!-- Legal note -->
    <div style="margin-top:32px;padding:20px 24px;background:#fafafa;border:1px solid #e5e0d8;font-size:11px;color:#666;line-height:1.7;">
      <p style="margin:0 0 8px;font-weight:bold;color:#444;">About This Certificate</p>
      <p style="margin:0 0 8px;">
        This document records the electronic signature events for the proposal listed above.
        Each event is timestamped and includes the IP address and browser fingerprint of the
        actor at the time of the event.
      </p>
      <p style="margin:0 0 8px;">
        Electronic signatures collected via this system meet the requirements of the federal
        ESIGN Act (15 U.S.C. § 7001) and the Uniform Electronic Transactions Act (UETA),
        which give an electronic record and signature the same legal effect as a handwritten
        signature.
      </p>
      <p style="margin:0;">
        The SHA-256 hash recorded for each "Signed" event is a cryptographic fingerprint of
        the document content at the moment of signing. Any later modification to the document
        would produce a different hash, allowing tampering to be detected.
      </p>
    </div>

    <!-- Footer -->
    <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e0d8;display:flex;justify-content:space-between;font-size:10px;color:#999;">
      <span>${esc(bizName)}</span>
      <span>Generated ${esc(generatedAt.date)} at ${esc(generatedAt.time)}</span>
    </div>
  </div>
</body>
</html>`;

    const pdfBuffer = await renderHtmlToPdf(html);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="audit-trail-${estimate.estimate_number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[audit-trail] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
