// Daily invoice balance reminder. Vercel Cron hits this once a day (see
// vercel.json). For every invoice that has a Garrett-set due_date and an
// outstanding balance, it emails the client the invoice (showing the balance
// due) on/after the due date, then repeats every reminder_interval_days
// (default 3) until the balance is paid — and notifies Garrett each time a
// balance invoice goes out. Runs with the service role; gated by CRONS_ENABLED
// (one project only) + CRON_SECRET, matching the other crons.

import { NextRequest, NextResponse } from "next/server";
import { resolveEntityProfile } from "@/lib/entity-profile";
import { generateInvoiceHtml } from "@/lib/invoice-html";
import { calcBalance, deriveStatus } from "@/lib/invoice-balance";
import type { Invoice, BusinessEntity } from "@/types/axiom";
import { axiomAdmin } from "@/lib/axiom-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_INTERVAL_DAYS = 3;
const todayStr = () => new Date().toISOString().split("T")[0];
const addDays = (isoDate: string, n: number) => {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};
const daysBetween = (fromIso: string, toIso: string) =>
  Math.floor((new Date(toIso + "T00:00:00").getTime() - new Date(fromIso + "T00:00:00").getTime()) / 86400000);

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

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

  const supabase = axiomAdmin();
  const today = todayStr();

  const { data: settings } = await supabase
    .from("settings")
    .select("biz_name,biz_email,biz_phone,relic_profile,logo_url,branding,terms_text,reminder_interval_days")
    .limit(1)
    .single();
  const interval = Number(settings?.reminder_interval_days) > 0
    ? Number(settings?.reminder_interval_days)
    : DEFAULT_INTERVAL_DAYS;
  const terms: string = settings?.terms_text || "";

  // Candidates: a due date is set and the invoice isn't marked paid. Balance
  // and cadence are re-checked per row below.
  const { data: rows } = await supabase
    .from("invoices")
    .select("*")
    .not("due_date", "is", null)
    .neq("status", "paid");

  const sentOut: { invoice: string; to: string; balance: number }[] = [];
  const errors: { invoice: string; error: string }[] = [];

  for (const inv of (rows || []) as Invoice[]) {
    const dueDate = inv.due_date;
    if (!dueDate || dueDate > today) continue;            // not due yet
    if (deriveStatus(inv) === "paid") continue;            // nothing owed
    const balance = calcBalance(inv);
    if (balance <= 0.005) continue;
    if (!inv.client_email) continue;

    // Cadence: first send on/after the due date; then every `interval` days
    // measured from the last reminder.
    const last = inv.last_reminder_sent;
    const dueToSend = !last ? true : daysBetween(last, today) >= interval;
    if (!dueToSend) continue;

    const profile = resolveEntityProfile(inv.entity as BusinessEntity | undefined, settings);
    const html = generateInvoiceHtml(inv, terms, true, profile);
    const subject = `Balance due — Invoice ${inv.invoice_number} from ${profile.name}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${profile.fromName} <${profile.fromEmail}>`,
        to: [inv.client_email],
        subject,
        html,
        reply_to: profile.email || settings?.biz_email || "garrett@relicbuilt.com",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      errors.push({ invoice: inv.invoice_number, error: t.slice(0, 200) });
      continue;
    }

    // Advance the cadence on the invoice.
    await supabase.from("invoices").update({
      reminders_sent: (inv.reminders_sent || 0) + 1,
      last_reminder_sent: today,
      next_reminder_date: addDays(today, interval),
      updated_at: new Date().toISOString(),
    }).eq("id", inv.id);

    // Notify Garrett that a balance invoice went out. Email to the business
    // address + a Recent Activity row. Best-effort — never fails the run.
    const notifyTo = profile.email || settings?.biz_email;
    if (notifyTo) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${profile.fromName} <${profile.fromEmail}>`,
          to: [notifyTo],
          subject: `Balance invoice sent — ${inv.invoice_number} (${money(balance)})`,
          html: `<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;">A balance invoice was just emailed to the client.</p>
<ul style="font-family:Arial,sans-serif;font-size:14px;color:#333;">
  <li><strong>Invoice:</strong> ${inv.invoice_number}</li>
  <li><strong>Client:</strong> ${inv.client_name || ""} &lt;${inv.client_email}&gt;</li>
  <li><strong>Balance due:</strong> ${money(balance)}</li>
  <li><strong>Due date:</strong> ${dueDate}</li>
  <li><strong>Reminder #:</strong> ${(inv.reminders_sent || 0) + 1}</li>
</ul>`,
        }),
      }).catch(() => {});
    }
    await supabase.from("activity_log").insert({
      action: "sent",
      entity: "invoice",
      entity_id: inv.id,
      label: `Balance invoice ${inv.invoice_number} sent to ${inv.client_email} (${money(balance)} due)`,
      user_name: "system (due-date reminder)",
    }).then(() => {}, () => {});

    sentOut.push({ invoice: inv.invoice_number, to: inv.client_email, balance });
  }

  return NextResponse.json({ ok: true, interval_days: interval, sent: sentOut.length, sentOut, errors });
}
