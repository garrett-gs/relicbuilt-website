import { PurchaseOrder, POLineItem } from "@/types/axiom";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function generatePOHtml(po: PurchaseOrder, forEmail = false) {
  const lines: POLineItem[] = po.line_items && po.line_items.length > 0
    ? po.line_items
    : [{ item_number: "", description: po.item_description || "", quantity: po.quantity, unit_price: po.unit_price, unit: "ea" }];

  const total = lines.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);

  const wrapper = forEmail
    ? 'style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;"'
    : 'style="max-width:700px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;padding:40px;"';

  return `
    <div ${wrapper}>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;border-bottom:2px solid #c4a24d;padding-bottom:20px;">
        <div>
          <h1 style="margin:0;font-size:28px;letter-spacing:0.15em;color:#111;">R&ensp;E&ensp;L&ensp;I&ensp;C</h1>
          <p style="margin:4px 0 0;font-size:11px;letter-spacing:0.2em;color:#c4a24d;text-transform:uppercase;">Custom Fabrications</p>
        </div>
        <div style="text-align:right;">
          <h2 style="margin:0;font-size:20px;color:#111;">PURCHASE ORDER</h2>
          <p style="margin:4px 0 0;font-size:14px;font-family:monospace;color:#555;">${po.po_number}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#888;">Date: ${new Date(po.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          ${po.need_by_date ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">Need By: ${new Date(po.need_by_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>` : ""}
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Vendor</p>
        <p style="margin:4px 0 0;font-size:16px;font-weight:bold;">${po.vendor_name}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
        <thead>
          <tr style="border-bottom:2px solid #ddd;">
            <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Item #</th>
            <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Description</th>
            <th style="text-align:right;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Qty</th>
            <th style="text-align:right;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Unit Price</th>
            <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Unit</th>
            <th style="text-align:right;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map((li) => `
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:8px 12px;font-family:monospace;color:#666;">${li.item_number || "—"}</td>
              <td style="padding:8px 12px;">${li.description}</td>
              <td style="padding:8px 12px;text-align:right;font-family:monospace;">${li.quantity}</td>
              <td style="padding:8px 12px;text-align:right;font-family:monospace;">${money(li.unit_price)}</td>
              <td style="padding:8px 12px;color:#666;">${li.unit}</td>
              <td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:bold;">${money(li.quantity * li.unit_price)}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid #ddd;">
            <td colspan="5" style="padding:12px;text-align:right;font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Total</td>
            <td style="padding:12px;text-align:right;font-family:monospace;font-size:18px;font-weight:bold;color:#111;">${money(total)}</td>
          </tr>
        </tfoot>
      </table>

      ${po.notes ? `
        <div style="margin-bottom:24px;padding:12px;background:#f9f9f9;border-left:3px solid #c4a24d;">
          <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin-bottom:4px;">Notes</p>
          <p style="margin:0;font-size:13px;color:#444;white-space:pre-wrap;">${po.notes}</p>
        </div>
      ` : ""}

      <div style="margin-top:40px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center;">
        R&ensp;E&ensp;L&ensp;I&ensp;C &nbsp;&middot;&nbsp; Custom Fabrications &nbsp;&middot;&nbsp; (402) 235-8179 &nbsp;&middot;&nbsp; relicbuilt.com
      </div>
    </div>
  `;
}
