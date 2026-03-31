import { CustomWork } from "@/types/axiom";

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
  terms_text?: string;
}

interface ProposalOptions {
  proposalNum: string;
  validUntil?: string;
  includeMaterials?: boolean;
  includeLabor?: boolean;
  forEmail?: boolean;
}

export function generateProposalHtml(
  project: CustomWork,
  biz: BizInfo = {},
  opts: ProposalOptions
): string {
  const { proposalNum, validUntil, includeMaterials = true, includeLabor = true, forEmail = false } = opts;

  const materials = project.materials || [];
  const laborLog = project.labor_log || [];
  const stripeColor = "#8b6914";
  const logoUrl = "https://relicbuilt.com/logo-full.png";

  const materialTotal = materials.reduce((s, m) => s + (m.cost || 0), 0);
  const laborTotal = laborLog.reduce((s, l) => s + (l.cost || 0), 0);
  const totalHours = laborLog.reduce((s, l) => s + (l.hours || 0), 0);
  const quotedAmount = project.quoted_amount || 0;

  const addressLine2 = [biz.biz_city, biz.biz_state, biz.biz_zip].filter(Boolean).join(", ");

  const wrap = forEmail
    ? `style="max-width:680px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;"`
    : `style="max-width:760px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;padding:48px;"`;

  return `
<div ${wrap}>

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:28px;">
    <img src="${logoUrl}" alt="RELIC Custom Fabrications" style="height:72px;object-fit:contain;" />
    <div style="text-align:right;">
      <h1 style="margin:0 0 10px;font-size:32px;font-weight:bold;color:#111;letter-spacing:0.04em;">PROPOSAL</h1>
      ${biz.biz_name ? `<p style="margin:0;font-size:13px;font-weight:bold;color:#222;">${esc(biz.biz_name)}</p>` : ""}
      ${biz.biz_address ? `<p style="margin:2px 0;font-size:12px;color:#666;">${esc(biz.biz_address)}</p>` : ""}
      ${addressLine2 ? `<p style="margin:2px 0;font-size:12px;color:#666;">${esc(addressLine2)}</p>` : ""}
      ${(biz.biz_city || biz.biz_state) ? `<p style="margin:2px 0;font-size:12px;color:#666;">United States</p>` : ""}
      ${biz.biz_phone ? `<p style="margin:6px 0 0;font-size:12px;color:#666;">${esc(biz.biz_phone)}</p>` : ""}
      <p style="margin:2px 0;font-size:12px;color:#666;">relicbuilt.com</p>
    </div>
  </div>

  <!-- Thin rule -->
  <div style="border-top:1px solid #e5e5e5;margin-bottom:28px;"></div>

  <!-- Prepared For / Proposal Meta -->
  <div style="display:flex;gap:40px;margin-bottom:28px;">
    <div style="flex:1;">
      <p style="margin:0 0 10px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.14em;color:#c4a24d;">Prepared For</p>
      <p style="margin:0;font-size:15px;font-weight:bold;color:#111;">${esc(project.client_name)}</p>
      ${project.company_name ? `<p style="margin:3px 0 0;font-size:13px;color:#555;">${esc(project.company_name)}</p>` : ""}
      ${project.client_phone ? `<p style="margin:4px 0 0;font-size:13px;color:#555;">${esc(project.client_phone)}</p>` : ""}
      ${project.client_email ? `<p style="margin:2px 0 0;font-size:13px;color:#555;">${esc(project.client_email)}</p>` : ""}
    </div>
    <div style="flex:1;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr><td style="padding:3px 0;color:#666;font-weight:600;">Proposal #:</td><td style="padding:3px 0;text-align:right;font-weight:bold;">${esc(proposalNum)}</td></tr>
        <tr><td style="padding:3px 0;color:#666;font-weight:600;">Prepared:</td><td style="padding:3px 0;text-align:right;">${fmtDate(new Date().toISOString().split("T")[0])}</td></tr>
        ${validUntil ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">Valid Until:</td><td style="padding:3px 0;text-align:right;">${fmtDate(validUntil)}</td></tr>` : ""}
        ${project.start_date ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">Est. Start:</td><td style="padding:3px 0;text-align:right;">${fmtDate(project.start_date)}</td></tr>` : ""}
        ${project.due_date ? `<tr><td style="padding:3px 0;color:#666;font-weight:600;">Est. Completion:</td><td style="padding:3px 0;text-align:right;">${fmtDate(project.due_date)}</td></tr>` : ""}
      </table>
      <div style="background:#f0f0f0;padding:10px 14px;display:flex;justify-content:space-between;margin-top:12px;">
        <span style="font-size:13px;font-weight:bold;">Quoted Amount:</span>
        <span style="font-size:14px;font-weight:bold;font-family:monospace;">${money(quotedAmount)}</span>
      </div>
    </div>
  </div>

  <!-- Project stripe -->
  <div style="background:${stripeColor};padding:10px 20px;">
    <p style="margin:0;font-size:11px;font-weight:bold;color:#fff;text-transform:uppercase;letter-spacing:0.14em;">Project</p>
  </div>
  <div style="padding:18px 20px;border-bottom:1px solid #f0f0f0;">
    <p style="margin:0;font-size:15px;font-weight:bold;color:#111;">${esc(project.project_name)}</p>
    ${project.project_description ? `<p style="margin:8px 0 0;font-size:13px;color:#555;line-height:1.6;">${esc(project.project_description).replace(/\n/g, "<br>")}</p>` : ""}
    ${project.timeline ? `<p style="margin:10px 0 0;font-size:12px;color:#888;">Timeline: ${esc(project.timeline)}</p>` : ""}
  </div>

  <!-- Scope of Work (materials) -->
  ${includeMaterials && materials.length > 0 ? `
  <div style="background:${stripeColor};padding:10px 20px;margin-top:0;">
    <p style="margin:0;font-size:11px;font-weight:bold;color:#fff;text-transform:uppercase;letter-spacing:0.14em;">Scope of Work</p>
  </div>
  ${materials.map((m) => `
  <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid #f5f5f5;">
    <span style="font-size:13px;color:#333;">${esc(m.description)}${m.vendor ? `<span style="font-size:11px;color:#aaa;margin-left:8px;">${esc(m.vendor)}</span>` : ""}</span>
    <span style="font-size:13px;font-weight:bold;font-family:monospace;white-space:nowrap;margin-left:20px;">${money(m.cost)}</span>
  </div>`).join("")}
  ${includeLabor && laborLog.length > 0 ? `
  <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid #f5f5f5;">
    <span style="font-size:13px;color:#333;">Labor <span style="font-size:11px;color:#aaa;">${totalHours.toFixed(1)} hrs</span></span>
    <span style="font-size:13px;font-weight:bold;font-family:monospace;white-space:nowrap;margin-left:20px;">${money(laborTotal)}</span>
  </div>` : ""}
  ` : includeLabor && laborLog.length > 0 ? `
  <div style="background:${stripeColor};padding:10px 20px;margin-top:0;">
    <p style="margin:0;font-size:11px;font-weight:bold;color:#fff;text-transform:uppercase;letter-spacing:0.14em;">Labor</p>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid #f5f5f5;">
    <span style="font-size:13px;color:#333;">Labor <span style="font-size:11px;color:#aaa;">${totalHours.toFixed(1)} hrs</span></span>
    <span style="font-size:13px;font-weight:bold;font-family:monospace;white-space:nowrap;margin-left:20px;">${money(laborTotal)}</span>
  </div>
  ` : ""}

  <!-- Totals -->
  <div style="border-top:1px solid #e5e5e5;margin:8px 0 20px;"></div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:28px;padding:0 20px;">
    <table style="width:300px;font-size:13px;border-collapse:collapse;">
      ${includeMaterials && materials.length > 0 ? `<tr><td style="padding:4px 0;color:#777;">Materials:</td><td style="padding:4px 0;text-align:right;font-family:monospace;">${money(materialTotal)}</td></tr>` : ""}
      ${includeLabor && laborLog.length > 0 ? `<tr><td style="padding:4px 0;color:#777;">Labor:</td><td style="padding:4px 0;text-align:right;font-family:monospace;">${money(laborTotal)}</td></tr>` : ""}
      <tr>
        <td colspan="2" style="padding-top:8px;">
          <div style="background:#f0f0f0;padding:10px 14px;display:flex;justify-content:space-between;">
            <span style="font-size:13px;font-weight:bold;">Total Quoted Amount:</span>
            <span style="font-size:14px;font-weight:bold;font-family:monospace;">${money(quotedAmount)}</span>
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Terms -->
  ${biz.terms_text ? `
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Terms</p>
    <p style="margin:0;font-size:12px;color:#888;white-space:pre-wrap;line-height:1.7;">${esc(biz.terms_text)}</p>
  </div>` : ""}

  <!-- Footer -->
  <div style="margin-top:36px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#ccc;text-align:center;">
    R&ensp;E&ensp;L&ensp;I&ensp;C &nbsp;&middot;&nbsp; Custom Fabrications &nbsp;&middot;&nbsp; (402) 235-8179 &nbsp;&middot;&nbsp; relicbuilt.com
  </div>

</div>`;
}
