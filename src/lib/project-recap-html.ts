import { CustomWork, Material, LaborEntry, Invoice, Receipt } from "@/types/axiom";

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
  if (!d) return "—";
  return new Date(d.includes("T") ? d : d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

interface BizInfo {
  biz_name?: string;
  biz_address?: string;
  biz_city?: string;
  biz_state?: string;
  biz_zip?: string;
  biz_phone?: string;
}

interface RecapData {
  project: CustomWork;
  receipts: { id: string; vendor?: string; receipt_date?: string; total?: number; line_items: { description: string; qty: number; unit_price: number; total: number }[] }[];
  invoices: Invoice[];
  biz: BizInfo;
}

export function generateProjectRecapHtml({ project, receipts, invoices, biz }: RecapData): string {
  const stripeColor = "#8b6914";
  const logoUrl = "https://relicbuilt.com/logo-full.png";
  const addressLine2 = [biz.biz_city, biz.biz_state, biz.biz_zip].filter(Boolean).join(", ");

  const materials: Material[] = project.materials || [];
  const labor: LaborEntry[] = project.labor_log || [];

  const materialTotal = materials.reduce((s, m) => s + (m.cost || 0), 0);
  const laborTotal = labor.reduce((s, l) => s + (l.cost || 0), 0);
  const laborHours = labor.reduce((s, l) => s + (l.hours || 0), 0);
  const receiptTotal = receipts.reduce((s, r) => s + (r.total || 0), 0);
  const totalCost = materialTotal + laborTotal + receiptTotal;
  const quoted = project.quoted_amount || 0;
  const profit = quoted - totalCost;
  const margin = quoted > 0 ? (profit / quoted) * 100 : 0;

  // Invoice totals
  const invoiceTotal = invoices.reduce((s, inv) => {
    const li = inv.line_items || [];
    const sub = li.length > 0
      ? li.reduce((a, l) => a + (l.quantity || 0) * (l.unit_price || 0), 0)
      : (inv.subtotal || 0) + (inv.delivery_fee || 0);
    const disc = inv.discount || 0;
    const tax = (sub - disc) * ((inv.tax_rate || 0) / 100);
    return s + sub - disc + tax;
  }, 0);
  const invoicePaid = invoices.reduce((s, inv) => s + (inv.payments || []).reduce((a, p) => a + p.amount, 0), 0);
  const invoiceBalance = invoiceTotal - invoicePaid;

  // Status label
  const statusLabels: Record<string, string> = {
    new: "New", in_review: "In Review", quoted: "Quoted",
    in_progress: "In Progress", complete: "Complete",
  };

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Project Recap – ${esc(project.project_name)}</title>
<style>
  @media print {
    body { margin: 0; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
  body { font-family: Arial, Helvetica, sans-serif; color: #222; background: #f3f4f6; margin: 0; }
  .wrap { max-width: 800px; margin: 0 auto; background: #fff; }
  @media screen { .wrap { margin: 32px auto; box-shadow: 0 1px 4px rgba(0,0,0,0.1); } }
  table { border-collapse: collapse; }
  .stripe { background: ${stripeColor}; padding: 8px 28px; }
  .stripe p { margin: 0; font-size: 11px; font-weight: bold; color: #fff; text-transform: uppercase; letter-spacing: 0.14em; }
  .section { padding: 16px 28px; border-bottom: 1px solid #f0f0f0; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f5f5f5; }
  .row:last-child { border-bottom: none; }
  .mono { font-family: monospace; }
  .muted { color: #888; }
  .small { font-size: 12px; }
  .bold { font-weight: bold; }
  .green { color: #16a34a; }
  .red { color: #dc2626; }
  .pnl-box { display: flex; gap: 0; margin: 0; }
  .pnl-cell { flex: 1; padding: 14px 16px; text-align: center; border-right: 1px solid #e5e5e5; }
  .pnl-cell:last-child { border-right: none; }
  .pnl-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin: 0 0 4px; }
  .pnl-val { font-size: 18px; font-weight: bold; font-family: monospace; margin: 0; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e5e5e5; padding: 10px 20px; display: flex; align-items: center; gap: 12px; }
  .toolbar button { display: flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 14px; border: none; cursor: pointer; border-radius: 4px; }
  .btn-print { background: #111; color: #fff; }
  .btn-close { background: #f3f4f6; color: #333; border: 1px solid #ddd; }
</style>
</head>
<body>

<!-- Toolbar -->
<div class="toolbar no-print">
  <button class="btn-close" onclick="window.close()">✕ Close</button>
  <div style="flex:1"></div>
  <button class="btn-print" onclick="window.print()">🖨 Print / Save as PDF</button>
</div>

<div class="wrap">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:36px 28px 24px;">
    <img src="${logoUrl}" alt="RELIC Custom Fabrications" style="height:64px;object-fit:contain;" />
    <div style="text-align:right;">
      <h1 style="margin:0 0 8px;font-size:28px;font-weight:bold;color:#111;letter-spacing:0.04em;">PROJECT RECAP</h1>
      ${biz.biz_name ? `<p style="margin:0;font-size:13px;font-weight:bold;color:#222;">${esc(biz.biz_name)}</p>` : ""}
      ${biz.biz_address ? `<p style="margin:2px 0;font-size:12px;color:#666;">${esc(biz.biz_address)}</p>` : ""}
      ${addressLine2 ? `<p style="margin:2px 0;font-size:12px;color:#666;">${esc(addressLine2)}</p>` : ""}
      ${biz.biz_phone ? `<p style="margin:4px 0 0;font-size:12px;color:#666;">${esc(biz.biz_phone)}</p>` : ""}
      <p style="margin:2px 0;font-size:12px;color:#666;">relicbuilt.com</p>
    </div>
  </div>

  <div style="margin:0 28px;border-top:1px solid #e5e5e5;"></div>

  <!-- Project Info -->
  <div style="display:flex;gap:32px;padding:24px 28px;">
    <div style="flex:1;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.14em;color:#c4a24d;">Project</p>
      <p style="margin:0;font-size:18px;font-weight:bold;color:#111;">${esc(project.project_name)}</p>
      ${project.client_name ? `<p style="margin:6px 0 0;font-size:14px;color:#444;">${esc(project.client_name)}</p>` : ""}
      ${project.company_name ? `<p style="margin:2px 0 0;font-size:13px;color:#666;">${esc(project.company_name)}</p>` : ""}
      ${project.client_email ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">${esc(project.client_email)}</p>` : ""}
      ${project.client_phone ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">${esc(project.client_phone)}</p>` : ""}
    </div>
    <div style="flex:1;">
      <table style="width:100%;font-size:13px;">
        <tr><td style="padding:3px 0;color:#666;font-weight:600;">Status:</td><td style="padding:3px 0;text-align:right;font-weight:bold;">${esc(statusLabels[project.status] || project.status)}</td></tr>
        ${project.start_date ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">Start Date:</td><td style="padding:3px 0;text-align:right;">${fmtDate(project.start_date)}</td></tr>` : ""}
        ${project.due_date ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">Due Date:</td><td style="padding:3px 0;text-align:right;">${fmtDate(project.due_date)}</td></tr>` : ""}
        <tr><td style="padding:3px 0;color:#666;font-weight:600;">Recap Date:</td><td style="padding:3px 0;text-align:right;">${today}</td></tr>
      </table>
    </div>
  </div>

  ${project.project_description ? `
  <div class="section">
    <p style="margin:0 0 6px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em;color:#999;">Description</p>
    <p style="margin:0;font-size:13px;color:#444;line-height:1.6;white-space:pre-wrap;">${esc(project.project_description)}</p>
  </div>` : ""}

  <!-- ══════ PROFIT & LOSS SUMMARY ══════ -->
  <div class="stripe"><p>Profit &amp; Loss Summary</p></div>
  <div style="background:#fafafa;border-bottom:1px solid #f0f0f0;">
    <div class="pnl-box">
      <div class="pnl-cell">
        <p class="pnl-label">Quoted</p>
        <p class="pnl-val">${money(quoted)}</p>
      </div>
      <div class="pnl-cell">
        <p class="pnl-label">Total Cost</p>
        <p class="pnl-val">${money(totalCost)}</p>
      </div>
      <div class="pnl-cell">
        <p class="pnl-label">Profit</p>
        <p class="pnl-val ${profit >= 0 ? "green" : "red"}">${money(profit)}</p>
      </div>
      <div class="pnl-cell">
        <p class="pnl-label">Margin</p>
        <p class="pnl-val ${margin >= 0 ? "green" : "red"}">${margin.toFixed(1)}%</p>
      </div>
    </div>
  </div>

  <!-- Cost Breakdown -->
  <div class="section" style="padding:12px 28px;">
    <table style="width:100%;font-size:13px;">
      <tr><td style="padding:5px 0;color:#666;">Materials Cost:</td><td style="padding:5px 0;text-align:right;font-family:monospace;font-weight:600;">${money(materialTotal)}</td></tr>
      <tr><td style="padding:5px 0;color:#666;">Labor Cost (${laborHours.toFixed(1)} hrs):</td><td style="padding:5px 0;text-align:right;font-family:monospace;font-weight:600;">${money(laborTotal)}</td></tr>
      ${receiptTotal > 0 ? `<tr><td style="padding:5px 0;color:#666;">Receipt Purchases:</td><td style="padding:5px 0;text-align:right;font-family:monospace;font-weight:600;">${money(receiptTotal)}</td></tr>` : ""}
      <tr style="border-top:1px solid #e5e5e5;"><td style="padding:5px 0;font-weight:bold;">Total Cost:</td><td style="padding:5px 0;text-align:right;font-family:monospace;font-weight:bold;">${money(totalCost)}</td></tr>
    </table>
  </div>

  <!-- ══════ INVOICING SUMMARY ══════ -->
  ${invoices.length > 0 ? `
  <div class="stripe"><p>Invoicing</p></div>
  <div class="section">
    <table style="width:100%;font-size:13px;">
      <thead>
        <tr style="border-bottom:2px solid #e5e5e5;">
          <th style="padding:6px 0;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Invoice #</th>
          <th style="padding:6px 0;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Type</th>
          <th style="padding:6px 0;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Date</th>
          <th style="padding:6px 0;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Total</th>
          <th style="padding:6px 0;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Paid</th>
          <th style="padding:6px 0;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${invoices.map(inv => {
          const li = inv.line_items || [];
          const sub = li.length > 0
            ? li.reduce((a, l) => a + (l.quantity || 0) * (l.unit_price || 0), 0)
            : (inv.subtotal || 0) + (inv.delivery_fee || 0);
          const disc = inv.discount || 0;
          const tax = (sub - disc) * ((inv.tax_rate || 0) / 100);
          const invTotal = sub - disc + tax;
          const invPaid = (inv.payments || []).reduce((a, p) => a + p.amount, 0);
          const statusColor = inv.status === "paid" ? "#16a34a" : inv.status === "partial" ? "#f59e0b" : "#dc2626";
          return `<tr style="border-bottom:1px solid #f5f5f5;">
            <td style="padding:8px 0;font-weight:600;">${esc(inv.invoice_number)}</td>
            <td style="padding:8px 0;text-transform:capitalize;">${esc(inv.invoice_type || "standard")}</td>
            <td style="padding:8px 0;">${inv.issued_date ? fmtDate(inv.issued_date) : "—"}</td>
            <td style="padding:8px 0;text-align:right;font-family:monospace;">${money(invTotal)}</td>
            <td style="padding:8px 0;text-align:right;font-family:monospace;color:#16a34a;">${money(invPaid)}</td>
            <td style="padding:8px 0;text-align:right;"><span style="font-size:11px;font-weight:bold;text-transform:uppercase;color:${statusColor};">${esc(inv.status)}</span></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:10px;gap:24px;font-size:13px;">
      <span style="color:#666;">Invoiced: <strong class="mono">${money(invoiceTotal)}</strong></span>
      <span style="color:#16a34a;">Collected: <strong class="mono">${money(invoicePaid)}</strong></span>
      ${invoiceBalance > 0 ? `<span style="color:#dc2626;">Outstanding: <strong class="mono">${money(invoiceBalance)}</strong></span>` : ""}
    </div>
  </div>` : ""}

  <!-- ══════ LABOR LOG ══════ -->
  ${labor.length > 0 ? `
  <div class="stripe"><p>Labor Log (${labor.length} Entries — ${laborHours.toFixed(1)} Total Hours)</p></div>
  <div class="section">
    <table style="width:100%;font-size:12px;">
      <thead>
        <tr style="border-bottom:2px solid #e5e5e5;">
          <th style="padding:6px 0;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Date</th>
          <th style="padding:6px 0;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Description</th>
          <th style="padding:6px 0;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Hours</th>
          <th style="padding:6px 0;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Rate</th>
          <th style="padding:6px 0;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Cost</th>
        </tr>
      </thead>
      <tbody>
        ${labor.map(l => `<tr style="border-bottom:1px solid #f5f5f5;">
          <td style="padding:6px 0;white-space:nowrap;">${l.date ? fmtDate(l.date) : "—"}</td>
          <td style="padding:6px 0;color:#444;">${esc(l.description || "—")}</td>
          <td style="padding:6px 0;text-align:right;font-family:monospace;">${l.hours.toFixed(2)}</td>
          <td style="padding:6px 0;text-align:right;font-family:monospace;">${money(l.rate)}</td>
          <td style="padding:6px 0;text-align:right;font-family:monospace;font-weight:600;">${money(l.cost)}</td>
        </tr>`).join("")}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid #e5e5e5;">
          <td style="padding:8px 0;font-weight:bold;" colspan="2">Total</td>
          <td style="padding:8px 0;text-align:right;font-family:monospace;font-weight:bold;">${laborHours.toFixed(2)}</td>
          <td></td>
          <td style="padding:8px 0;text-align:right;font-family:monospace;font-weight:bold;">${money(laborTotal)}</td>
        </tr>
      </tfoot>
    </table>
  </div>` : ""}

  <!-- ══════ MATERIALS ══════ -->
  ${materials.length > 0 ? `
  <div class="stripe"><p>Materials (${materials.length} Items)</p></div>
  <div class="section">
    <table style="width:100%;font-size:12px;">
      <thead>
        <tr style="border-bottom:2px solid #e5e5e5;">
          <th style="padding:6px 0;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Description</th>
          <th style="padding:6px 0;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Vendor</th>
          <th style="padding:6px 0;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Cost</th>
        </tr>
      </thead>
      <tbody>
        ${materials.map(m => `<tr style="border-bottom:1px solid #f5f5f5;">
          <td style="padding:6px 0;color:#333;">${esc(m.description)}</td>
          <td style="padding:6px 0;color:#666;">${esc(m.vendor)}</td>
          <td style="padding:6px 0;text-align:right;font-family:monospace;font-weight:600;">${money(m.cost)}</td>
        </tr>`).join("")}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid #e5e5e5;">
          <td style="padding:8px 0;font-weight:bold;" colspan="2">Total</td>
          <td style="padding:8px 0;text-align:right;font-family:monospace;font-weight:bold;">${money(materialTotal)}</td>
        </tr>
      </tfoot>
    </table>
  </div>` : ""}

  <!-- ══════ RECEIPTS ══════ -->
  ${receipts.length > 0 ? `
  <div class="stripe"><p>Receipts &amp; Purchases (${receipts.length})</p></div>
  <div class="section">
    <table style="width:100%;font-size:12px;">
      <thead>
        <tr style="border-bottom:2px solid #e5e5e5;">
          <th style="padding:6px 0;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Vendor</th>
          <th style="padding:6px 0;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Date</th>
          <th style="padding:6px 0;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Items</th>
          <th style="padding:6px 0;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${receipts.map(r => `<tr style="border-bottom:1px solid #f5f5f5;">
          <td style="padding:6px 0;font-weight:600;color:#333;">${esc(r.vendor || "Unknown")}</td>
          <td style="padding:6px 0;color:#666;">${r.receipt_date ? fmtDate(r.receipt_date) : "—"}</td>
          <td style="padding:6px 0;color:#888;font-size:11px;">${r.line_items?.length ? r.line_items.map(li => esc(li.description)).join(", ") : "—"}</td>
          <td style="padding:6px 0;text-align:right;font-family:monospace;font-weight:600;">${money(r.total || 0)}</td>
        </tr>`).join("")}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid #e5e5e5;">
          <td style="padding:8px 0;font-weight:bold;" colspan="3">Total</td>
          <td style="padding:8px 0;text-align:right;font-family:monospace;font-weight:bold;">${money(receiptTotal)}</td>
        </tr>
      </tfoot>
    </table>
  </div>` : ""}

  <!-- ══════ INTERNAL NOTES ══════ -->
  ${project.internal_notes ? `
  <div class="stripe"><p>Internal Notes</p></div>
  <div class="section">
    <p style="margin:0;font-size:13px;color:#444;line-height:1.6;white-space:pre-wrap;">${esc(project.internal_notes)}</p>
  </div>` : ""}

  <!-- Footer -->
  <div style="margin-top:24px;padding:14px 28px;border-top:1px solid #eee;font-size:11px;color:#ccc;text-align:center;">
    R&ensp;E&ensp;L&ensp;I&ensp;C &nbsp;&middot;&nbsp; Custom Fabrications &nbsp;&middot;&nbsp; (402) 235-8179 &nbsp;&middot;&nbsp; relicbuilt.com
    <br><span style="font-size:10px;">Generated ${today}</span>
  </div>

</div>
</body>
</html>`;
}
