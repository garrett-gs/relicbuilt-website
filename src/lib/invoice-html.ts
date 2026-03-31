import { Invoice, InvoiceLineItem } from "@/types/axiom";

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

interface BizInfo {
  biz_name?: string;
  biz_address?: string;
  biz_city?: string;
  biz_state?: string;
  biz_zip?: string;
  biz_phone?: string;
}

export function generateInvoiceHtml(inv: Invoice, terms = "", forEmail = false, biz?: BizInfo): string {
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

  const bizName = biz?.biz_name || "RELIC LLC";
  const logoUrl = "https://relicbuilt.com/logo-emblem.png";
  const wrap = forEmail
    ? `style="max-width:680px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;"`
    : `style="max-width:740px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;padding:40px;"`;

  const addressLines = [
    biz?.biz_address,
    [biz?.biz_city, biz?.biz_state, biz?.biz_zip].filter(Boolean).join(", "),
    "United States",
  ]
    .filter(Boolean)
    .map((l) => `<p style="margin:1px 0;font-size:12px;color:#555;">${esc(l)}</p>`)
    .join("");

  return `
<div ${wrap}>

  <!-- Header: logo left, invoice title + address right -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;margin-bottom:0;">
    <div style="display:flex;align-items:center;gap:14px;">
      <img src="${logoUrl}" alt="RELIC" style="width:64px;height:64px;object-fit:contain;" />
      <div>
        <p style="margin:0;font-size:20px;font-weight:bold;letter-spacing:0.08em;color:#111;">RELIC</p>
        <p style="margin:2px 0 0;font-size:10px;letter-spacing:0.18em;color:#888;text-transform:uppercase;">Custom Fabrications</p>
      </div>
    </div>
    <div style="text-align:right;">
      <h1 style="margin:0 0 6px;font-size:28px;font-weight:bold;color:#111;letter-spacing:0.05em;">INVOICE</h1>
      <p style="margin:0;font-size:13px;font-weight:bold;color:#222;">${esc(bizName)}</p>
      ${addressLines}
      ${biz?.biz_phone ? `<p style="margin:1px 0;font-size:12px;color:#555;">${esc(biz.biz_phone)}</p>` : ""}
      <p style="margin:1px 0;font-size:12px;color:#555;">relicbuilt.com</p>
    </div>
  </div>

  <!-- Bill To / Invoice Meta -->
  <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;margin-bottom:0;">
    <tr>
      <td style="width:50%;padding:18px 20px;vertical-align:top;border-right:1px solid #ddd;">
        <p style="margin:0 0 10px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#c4a24d;">Bill To</p>
        <p style="margin:0;font-size:15px;font-weight:bold;color:#111;">${esc(inv.client_name)}</p>
        ${inv.client_phone ? `<p style="margin:4px 0 0;font-size:13px;color:#555;">${esc(inv.client_phone)}</p>` : ""}
        ${inv.client_email ? `<p style="margin:2px 0 0;font-size:13px;color:#555;">${esc(inv.client_email)}</p>` : ""}
        ${inv.description ? `<p style="margin:8px 0 0;font-size:12px;color:#777;">${esc(inv.description)}</p>` : ""}
      </td>
      <td style="width:50%;padding:18px 20px;vertical-align:top;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:3px 0;color:#666;font-weight:600;">Invoice Number:</td><td style="padding:3px 0;text-align:right;font-weight:bold;">${esc(inv.invoice_number)}</td></tr>
          ${inv.reference_number ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">P.O./S.O. Number:</td><td style="padding:3px 0;text-align:right;">${esc(inv.reference_number)}</td></tr>` : ""}
          ${inv.issued_date ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">Invoice Date:</td><td style="padding:3px 0;text-align:right;">${fmtDate(inv.issued_date)}</td></tr>` : ""}
          ${inv.due_date ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">Payment Due:</td><td style="padding:3px 0;text-align:right;">${fmtDate(inv.due_date)}</td></tr>` : ""}
        </table>
        <div style="margin-top:12px;background:#f5f5f5;border:1px solid #ddd;padding:10px 14px;display:flex;justify-content:space-between;">
          <span style="font-size:13px;font-weight:bold;">Amount Due (USD):</span>
          <span style="font-size:14px;font-weight:bold;font-family:monospace;">${money(amountDue)}</span>
        </div>
      </td>
    </tr>
  </table>

  <!-- Items header -->
  <div style="background:#c4a24d;padding:10px 20px;">
    <p style="margin:0;font-size:12px;font-weight:bold;color:#fff;text-transform:uppercase;letter-spacing:0.1em;">Items</p>
  </div>

  <!-- Line items -->
  <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;border-top:none;">
    <tbody>
      ${lineItems.length > 0
        ? lineItems.map((li, i) => `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:14px 20px;">
          <p style="margin:0;font-size:13px;font-weight:bold;color:#111;">${esc(li.category || li.description)}</p>
          ${li.category && li.description ? `<p style="margin:3px 0 0;font-size:12px;color:#777;">${esc(li.description)}</p>` : ""}
        </td>
        <td style="padding:14px 20px;text-align:right;white-space:nowrap;vertical-align:top;">
          ${li.quantity !== 1 ? `<p style="margin:0 0 2px;font-size:11px;color:#aaa;">${li.quantity} &times; ${money(li.unit_price)}</p>` : ""}
          <p style="margin:0;font-size:13px;font-weight:bold;font-family:monospace;">${money((li.quantity || 0) * (li.unit_price || 0))}</p>
        </td>
      </tr>`).join("")
        : `<tr><td colspan="2" style="padding:16px 20px;color:#aaa;font-size:13px;">No line items</td></tr>`}
    </tbody>
  </table>

  <!-- Totals -->
  <div style="border:1px solid #ddd;border-top:none;padding:16px 20px;">
    <div style="display:flex;justify-content:flex-end;">
      <table style="width:280px;font-size:13px;border-collapse:collapse;">
        ${(discountAmt > 0 || inv.tax_rate > 0) ? `<tr><td style="padding:4px 0;color:#666;">Subtotal:</td><td style="padding:4px 0;text-align:right;font-family:monospace;">${money(subtotal)}</td></tr>` : ""}
        ${discountAmt > 0 ? `<tr><td style="padding:4px 0;color:#666;">Discount:</td><td style="padding:4px 0;text-align:right;font-family:monospace;color:#22c55e;">-${money(discountAmt)}</td></tr>` : ""}
        ${inv.tax_rate > 0 ? `<tr><td style="padding:4px 0;color:#666;">Tax (${inv.tax_rate}%):</td><td style="padding:4px 0;text-align:right;font-family:monospace;">${money(taxAmt)}</td></tr>` : ""}
        <tr style="border-top:1px solid #ddd;">
          <td style="padding:8px 0 4px;font-weight:bold;color:#111;">Total:</td>
          <td style="padding:8px 0 4px;text-align:right;font-family:monospace;font-weight:bold;">${money(total)}</td>
        </tr>
        ${paid > 0 ? `<tr><td style="padding:4px 0;color:#22c55e;">Paid:</td><td style="padding:4px 0;text-align:right;font-family:monospace;color:#22c55e;">${money(paid)}</td></tr>` : ""}
        <tr>
          <td colspan="2" style="padding-top:8px;">
            <div style="background:#f5f5f5;border:1px solid #ddd;padding:10px 14px;display:flex;justify-content:space-between;">
              <span style="font-size:13px;font-weight:bold;">Amount Due (USD):</span>
              <span style="font-size:14px;font-weight:bold;font-family:monospace;">${money(amountDue)}</span>
            </div>
          </td>
        </tr>
      </table>
    </div>
  </div>

  <!-- Terms -->
  ${terms ? `
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#aaa;">Terms</p>
    <p style="margin:0;font-size:12px;color:#777;white-space:pre-wrap;line-height:1.7;">${esc(terms)}</p>
  </div>` : ""}

  <!-- Footer -->
  <div style="margin-top:36px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#bbb;text-align:center;">
    R&ensp;E&ensp;L&ensp;I&ensp;C &nbsp;&middot;&nbsp; Custom Fabrications &nbsp;&middot;&nbsp; (402) 235-8179 &nbsp;&middot;&nbsp; relicbuilt.com
  </div>

</div>`;
}
