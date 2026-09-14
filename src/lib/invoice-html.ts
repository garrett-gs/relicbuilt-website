import { Invoice, InvoiceLineItem } from "@/types/axiom";
import { EntityProfile } from "@/lib/entity-profile";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function esc(s: string | number | undefined | null) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d?: string) {
  return d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";
}

export function generateInvoiceHtml(inv: Invoice, terms = "", forEmail = false, profile?: EntityProfile): string {
  const lineItems: InvoiceLineItem[] = inv.line_items && inv.line_items.length > 0 ? inv.line_items : [];
  const subtotal =
    lineItems.length > 0
      ? lineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0)
      : (inv.subtotal || 0) + (inv.delivery_fee || 0);
  const discountAmt = inv.discount || 0;
  const taxable = subtotal - discountAmt;
  const taxAmt = taxable * ((inv.tax_rate || 0) / 100);
  const total = taxable + taxAmt;
  const paid = (inv.payments || []).reduce((s, p) => s + p.amount, 0);
  const balance = total - paid;
  const amountDue = balance > 0 ? balance : total;

  const bizName = profile?.name || "Wallflower RELIC";
  const logoUrl = profile ? (profile.logoUrl || "") : "https://relicbuilt.com/wr-logo-black.png";
  const website = profile ? (profile.website || "") : "wallflower-relic.com";
  const footer = profile?.footer || "Wallflower RELIC  ·  (402) 235-8179  ·  wallflower-relic.com";
  const accent = profile?.accent || "#5b642e";
  const stripeColor = profile?.accentDark || "#454d23";

  const wrap = forEmail
    ? `style="max-width:680px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;"`
    : `style="max-width:760px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;padding:48px;"`;

  const addressLine2 = [profile?.city, profile?.state, profile?.zip].filter(Boolean).join(", ");

  return `
<div ${wrap}>

  <!-- Header: full logo left, INVOICE + address right -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:28px;">
    ${logoUrl
      ? `<img src="${logoUrl}" alt="${esc(bizName)}" style="height:36px;object-fit:contain;" />`
      : `<p style="margin:0;font-size:22px;font-weight:bold;color:#111;letter-spacing:0.04em;">${esc(bizName)}</p>`}
    <div style="text-align:right;">
      <h1 style="margin:0 0 10px;font-size:32px;font-weight:bold;color:#111;letter-spacing:0.04em;">INVOICE</h1>
      <p style="margin:0;font-size:13px;font-weight:bold;color:#222;">${esc(bizName)}</p>
      ${profile?.address ? `<p style="margin:2px 0;font-size:12px;color:#666;">${esc(profile.address)}</p>` : ""}
      ${addressLine2 ? `<p style="margin:2px 0;font-size:12px;color:#666;">${esc(addressLine2)}</p>` : ""}
      ${(profile?.city || profile?.state) ? `<p style="margin:2px 0;font-size:12px;color:#666;">United States</p>` : ""}
      ${profile?.phone ? `<p style="margin:6px 0 0;font-size:12px;color:#666;">${esc(profile.phone)}</p>` : ""}
      ${website ? `<p style="margin:2px 0;font-size:12px;color:#666;">${esc(website)}</p>` : ""}
    </div>
  </div>

  <!-- Thin rule -->
  <div style="border-top:1px solid #e5e5e5;margin-bottom:28px;"></div>

  <!-- Bill To / Invoice Meta — no boxes -->
  <div style="display:flex;gap:40px;margin-bottom:28px;">
    <div style="flex:1;">
      <p style="margin:0 0 10px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.14em;color:${accent};">Bill To</p>
      <p style="margin:0;font-size:15px;font-weight:bold;color:#111;">${esc(inv.client_name)}</p>
      ${inv.client_phone ? `<p style="margin:4px 0 0;font-size:13px;color:#555;">${esc(inv.client_phone)}</p>` : ""}
      ${inv.client_email ? `<p style="margin:2px 0 0;font-size:13px;color:#555;">${esc(inv.client_email)}</p>` : ""}
      ${inv.description ? `<p style="margin:8px 0 0;font-size:12px;color:#888;">${esc(inv.description)}</p>` : ""}
    </div>
    <div style="flex:1;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr><td style="padding:3px 0;color:#666;font-weight:600;">Invoice Number:</td><td style="padding:3px 0;text-align:right;font-weight:bold;">${esc(inv.invoice_number)}</td></tr>
        ${inv.reference_number ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">P.O./S.O. Number:</td><td style="padding:3px 0;text-align:right;">${esc(inv.reference_number)}</td></tr>` : ""}
        ${inv.issued_date ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">Invoice Date:</td><td style="padding:3px 0;text-align:right;">${fmtDate(inv.issued_date)}</td></tr>` : ""}
        ${inv.due_date ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">Payment Due:</td><td style="padding:3px 0;text-align:right;">${fmtDate(inv.due_date)}</td></tr>` : ""}
      </table>
      <div style="background:#f0f0f0;padding:10px 14px;display:flex;justify-content:space-between;margin-top:12px;">
        <span style="font-size:13px;font-weight:bold;color:#000;">Amount Due (USD):</span>
        <span style="font-size:14px;font-weight:bold;font-family:monospace;color:#000;">${money(amountDue)}</span>
      </div>
    </div>
  </div>

  <!-- Gold Items bar — full width -->
  <div style="background:${stripeColor};padding:10px 20px;margin-bottom:0;">
    <p style="margin:0;font-size:11px;font-weight:bold;color:#fff;text-transform:uppercase;letter-spacing:0.14em;">Items</p>
  </div>

  <!-- Line items — single row per item -->
  ${lineItems.length > 0
    ? lineItems.map((li) => `
  <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 20px;border-bottom:1px solid #f0f0f0;">
    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;margin-right:24px;">
      ${li.category ? `<span style="font-size:13px;font-weight:bold;color:#111;white-space:nowrap;">${esc(li.category)}</span>` : ""}
      ${li.category && li.description ? `<span style="color:#ccc;">—</span>` : ""}
      ${li.description ? `<span style="font-size:13px;color:#444;">${esc(li.description)}</span>` : ""}
    </div>
    <span style="font-size:13px;font-weight:bold;font-family:monospace;white-space:nowrap;">${money((li.quantity || 0) * (li.unit_price || 0))}</span>
  </div>`).join("")
    : `<div style="padding:16px 20px;color:#bbb;font-size:13px;">No line items</div>`}

  <!-- Thin rule before totals -->
  <div style="border-top:1px solid #e5e5e5;margin:8px 0 20px;"></div>

  <!-- Totals — right-aligned, no outer border -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
    <table style="width:300px;font-size:13px;border-collapse:collapse;">
      ${(discountAmt > 0 || inv.tax_rate > 0) ? `<tr><td style="padding:4px 0;color:#777;">Subtotal:</td><td style="padding:4px 0;text-align:right;font-family:monospace;">${money(subtotal)}</td></tr>` : ""}
      ${discountAmt > 0 ? `<tr><td style="padding:4px 0;color:#777;">Discount:</td><td style="padding:4px 0;text-align:right;font-family:monospace;color:#22c55e;">-${money(discountAmt)}</td></tr>` : ""}
      ${inv.tax_rate > 0 ? `<tr><td style="padding:4px 0;color:#777;">Tax (${inv.tax_rate}%):</td><td style="padding:4px 0;text-align:right;font-family:monospace;">${money(taxAmt)}</td></tr>` : ""}
      <tr style="border-top:1px solid #ddd;">
        <td style="padding:8px 0 4px;font-weight:bold;color:#111;">Total:</td>
        <td style="padding:8px 0 4px;text-align:right;font-family:monospace;font-weight:bold;">${money(total)}</td>
      </tr>
      ${paid > 0 ? `<tr><td style="padding:4px 0;color:#22c55e;">Paid:</td><td style="padding:4px 0;text-align:right;font-family:monospace;color:#22c55e;">${money(paid)}</td></tr>` : ""}
      <tr>
        <td colspan="2" style="padding-top:8px;">
          <div style="background:#f0f0f0;padding:10px 14px;display:flex;justify-content:space-between;">
            <span style="font-size:13px;font-weight:bold;">Amount Due (USD):</span>
            <span style="font-size:14px;font-weight:bold;font-family:monospace;">${money(amountDue)}</span>
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Payment Terms — per-invoice notes (deposit / balance / paid in full) -->
  ${inv.notes ? `
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Payment Terms</p>
    <p style="margin:0;font-size:12px;color:#444;white-space:pre-wrap;line-height:1.7;">${esc(inv.notes)}</p>
  </div>` : ""}

  <!-- Terms -->
  ${terms ? `
  <div style="margin-top:${inv.notes ? "16" : "28"}px;padding-top:16px;border-top:1px solid #eee;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Terms</p>
    <p style="margin:0;font-size:12px;color:#888;white-space:pre-wrap;line-height:1.7;">${esc(terms)}</p>
  </div>` : ""}

  <!-- Footer -->
  <div style="margin-top:36px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#ccc;text-align:center;">
    ${esc(footer)}
  </div>

</div>`;
}
