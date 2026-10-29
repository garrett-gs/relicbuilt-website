// Daily proposal nudge. Vercel Cron hits this once a day (see vercel.json).
// For every proposal that was sent but not yet signed or declined, it sends a
// gentle "still on the table?" reminder on a fixed cadence (day 3, then day 7)
// and stops — never nagging past two nudges, and never once the client acts.
// Each send is logged as a "nudged" proposal_audit_event so the cadence is
// idempotent across runs. Runs with the service role; gated by CRONS_ENABLED
// (one project only) + CRON_SECRET, matching the other crons.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveEntityProfile } from "@/lib/entity-profile";
import type { BusinessEntity } from "@/types/axiom";

export const runtime = "nodejs";
export const maxDuration = 60;

// Nudge n fires once the proposal is >= afterDays old AND n-1 nudges have gone.
const NUDGE_SCHEDULE = [
  { number: 1, afterDays: 3 },
  { number: 2, afterDays: 7 },
];
// Don't start nudging proposals older than this — a month-old unsigned proposal
// is effectively dead, and we don't want a launch to blast stale ones.
const STOP_AFTER_DAYS = 14;

function entityBase(entity: string | undefined): string {
  return entity === "relic" ? "https://axiom.relicbuilt.com" : "https://axiom.wallflower-relic.com";
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function nudgeHtml(opts: {
  bizName: string; accent: string; logoUrl?: string;
  clientName: string; projectName: string; proposalUrl: string;
}): string {
  const { bizName, accent, logoUrl, clientName, projectName, proposalUrl } = opts;
  const header = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(bizName)}" style="height:34px;display:block;" />`
    : `<span style="font-size:19px;font-weight:bold;letter-spacing:0.22em;color:#1b1b1b;">${esc(bizName)}</span>`;
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#333;">
  <div style="padding:20px 32px;border-top:4px solid ${accent};border-bottom:1px solid #ece6db;">
    ${header}
  </div>
  <div style="padding:34px 36px;">
    <p style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${accent};font-weight:bold;margin:0 0 10px;">Your proposal is waiting</p>
    <h1 style="font-size:24px;line-height:1.15;color:#1b1b1b;margin:0 0 18px;">Ready when you are.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${esc(clientName || "there")},</p>
    <p style="font-size:15px;line-height:1.62;margin:0 0 16px;">Circling back on your proposal for <strong style="color:#1b1b1b;">${esc(projectName || "your project")}</strong>. It&rsquo;s ready to review and sign whenever the timing feels right.</p>
    <p style="font-size:15px;line-height:1.62;margin:0 0 24px;">If a question is holding things up, just reply here and I&rsquo;ll get you an answer. Otherwise, signing takes about a minute with the button below, and we&rsquo;ll get your build on the calendar.</p>
    <div style="margin:4px 0 10px;">
      <a href="${esc(proposalUrl)}" style="display:inline-block;background:${accent};color:#1b1b1b;font-weight:bold;font-size:14px;letter-spacing:0.06em;text-transform:uppercase;padding:15px 30px;text-decoration:none;">Review &amp; Sign</a>
    </div>
    <p style="font-size:12.5px;color:#6b655d;margin:2px 0 22px;">Opens your proposal to read and sign electronically &mdash; no account needed.</p>
    <p style="font-size:15px;color:#1b1b1b;margin:0;">&mdash; Garrett, ${esc(bizName)}</p>
  </div>
  <div style="border-top:1px solid #ece6db;padding:16px 36px;font-size:11px;color:#999;">
    ${esc(bizName)} &middot; Reply to this email with any questions.
  </div>
</div>`.trim();
}

export async function GET(req: NextRequest) {
  if (process.env.CRONS_ENABLED !== "true") {
    return Response.json({ skipped: true });
  }
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: settings } = await supabase
    .from("settings")
    .select("biz_name,biz_email,biz_phone,relic_profile,logo_url,branding")
    .limit(1)
    .single();

  // Pending proposals: sent, has a token + a recipient, not yet acted on.
  const { data: ests } = await supabase
    .from("estimates")
    .select("id, estimate_number, project_name, client_name, client_email, entity, proposal_token, status")
    .eq("status", "sent")
    .not("proposal_token", "is", null);

  const now = Date.now();
  const sent: { estimate: string; nudge: number; to: string }[] = [];
  const errors: { estimate: string; error: string }[] = [];

  for (const e of (ests || []) as Array<{
    id: string; estimate_number: string; project_name?: string; client_name?: string;
    client_email?: string; entity?: BusinessEntity; proposal_token: string; status: string;
  }>) {
    if (!e.client_email) continue;

    const { data: ev } = await supabase
      .from("proposal_audit_events")
      .select("event_type, created_at")
      .eq("estimate_id", e.id);
    const events = ev || [];

    // Already acted on → never nudge.
    if (events.some((x) => ["signed", "declined", "deposit_paid"].includes(x.event_type))) continue;

    const sendTimes = events
      .filter((x) => x.event_type === "sent" || x.event_type === "resent")
      .map((x) => new Date(x.created_at).getTime());
    if (!sendTimes.length) continue;
    const lastSend = Math.max(...sendTimes);
    const days = (now - lastSend) / 86400000;
    if (days > STOP_AFTER_DAYS) continue;

    const nudgeCount = events.filter((x) => x.event_type === "nudged").length;
    const due = NUDGE_SCHEDULE.find((s) => s.number === nudgeCount + 1 && days >= s.afterDays);
    if (!due) continue;

    const profile = resolveEntityProfile(e.entity, settings);
    const proposalUrl = `${entityBase(e.entity)}/proposal/${e.proposal_token}`;
    const html = nudgeHtml({
      bizName: profile.name,
      accent: profile.accent,
      logoUrl: profile.logoUrl,
      clientName: e.client_name || "",
      projectName: e.project_name || "",
      proposalUrl,
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${profile.fromName} <${profile.fromEmail}>`,
        to: [e.client_email],
        subject: "Still on the table?",
        html,
        reply_to: profile.email || settings?.biz_email || "garrett@relicbuilt.com",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      errors.push({ estimate: e.estimate_number, error: t.slice(0, 200) });
      continue;
    }

    await supabase.from("proposal_audit_events").insert({
      estimate_id: e.id,
      event_type: "nudged",
      signer_email: e.client_email,
      metadata: { nudge_number: due.number, proposal_token: e.proposal_token },
    });
    sent.push({ estimate: e.estimate_number, nudge: due.number, to: e.client_email });
  }

  return NextResponse.json({ ok: true, nudged: sent.length, sent, errors });
}
