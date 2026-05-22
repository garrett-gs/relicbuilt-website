import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side helper that emails the team when a payment lands. Used by
// both the Stripe-redirect path (confirm-payment) and the manual
// "Mark Deposit Paid" path (mark-deposit-paid) — so any way an invoice
// transitions to paid, Garrett hears about it.
//
// Best-effort: never throws. Logs Resend HTTP failures with status + body
// and the resolved recipient list so a silent regression is detectable.

export type PaymentMethod = "card" | "ach" | "us_bank_account" | "manual";

interface NotifyPaymentTeamArgs {
  supabase: SupabaseClient;
  invoiceNumber: string;
  clientName: string | null;
  clientEmail?: string | null;
  description?: string | null;
  invoiceType?: string | null;
  amount: number;
  method: PaymentMethod;
  // Used to build the "Open in Axiom" CTA link. Pass req.headers.get("origin")
  // or a host-derived URL from the calling route.
  origin?: string | null;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

function methodLabel(method: PaymentMethod): string {
  if (method === "ach" || method === "us_bank_account") return "ACH Bank Transfer";
  if (method === "manual") return "Recorded in Axiom (Offline)";
  return "Card";
}

export async function notifyPaymentTeam(args: NotifyPaymentTeamArgs): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[notify-payment-team] RESEND_API_KEY missing — skipping email");
    return;
  }

  try {
    const { data: settings } = await args.supabase
      .from("settings")
      .select("biz_name,biz_email,team_members")
      .limit(1)
      .single();

    const teamMembers = (settings?.team_members || []) as Array<{
      email?: string;
      notifications?: { portal_updates?: boolean };
    }>;
    const recipients = new Set<string>();
    if (settings?.biz_email) recipients.add(settings.biz_email.trim());
    for (const m of teamMembers) {
      if (m.notifications?.portal_updates && m.email) recipients.add(m.email.trim());
    }
    // Always include the canonical RELIC inbox so a misconfigured settings
    // row can never make this alert silently no-op.
    recipients.add("garrett@relicbuilt.com");

    const bizName = settings?.biz_name || "RELIC";
    const origin = args.origin || "https://relicbuilt.com";
    const invoiceUrl = `${origin}/axiom/invoices`;
    const dateFormatted = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const isAch = args.method === "ach" || args.method === "us_bank_account";

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;background:#fff;">
  <div style="padding:18px 28px;border-bottom:3px solid #c4a24d;">
    <img src="https://relicbuilt.com/logo-full.png" alt="${bizName}" style="height:42px;display:block;" />
  </div>
  <div style="padding:28px;">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#888;">Payment Received</p>
    <h2 style="margin:0 0 18px;font-size:22px;color:#111;font-family:monospace;">${money(args.amount)}</h2>
    <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:#666;">Invoice:</td><td style="padding:6px 0;text-align:right;font-family:monospace;">${args.invoiceNumber}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Client:</td><td style="padding:6px 0;text-align:right;font-weight:600;">${args.clientName || "—"}</td></tr>
      ${args.description ? `<tr><td style=\"padding:6px 0;color:#666;\">Project:</td><td style=\"padding:6px 0;text-align:right;\">${args.description}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#666;">Method:</td><td style="padding:6px 0;text-align:right;">${methodLabel(args.method)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Type:</td><td style="padding:6px 0;text-align:right;text-transform:capitalize;">${args.invoiceType || "standard"}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Date:</td><td style="padding:6px 0;text-align:right;">${dateFormatted}</td></tr>
    </table>
    ${isAch ? `
    <p style="margin:0 0 16px;padding:10px 14px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;font-size:12px;line-height:1.5;">
      ACH transfers take 3–5 business days to fully clear. The invoice is marked paid in Axiom, but the funds may not appear in your bank until settlement.
    </p>` : ""}
    <a href="${invoiceUrl}" style="display:inline-block;background:#c4a24d;color:#0a0a0a;padding:12px 24px;text-decoration:none;font-weight:bold;letter-spacing:0.06em;font-size:13px;text-transform:uppercase;">
      Open in Axiom →
    </a>
  </div>
</div>`.trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${bizName} <notifications@relicbuilt.com>`,
        to: Array.from(recipients),
        subject: `Payment Received — ${money(args.amount)} from ${args.clientName || "client"} (${args.invoiceNumber})`,
        html,
        reply_to: args.clientEmail || undefined,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "<no body>");
      console.error(
        "[notify-payment-team] Resend rejected:",
        res.status,
        errBody,
        "recipients:",
        Array.from(recipients),
      );
    }
  } catch (err) {
    console.error("[notify-payment-team] failed:", err);
  }
}
