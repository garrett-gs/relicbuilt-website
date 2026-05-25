// Sends a preview of the team payment-notification email to a single
// recipient using fake invoice data. Mirrors the HTML from
// src/lib/notify-payment-team.ts so what arrives is what production sends.
//
// Run:
//   node --env-file=.env.local scripts/preview-payment-email.mjs
//
// Override defaults with env vars:
//   PREVIEW_TO=garrett@relicbuilt.com (default)
//   PREVIEW_METHOD=card | ach | manual (default "card")

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error(
    "RESEND_API_KEY is not set. Run with `node --env-file=.env.local ...` " +
    "or export the key in your shell.",
  );
  process.exit(1);
}

const TO = process.env.PREVIEW_TO || "garrett@relicbuilt.com";
const METHOD = process.env.PREVIEW_METHOD || "card";
const BIZ_NAME = "RELIC";
const ORIGIN = "https://relicbuilt.com";

const fakePayment = {
  invoiceNumber: "INV-2026-PREVIEW",
  clientName: "Mary Watson",
  description: "Walnut Kitchen Island — Deposit",
  invoiceType: "deposit",
  amount: 4250,
  method: METHOD,
};

function money(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

function methodLabel(method) {
  if (method === "ach" || method === "us_bank_account") return "ACH Bank Transfer";
  if (method === "manual") return "Recorded in Axiom (Offline)";
  return "Card";
}

const dateFormatted = new Date().toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const isAch = fakePayment.method === "ach" || fakePayment.method === "us_bank_account";
const invoiceUrl = `${ORIGIN}/axiom/invoices`;

const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;background:#fff;">
  <div style="padding:18px 28px;border-bottom:3px solid #c4a24d;">
    <img src="https://relicbuilt.com/logo-full.png" alt="${BIZ_NAME}" style="height:42px;display:block;" />
  </div>
  <div style="padding:28px;">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#888;">Payment Received <span style="color:#c4a24d;">(preview)</span></p>
    <h2 style="margin:0 0 18px;font-size:22px;color:#111;font-family:monospace;">${money(fakePayment.amount)}</h2>
    <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:#666;">Invoice:</td><td style="padding:6px 0;text-align:right;font-family:monospace;">${fakePayment.invoiceNumber}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Client:</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fakePayment.clientName}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Project:</td><td style="padding:6px 0;text-align:right;">${fakePayment.description}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Method:</td><td style="padding:6px 0;text-align:right;">${methodLabel(fakePayment.method)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Type:</td><td style="padding:6px 0;text-align:right;text-transform:capitalize;">${fakePayment.invoiceType}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Date:</td><td style="padding:6px 0;text-align:right;">${dateFormatted}</td></tr>
    </table>
    ${isAch ? `
    <p style="margin:0 0 16px;padding:10px 14px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;font-size:12px;line-height:1.5;">
      ACH transfers take 3–5 business days to fully clear. The invoice is marked paid in Axiom, but the funds may not appear in your bank until settlement.
    </p>` : ""}
    <a href="${invoiceUrl}" style="display:inline-block;background:#c4a24d;color:#0a0a0a;padding:12px 24px;text-decoration:none;font-weight:bold;letter-spacing:0.06em;font-size:13px;text-transform:uppercase;">
      Open in Axiom →
    </a>
    <p style="margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:14px;">
      This is a PREVIEW sent by scripts/preview-payment-email.mjs. No real payment was processed.
    </p>
  </div>
</div>`.trim();

const subject = `[PREVIEW] Payment Received — ${money(fakePayment.amount)} from ${fakePayment.clientName} (${fakePayment.invoiceNumber})`;

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: `${BIZ_NAME} <notifications@relicbuilt.com>`,
    to: [TO],
    subject,
    html,
  }),
});

const body = await res.text();
console.log(`Resend response: ${res.status}`);
console.log(body);

if (!res.ok) {
  console.error(`Preview send FAILED. Status ${res.status}.`);
  process.exit(1);
}
console.log(`Preview email sent to ${TO} (method=${METHOD}).`);
