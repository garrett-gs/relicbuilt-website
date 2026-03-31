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

export function generateInvoiceHtml(inv: Invoice, terms = "", forEmail = false): string {
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

  const wrap = forEmail
    ? `style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;"`
    : `style="max-width:700px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;padding:40px;"`;

  const fmtDate = (d?: string) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

  return `
<div ${wrap}>

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;border-bottom:2px solid #c4a24d;padding-bottom:20px;">
    <div>
      <h1 style="margin:0;font-size:28px;letter-spacing:0.15em;color:#111;">R&ensp;E&ensp;L&ensp;I&ensp;C</h1>
      <p style="margin:4px 0 0;font-size:11px;letter-spacing:0.2em;color:#c4a24d;text-transform:uppercase;">Custom Fabrications</p>
    </div>
    <div style="text-align:right;">
      <h2 style="margin:0;font-size:20px;color:#111;">INVOICE</h2>
      <p style="margin:4px 0 0;font-size:14px;font-family:monospace;color:#555;">${esc(inv.invoice_number)}</p>
      ${inv.issued_date ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">Date: ${fmtDate(inv.issued_date)}</p>` : ""}
      ${inv.due_date ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">Due: ${fmtDate(inv.due_date)}</p>` : ""}
    </div>
  </div>

  <!-- Bill To -->
  <div style="margin-bottom:28px;">
    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Bill To</p>
    <p style="margin:4px 0 0;font-size:16px;font-weight:bold;">${esc(inv.client_name)}</p>
    ${inv.client_email ? `<p style="margin:2px 0 0;font-size:13px;color:#555;">${esc(inv.client_email)}</p>` : ""}
    ${inv.description ? `<p style="margin:10px 0 0;font-size:13px;color:#666;">${esc(inv.description)}</p>` : ""}
  </div>

  <!-- Line Items -->
  ${lineItems.length > 0 ? `
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
    <thead>
      <tr style="border-bottom:2px solid #ddd;">
        <th style="text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Category</th>
        <th style="text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Description</th>
        <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Qty</th>
        <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Unit Price</th>
        <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineItems
        .map(
          (li) => `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:8px 10px;color:#777;">${esc(li.category)}</td>
        <td style="padding:8px 10px;">${esc(li.description)}</td>
        <td style="padding:8px 10px;text-align:right;font-family:monospace;">${li.quantity}</td>
        <td style="padding:8px 10px;text-align:right;font-family:monospace;">${money(li.unit_price)}</td>
        <td style="padding:8px 10px;text-align:right;font-family:monospace;font-weight:bold;">${money((li.quantity || 0) * (li.unit_price || 0))}</td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>
  ` : ""}

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:28px;">
    <table style="width:280px;font-size:13px;border-collapse:collapse;">
      <tr>
        <td style="padding:5px 10px;color:#666;">Subtotal</td>
        <td style="padding:5px 10px;text-align:right;font-family:monospace;">${money(subtotal)}</td>
      </tr>
      ${discountAmt > 0 ? `
      <tr>
        <td style="padding:5px 10px;color:#666;">Discount</td>
        <td style="padding:5px 10px;text-align:right;font-family:monospace;color:#22c55e;">-${money(discountAmt)}</td>
      </tr>` : ""}
      ${inv.tax_rate > 0 ? `
      <tr>
        <td style="padding:5px 10px;color:#666;">Tax (${inv.tax_rate}%)</td>
        <td style="padding:5px 10px;text-align:right;font-family:monospace;">${money(taxAmt)}</td>
      </tr>` : ""}
      <tr style="border-top:2px solid #ddd;">
        <td style="padding:10px 10px;font-weight:bold;font-size:15px;">Total</td>
        <td style="padding:10px 10px;text-align:right;font-family:monospace;font-size:15px;font-weight:bold;">${money(total)}</td>
      </tr>
      ${paid > 0 ? `
      <tr>
        <td style="padding:5px 10px;color:#22c55e;">Paid</td>
        <td style="padding:5px 10px;text-align:right;font-family:monospace;color:#22c55e;">${money(paid)}</td>
      </tr>
      <tr style="border-top:1px solid #ddd;">
        <td style="padding:8px 10px;font-weight:bold;color:${balance > 0 ? "#ef4444" : "#22c55e"};">Balance Due</td>
        <td style="padding:8px 10px;text-align:right;font-family:monospace;font-weight:bold;color:${balance > 0 ? "#ef4444" : "#22c55e"};">${money(balance)}</td>
      </tr>` : ""}
    </table>
  </div>

  <!-- Terms -->
  ${terms ? `
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;">
    <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#888;font-weight:bold;">Terms</p>
    <p style="margin:0;font-size:12px;color:#666;white-space:pre-wrap;line-height:1.7;">${esc(terms)}</p>
  </div>` : ""}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center;">
    R&ensp;E&ensp;L&ensp;I&ensp;C &nbsp;&middot;&nbsp; Custom Fabrications &nbsp;&middot;&nbsp; (402) 235-8179 &nbsp;&middot;&nbsp; relicbuilt.com
  </div>

</div>`;
}
