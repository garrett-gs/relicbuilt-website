import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateEstimateProposalHtml } from "@/lib/proposal-html";
import { renderHtmlToPdf } from "@/lib/render-pdf";
import { logProposalEvent, ipFromHeaders, sha256 } from "@/lib/audit";
import { notifyWallflowerStatus } from "@/lib/wallflower-status";
import type { Estimate, ProposalHighlight, ProposalScope } from "@/types/axiom";

export const runtime = "nodejs";
export const maxDuration = 60;

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

/**
 * Proposals are APPROVAL-ONLY. Signing records the client's approval of the
 * scope — it does NOT create deposit/balance invoices or trigger any payment.
 * Payment/invoicing is handled in Nexus.
 */
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
      });
    }

    // Compute the total purely for the internal notification / audit record.
    const totals = calcTotals(estimate);
    const totalAmount = totals.total;

    // Load settings for biz info + team members (for the internal
    // "client signed" notification — who gets the email).
    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_phone,biz_email,team_members")
      .limit(1)
      .single();

    // ── Check expiration ─────────────────────────────────────────────
    if (estimate.proposal_expires_at) {
      const expiresAt = new Date(estimate.proposal_expires_at);
      if (Date.now() > expiresAt.getTime()) {
        return NextResponse.json({ error: "This proposal has expired. Please contact us for an updated quote." }, { status: 410 });
      }
    }

    // ── Mark estimate approved ────────────────────────────────────────
    // No invoices, no payment. Just record the approval + signature.
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

    // Tell Wallflower the client signed — no-op for non-Wallflower estimates.
    await notifyWallflowerStatus(supabase, { estimateId: estimate.id }, "accepted");

    // ── Internal notification: tell the team the client signed ────────
    // Sends an email to biz_email plus any team member with portal_updates
    // notifications enabled. Non-blocking — failures are logged and we still
    // return success to the client.
    try {
      const resendKeyInternal = process.env.RESEND_API_KEY;
      if (resendKeyInternal) {
        const teamMembers = (settings?.team_members || []) as Array<{
          name?: string;
          email?: string;
          notifications?: { portal_updates?: boolean };
        }>;
        const recipients = new Set<string>();
        if (settings?.biz_email) recipients.add(settings.biz_email.trim());
        for (const m of teamMembers) {
          if (m.notifications?.portal_updates && m.email) recipients.add(m.email.trim());
        }
        // Last-resort fallback so we never silently skip the notification.
        if (recipients.size === 0) recipients.add("garrett@relicbuilt.com");

        const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "relicbuilt.com"}`;
        const acceptedAt = new Date().toLocaleString("en-US", {
          dateStyle: "long",
          timeStyle: "short",
        });
        const bizNameInternal = settings?.biz_name || "RELIC";

        const internalHtml = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;background:#fff;">
  <div style="padding:18px 28px;border-bottom:3px solid #5b642e;">
    <img src="https://relicbuilt.com/wr-logo-black.png" alt="${esc(bizNameInternal)}" style="width:240px;max-width:60%;height:auto;display:block;" />
  </div>
  <div style="padding:28px;">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#888;">Proposal Approved</p>
    <h2 style="margin:0 0 18px;font-size:20px;color:#111;">${esc(estimate.project_name || estimate.estimate_number)}</h2>
    <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:#666;">Signed by:</td><td style="padding:6px 0;text-align:right;font-weight:600;">${esc(signatureName.trim())}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Client:</td><td style="padding:6px 0;text-align:right;">${esc(estimate.client_name || "—")}</td></tr>
      ${estimate.client_email ? `<tr><td style="padding:6px 0;color:#666;">Email:</td><td style="padding:6px 0;text-align:right;">${esc(estimate.client_email)}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#666;">Estimate:</td><td style="padding:6px 0;text-align:right;font-family:monospace;">${esc(estimate.estimate_number)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Total:</td><td style="padding:6px 0;text-align:right;font-weight:600;font-family:monospace;">${money(totalAmount)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Signed at:</td><td style="padding:6px 0;text-align:right;">${esc(acceptedAt)}</td></tr>
    </table>
    <p style="margin:0 0 20px;font-size:13px;color:#555;">
      The client approved this proposal. Open it in Axiom to proceed — payment is handled in Nexus.
    </p>
    <a href="${origin}/axiom/estimator" style="display:inline-block;background:#5b642e;color:#0a0a0a;padding:12px 24px;text-decoration:none;font-weight:bold;letter-spacing:0.06em;font-size:13px;text-transform:uppercase;">
      Open in Axiom →
    </a>
  </div>
</div>`.trim();

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKeyInternal}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${bizNameInternal} <notifications@relicbuilt.com>`,
            to: Array.from(recipients),
            subject: `Proposal Approved — ${estimate.project_name || estimate.estimate_number}`,
            html: internalHtml,
            reply_to: estimate.client_email || settings?.biz_email || "garrett@relicbuilt.com",
          }),
        });
      }
    } catch (err) {
      console.error("[approve-estimate-proposal] internal acceptance email failed:", err);
    }

    // ── Audit trail: capture signed document snapshot + hash ─────────
    // Render the proposal as it appeared to the client at signing time,
    // hash the HTML for tamper detection, and upload the PDF to storage
    // so we can produce "this is what they signed" on demand.
    let documentHash: string | null = null;
    let documentSnapshotUrl: string | null = null;
    try {
      // Look up linked company for the audit snapshot
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
        totals: { materialTotal: totals.materialTotal, laborTotal: totals.laborTotal, markupAmount: totals.markup, total: totals.total },
        clientCompany,
      });
      documentHash = sha256(proposalHtml);

      const pdfBuffer = await renderHtmlToPdf(proposalHtml);
      const path = `proposal-snapshots/${estimate.id}/${Date.now()}-signed.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("portal-images")
        .upload(path, pdfBuffer, { contentType: "application/pdf", upsert: false });
      if (!uploadErr) {
        const { data: pub } = supabase.storage.from("portal-images").getPublicUrl(path);
        documentSnapshotUrl = pub.publicUrl;
      } else {
        console.error("[approve-estimate-proposal] snapshot upload failed:", uploadErr.message);
      }
    } catch (snapErr) {
      console.error("[approve-estimate-proposal] snapshot render failed:", snapErr);
    }

    await logProposalEvent({
      supabase,
      estimateId: estimate.id,
      eventType: "signed",
      signerName: signatureName.trim(),
      signerEmail: estimate.client_email || null,
      ipAddress: ipFromHeaders(req.headers),
      userAgent: req.headers.get("user-agent") || null,
      documentHash,
      documentSnapshotUrl,
      metadata: {
        proposal_token: estimate.proposal_token,
        total_amount: totalAmount,
      },
    });

    return NextResponse.json({
      success: true,
      project_name: estimate.project_name || estimate.estimate_number,
      total_amount: totalAmount,
      biz_name: settings?.biz_name || "RELIC",
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
