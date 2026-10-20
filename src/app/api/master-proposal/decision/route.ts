import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveEntityProfile } from "@/lib/entity-profile";
import { logProposalEvent, ipFromHeaders } from "@/lib/audit";
import { notifyWallflowerStatus } from "@/lib/wallflower-status";
import { notifyNexusApproval } from "@/lib/notify-nexus-approval";
import { notifyNexusBuildLink } from "@/lib/notify-nexus-build-link";
import type { Estimate, BusinessEntity } from "@/types/axiom";

export const runtime = "nodejs";
export const maxDuration = 60;

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

interface LineItem { quantity?: number; unit_price?: number }
interface LaborItem { cost?: number }
function calcTotal(est: { line_items?: LineItem[]; labor_items?: LaborItem[]; markup_percent?: number; adjustment?: number }) {
  const mat = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const lab = (est.labor_items || []).reduce((s, li) => s + (li.cost || 0), 0);
  const subtotal = mat + lab;
  const markup = subtotal * ((est.markup_percent || 0) / 100);
  return Math.round((subtotal + markup + (est.adjustment || 0)) * 100) / 100;
}

/**
 * One build's sign-off inside a combined master proposal. The client can
 * ACCEPT a build (signs it → approved → its own project in the pipeline) or
 * DECLINE it (drops out of the proposal, flagged back to the shop to revise).
 * Each build is decided independently; the deposit is taken later over the
 * accepted set (see /api/master-proposal/deposit).
 */
export async function POST(req: NextRequest) {
  try {
    const { token, estimate_id, action, signatureName, reason } = await req.json();
    if (!token || !estimate_id || !action) {
      return NextResponse.json({ error: "token, estimate_id and action are required" }, { status: 400 });
    }
    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });
    }
    if (action === "accept" && (!signatureName || String(signatureName).trim().length < 2)) {
      return NextResponse.json({ error: "Please enter your name to sign." }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: master, error: mErr } = await supabase
      .from("master_projects")
      .select("*")
      .eq("proposal_token", token)
      .single();
    if (mErr || !master) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    if (master.proposal_expires_at && Date.now() > new Date(master.proposal_expires_at).getTime()) {
      return NextResponse.json({ error: "This proposal has expired. Please contact us for an updated quote." }, { status: 410 });
    }

    const { data: estimate, error: eErr } = await supabase
      .from("estimates")
      .select("*")
      .eq("id", estimate_id)
      .single();
    if (eErr || !estimate || estimate.master_project_id !== master.id) {
      return NextResponse.json({ error: "Build not found in this proposal" }, { status: 404 });
    }

    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_phone,biz_email,team_members,relic_profile")
      .limit(1)
      .single();
    const nowIso = new Date().toISOString();
    const total = calcTotal(estimate);

    // ── DECLINE ──────────────────────────────────────────────────────
    if (action === "decline") {
      const note = (reason || "").toString().trim();
      await supabase.from("estimates").update({
        proposal_status: "declined",
        proposal_declined_at: nowIso,
        proposal_decline_reason: note || null,
        notes: [estimate.notes || "", `Declined by client on ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}${note ? ` — “${note}”` : ""}`].filter(Boolean).join("\n"),
        updated_at: nowIso,
      }).eq("id", estimate.id);

      await logProposalEvent({
        supabase,
        estimateId: estimate.id,
        eventType: "declined",
        signerEmail: estimate.client_email || null,
        ipAddress: ipFromHeaders(req.headers),
        userAgent: req.headers.get("user-agent") || null,
        metadata: { master_project_id: master.id, reason: note || null },
      }).catch(() => {});

      notifyTeam(settings, estimate, {
        subject: `Build declined — ${estimate.project_name || estimate.estimate_number}`,
        heading: "A build was declined",
        line: `${estimate.client_name || "The client"} declined this build in the ${master.name} proposal.${note ? ` They said: “${note}”.` : ""} It stays in your estimator to revise and re-send.`,
        req,
      }).catch(() => {});

      return NextResponse.json({ ok: true, status: "declined" });
    }

    // ── ACCEPT ───────────────────────────────────────────────────────
    const signed = String(signatureName).trim();
    let projectId: string | null = (estimate.custom_work_id as string | null) ?? null;

    if (estimate.proposal_status !== "approved") {
      await supabase.from("estimates").update({
        proposal_status: "approved",
        proposal_approved_at: nowIso,
        proposal_signed_by: signed,
        status: "accepted",
        notes: [estimate.notes || "", `Signed by ${signed} on ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })} (${master.name} proposal)`].filter(Boolean).join("\n"),
        updated_at: nowIso,
      }).eq("id", estimate.id);

      await notifyWallflowerStatus(supabase, { estimateId: estimate.id }, "accepted").catch(() => {});
      await notifyNexusApproval(supabase, estimate as Estimate, signed, total).catch(() => {});
      await notifyNexusBuildLink({
        estimateId: estimate.id,
        estimateNumber: estimate.estimate_number,
        proposalToken: estimate.proposal_token || "",
        event: "approved",
        status: "approved",
        estimateAmount: total,
        approvedAt: nowIso,
        approvedBy: signed,
      }).catch(() => {});

      if (!projectId) {
        try {
          const carried = (estimate.images || estimate.proposal_images || []) as string[];
          const { data: proj } = await supabase.from("custom_work").insert({
            entity: estimate.entity || "wallflower_relic",
            project_name: estimate.project_name || estimate.estimate_number,
            client_name: estimate.client_name || "",
            client_email: estimate.client_email || null,
            client_phone: estimate.client_phone || null,
            customer_id: estimate.customer_id || null,
            master_project_id: master.id,
            quoted_amount: total,
            project_description: estimate.notes || null,
            inspiration_images: Array.isArray(carried) && carried.length ? carried : undefined,
            start_date: estimate.start_date || null,
            due_date: estimate.due_date || null,
            status: "accepted",
          }).select("id").single();
          if (proj?.id) {
            projectId = proj.id;
            await supabase.from("estimates").update({ custom_work_id: proj.id }).eq("id", estimate.id);
          }
        } catch (e) {
          console.error("[master-decision] create project failed:", e);
        }
      }

      await logProposalEvent({
        supabase,
        estimateId: estimate.id,
        eventType: "signed",
        signerName: signed,
        signerEmail: estimate.client_email || null,
        ipAddress: ipFromHeaders(req.headers),
        userAgent: req.headers.get("user-agent") || null,
        metadata: { master_project_id: master.id, total_amount: total },
      }).catch(() => {});

      notifyTeam(settings, estimate, {
        subject: `Build approved — ${estimate.project_name || estimate.estimate_number}`,
        heading: "A build was approved",
        line: `${signed} approved this build (${money(total)}) in the ${master.name} proposal. It's in your pipeline now.`,
        req,
      }).catch(() => {});
    }

    // Roll the master up to "approved" once every non-declined build is signed.
    const { data: siblings } = await supabase
      .from("estimates")
      .select("proposal_status")
      .eq("master_project_id", master.id);
    const live = (siblings || []).filter((s) => s.proposal_status !== "declined");
    const allSigned = live.length > 0 && live.every((s) => s.proposal_status === "approved");
    if (allSigned && master.proposal_status !== "approved") {
      await supabase.from("master_projects").update({
        proposal_status: "approved",
        proposal_approved_at: nowIso,
        proposal_signed_by: signed,
        updated_at: nowIso,
      }).eq("id", master.id);
    }

    return NextResponse.json({ ok: true, status: "accepted", project_id: projectId });
  } catch (err) {
    console.error("[master-proposal/decision] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

// Concise internal notification to the team (biz_email + members opted into
// portal updates). Best-effort.
async function notifyTeam(
  settings: { biz_email?: string; team_members?: Array<{ email?: string; notifications?: { portal_updates?: boolean } }>; relic_profile?: unknown } | null,
  estimate: { entity?: string; client_email?: string },
  opts: { subject: string; heading: string; line: string; req: NextRequest },
) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const recipients = new Set<string>();
  if (settings?.biz_email) recipients.add(settings.biz_email.trim());
  for (const m of settings?.team_members || []) if (m.notifications?.portal_updates && m.email) recipients.add(m.email.trim());
  if (recipients.size === 0) recipients.add("garrett@relicbuilt.com");

  const profile = resolveEntityProfile(
    estimate.entity as BusinessEntity | undefined,
    settings as Parameters<typeof resolveEntityProfile>[1],
  );
  const origin = opts.req.headers.get("origin") || `https://${opts.req.headers.get("host") || "relicbuilt.com"}`;
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111;">
  <div style="border-bottom:3px solid ${profile.accent};padding-bottom:10px;margin-bottom:16px;">
    <span style="font-weight:800;letter-spacing:.1em;">${esc(profile.name)}</span>
  </div>
  <p style="font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#888;margin:0 0 6px;">${esc(opts.heading)}</p>
  <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 18px;">${esc(opts.line)}</p>
  <a href="${origin}/axiom/projects" style="display:inline-block;background:${profile.accent};color:${profile.onAccent};padding:11px 20px;text-decoration:none;font-weight:bold;font-size:13px;text-transform:uppercase;letter-spacing:.05em;">Open Axiom →</a>
</div>`.trim();
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${profile.fromName} <${profile.fromEmail}>`,
      to: Array.from(recipients),
      subject: opts.subject,
      html,
      reply_to: estimate.client_email || settings?.biz_email || "garrett@relicbuilt.com",
    }),
  });
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
