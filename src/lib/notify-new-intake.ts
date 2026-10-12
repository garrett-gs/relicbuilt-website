// New-intake notifier. Any new estimate request or Wallflower work order that
// lands in Axiom should (1) fire an immediate email to the owner and (2) get
// added to the daily reminders until it's handled. We implement (2) by creating
// a high-priority task assigned to the owner — the existing daily-task-digest
// cron (see src/app/api/cron/daily-task-digest/route.ts) then emails that task
// every morning until its status flips to "done". One intake → one task, so the
// reminder stops the moment the owner marks it complete.
//
// Best-effort by contract: callers wrap nothing — every failure here is caught
// and logged, and never blocks the intake it was triggered from.

import { createClient } from "@supabase/supabase-js";

// Owner alert address — Garrett wants every new request to hit this inbox
// directly, on top of the daily digest.
const ALERT_EMAIL = "garrett@wallflower-relic.com";

export type IntakeKind = "estimate_request" | "work_order";

export interface NewIntakeInput {
  kind: IntakeKind;
  /** Short headline — item name, project name, or requester name. */
  title: string;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  /** Free-text detail — description, scope, message, etc. */
  summary?: string | null;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const LABEL: Record<IntakeKind, string> = {
  estimate_request: "Estimate Request",
  work_order: "Work Order",
};

/**
 * Fire the owner alert + create the daily-reminder task for a new intake.
 * Resolves its own service-role client and settings — callers just describe
 * what came in. Returns a small result for logging; never throws.
 */
export async function notifyNewIntake(input: NewIntakeInput): Promise<{ emailed: boolean; task_id: string | null }> {
  const result: { emailed: boolean; task_id: string | null } = { emailed: false, task_id: null };
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    // Resolve the owner's team-member name so the assignee matches exactly what
    // the daily digest resolves back to an email (it matches on name). Falling
    // back to a literal keeps this working even before settings are populated.
    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,team_members")
      .limit(1)
      .single();
    const bizName = settings?.biz_name || "Wallflower RELIC";
    const team = (settings?.team_members || []) as Array<{ name?: string; email?: string }>;
    const owner = team.find((m) => m.email?.toLowerCase() === ALERT_EMAIL.toLowerCase());
    const assignee = owner?.name || "Garrett Schmidt";

    const label = LABEL[input.kind];
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://relicbuilt.com";
    // Where the owner goes to act on it. Work orders live on the Wallflower
    // board; estimate requests surface through the reminder task list.
    const actionPath = input.kind === "work_order" ? "/axiom/wallflower" : "/axiom/my-tasks";
    const actionUrl = `${siteUrl}${actionPath}`;

    const contactBits = [
      input.clientName ? `Client: ${input.clientName}` : "",
      input.clientEmail ? `Email: ${input.clientEmail}` : "",
      input.clientPhone ? `Phone: ${input.clientPhone}` : "",
    ].filter(Boolean);

    // ── (1) Create the daily-reminder task ───────────────────────────────
    // Priority high + due today so it reads as "act now" in the digest, and
    // stays in every morning's reminder until marked done.
    try {
      const today = new Date().toISOString().split("T")[0];
      const descLines = [
        `New ${label.toLowerCase()} received in Axiom.`,
        ...contactBits,
        input.summary ? `\n${input.summary}` : "",
        `\nStays on your daily reminders until you mark this task done.`,
      ].filter(Boolean);
      const { data: task } = await supabase
        .from("tasks")
        .insert({
          title: `New ${label}: ${input.title}`.slice(0, 180),
          description: descLines.join("\n"),
          status: "todo",
          priority: "high",
          assignee,
          due_date: today,
        })
        .select("id")
        .single();
      if (task?.id) result.task_id = task.id;
    } catch (e) {
      console.error("[notify-new-intake] task create failed:", e);
    }

    // ── (2) Immediate owner alert email ──────────────────────────────────
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const contactRows = contactBits
        .map(
          (b) =>
            `<tr><td style="padding:4px 0;color:#555;font-size:13px;">${esc(b)}</td></tr>`
        )
        .join("");
      const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;background:#fff;">
  <div style="padding:18px 28px;border-bottom:3px solid #5b642e;">
    <img src="https://relicbuilt.com/wr-logo-black.png" alt="${esc(bizName)}" style="width:220px;max-width:60%;height:auto;display:block;" />
  </div>
  <div style="padding:28px;">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#888;">New ${esc(label)}</p>
    <h2 style="margin:0 0 16px;font-size:20px;color:#111;">${esc(input.title)}</h2>
    ${contactRows ? `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${contactRows}</table>` : ""}
    ${input.summary ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;">${esc(input.summary)}</p>` : ""}
    <p style="margin:0 0 20px;font-size:13px;color:#777;">This has been added to your daily reminders and will keep showing up until it's completed.</p>
    <a href="${actionUrl}" style="display:inline-block;background:#5b642e;color:#0a0a0a;padding:12px 24px;text-decoration:none;font-weight:bold;letter-spacing:0.06em;font-size:13px;text-transform:uppercase;">
      Open in Axiom →
    </a>
  </div>
</div>`.trim();

      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${bizName} <notifications@relicbuilt.com>`,
          to: [ALERT_EMAIL],
          subject: `New ${label} — ${input.title}`,
          html,
          reply_to: input.clientEmail || undefined,
        }),
      });
      result.emailed = r.ok;
      if (!r.ok) console.error("[notify-new-intake] email failed:", r.status, await r.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[notify-new-intake] fatal:", e);
  }
  return result;
}
