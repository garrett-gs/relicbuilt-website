import { CustomWork, Estimate, ProposalHighlight } from "@/types/axiom";

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
  forEmail?: boolean;
  approveUrl?: string;
}

export function generateProposalHtml(
  project: CustomWork,
  biz: BizInfo = {},
  opts: ProposalOptions
): string {
  const { proposalNum, validUntil, forEmail = false, approveUrl } = opts;

  const highlights: ProposalHighlight[] = (project.proposal_highlights || []).filter((h) => h.included !== false);
  const scope = project.proposal_scope?.included !== false ? (project.proposal_scope?.body || "") : "";
  const costSection = project.proposal_cost_section?.included !== false ? project.proposal_cost_section : null;
  const images: string[] = project.proposal_images_included !== false ? (project.proposal_images || []) : [];
  const stripeColor = "#8b6914";
  const logoUrl = "https://relicbuilt.com/logo-full.png";

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
  <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
    <tr>
      <td style="width:50%;vertical-align:top;padding-right:24px;">
        <p style="margin:0 0 10px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.14em;color:#c4a24d;">Prepared For</p>
        <p style="margin:0;font-size:15px;font-weight:bold;color:#111;">${esc(project.client_name)}</p>
        ${project.company_name ? `<p style="margin:4px 0 0;font-size:13px;color:#555;">${esc(project.company_name)}</p>` : ""}
        ${project.client_phone ? `<p style="margin:4px 0 0;font-size:13px;color:#555;">${esc(project.client_phone)}</p>` : ""}
        ${project.client_email ? `<p style="margin:4px 0 0;font-size:13px;color:#555;">${esc(project.client_email)}</p>` : ""}
      </td>
      <td style="width:50%;vertical-align:top;padding-left:24px;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#666;font-weight:600;">Proposal #:</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${esc(proposalNum)}</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-weight:600;">Prepared:</td><td style="padding:4px 0;text-align:right;">${fmtDate(new Date().toISOString().split("T")[0])}</td></tr>
          ${validUntil ? `<tr><td style="padding:4px 0;color:#666;font-weight:600;">Valid Until:</td><td style="padding:4px 0;text-align:right;">${fmtDate(validUntil)}</td></tr>` : ""}
          ${project.start_date ? `<tr><td style="padding:4px 0;color:#666;font-weight:600;">Est. Start:</td><td style="padding:4px 0;text-align:right;">${fmtDate(project.start_date)}</td></tr>` : ""}
          ${project.due_date ? `<tr><td style="padding:4px 0;color:#666;font-weight:600;">Est. Completion:</td><td style="padding:4px 0;text-align:right;">${fmtDate(project.due_date)}</td></tr>` : ""}
        </table>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;background:#f0f0f0;">
          <tr>
            <td style="padding:10px 14px;font-size:13px;font-weight:bold;color:#111;">Quoted Amount:</td>
            <td style="padding:10px 14px;text-align:right;font-size:14px;font-weight:bold;font-family:monospace;color:#111;">${money(quotedAmount)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- Project stripe -->
  <div style="background:${stripeColor};padding:6px 20px;">
    <p style="margin:0;font-size:11px;font-weight:bold;color:#fff;text-transform:uppercase;letter-spacing:0.14em;">Project</p>
  </div>
  <div style="padding:18px 20px;border-bottom:1px solid #f0f0f0;">
    <p style="margin:0;font-size:15px;font-weight:bold;color:#111;">${esc(project.project_name)}</p>
    ${project.project_description ? `<p style="margin:8px 0 0;font-size:13px;color:#555;line-height:1.6;">${esc(project.project_description).replace(/\n/g, "<br>")}</p>` : ""}
    ${project.timeline ? `<p style="margin:10px 0 0;font-size:12px;color:#888;">Timeline: ${esc(project.timeline)}</p>` : ""}
  </div>

  <!-- Scope of Work -->
  ${scope ? `
  <div style="background:${stripeColor};padding:6px 20px;margin-top:0;">
    <p style="margin:0;font-size:11px;font-weight:bold;color:#fff;text-transform:uppercase;letter-spacing:0.14em;">Scope of Work</p>
  </div>
  <div style="padding:18px 20px;border-bottom:1px solid #f0f0f0;">
    <p style="margin:0;font-size:13px;color:#555;line-height:1.7;white-space:pre-wrap;">${esc(scope)}</p>
  </div>` : ""}

  <!-- Cost Line Items -->
  ${costSection && costSection.items.length > 0 ? `
  <div style="background:${stripeColor};padding:6px 20px;margin-top:0;">
    <p style="margin:0;font-size:11px;font-weight:bold;color:#fff;text-transform:uppercase;letter-spacing:0.14em;">Pricing</p>
  </div>
  ${costSection.items.map((item) => `
  <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid #f5f5f5;">
    <span style="font-size:13px;color:#333;">${esc(item.description)}</span>
    <span style="font-size:13px;font-weight:bold;font-family:monospace;white-space:nowrap;margin-left:20px;">${money(item.cost || 0)}</span>
  </div>`).join("")}
  ${costSection.show_total !== false ? (() => {
    const costTotal = costSection.items.reduce((s, it) => s + (it.cost || 0), 0);
    const deposit = costSection.deposit_amount || 0;
    const balance = costTotal - deposit;
    return `
  <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 20px;background:#f0f0f0;border-bottom:1px solid #e5e5e5;">
    <span style="font-size:13px;font-weight:bold;color:#111;">Total:</span>
    <span style="font-size:13px;font-weight:bold;font-family:monospace;color:#111;">${money(costTotal)}</span>
  </div>
  ${deposit > 0 ? `
  <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 20px;border-bottom:1px solid #f0f0f0;">
    <span style="font-size:13px;font-weight:bold;color:#333;">Deposit Due:</span>
    <span style="font-size:13px;font-weight:bold;font-family:monospace;color:#333;">${money(deposit)}</span>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 20px;border-bottom:1px solid #f0f0f0;">
    <span style="font-size:12px;color:#888;">Balance Due at Completion:</span>
    <span style="font-size:12px;font-family:monospace;color:#888;">${money(balance)}</span>
  </div>` : ""}`;
  })() : ""}` : ""}

  <!-- Project Highlights -->
  ${highlights.length > 0 ? `
  <div style="background:${stripeColor};padding:6px 20px;margin-top:0;">
    <p style="margin:0;font-size:11px;font-weight:bold;color:#fff;text-transform:uppercase;letter-spacing:0.14em;">Project Highlights</p>
  </div>
  <div style="padding:20px;border-bottom:1px solid #f0f0f0;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        ${highlights.map((h) => `
        <td style="width:50%;vertical-align:top;padding:0 10px 0 0;">
          <div style="border-left:3px solid #c4a24d;padding-left:12px;margin-bottom:16px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:#111;">${esc(h.title)}</p>
            <p style="margin:0;font-size:12px;color:#555;line-height:1.6;white-space:pre-wrap;">${esc(h.body)}</p>
          </div>
        </td>`).slice(0, 2).join("")}
      </tr>
      ${highlights.length > 2 ? `<tr>
        ${highlights.slice(2).map((h) => `
        <td style="width:50%;vertical-align:top;padding:10px 10px 0 0;">
          <div style="border-left:3px solid #c4a24d;padding-left:12px;margin-bottom:16px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:#111;">${esc(h.title)}</p>
            <p style="margin:0;font-size:12px;color:#555;line-height:1.6;white-space:pre-wrap;">${esc(h.body)}</p>
          </div>
        </td>`).slice(0, 2).join("")}
      </tr>` : ""}
    </table>
  </div>` : ""}


  <!-- Gallery -->
  ${images.length > 0 ? `
  <div style="background:${stripeColor};padding:6px 20px;margin-top:0;">
    <p style="margin:0;font-size:11px;font-weight:bold;color:#fff;text-transform:uppercase;letter-spacing:0.14em;">Gallery</p>
  </div>
  <div style="padding:16px 20px 20px;border-bottom:1px solid #f0f0f0;">
    <table style="width:100%;border-collapse:collapse;">
      ${images.reduce<string[][]>((rows, img, i) => {
        if (i % 3 === 0) rows.push([]);
        rows[rows.length - 1].push(img);
        return rows;
      }, []).map((row) => `
      <tr>
        ${row.map((url) => `
        <td style="width:33.33%;padding:4px;vertical-align:top;">
          <img src="${url}" alt="" style="width:100%;display:block;object-fit:cover;" />
        </td>`).join("")}
        ${row.length < 3 ? Array(3 - row.length).fill('<td style="width:33.33%;"></td>').join("") : ""}
      </tr>`).join("")}
    </table>
  </div>` : ""}

  <!-- Approve CTA at bottom (email only) -->
  ${forEmail && approveUrl ? `
  <div style="padding:28px 20px;background:#faf8f3;border-top:3px solid #c4a24d;border-bottom:3px solid #c4a24d;text-align:center;">
    <p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#111;">Ready to move forward?</p>
    <p style="margin:0 0 20px;font-size:13px;color:#555;">Click the button below to approve this proposal.</p>
    <a href="${approveUrl}" style="display:inline-block;background:#c4a24d;color:#fff;text-decoration:none;padding:16px 40px;font-size:16px;font-weight:bold;letter-spacing:0.04em;">✓ &nbsp;Approve This Proposal</a>
    <p style="margin:14px 0 0;font-size:11px;color:#aaa;">By approving, you agree to the terms of this proposal.</p>
  </div>` : ""}

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

// ── Estimate-based proposal (new flow) ────────────────────────────────
// Used by the estimator page to render a print-friendly proposal directly
// from the estimate. Pulls in the estimate's proposal_* fields and computes
// totals from line_items + labor_items + markup.

interface EstimateProposalArgs {
  estimate: Estimate;
  biz?: BizInfo & { biz_email?: string; deposit_percent?: number };
  totals: { materialTotal: number; laborTotal: number; markupAmount: number; total: number };
  approveUrl?: string;
  forEmail?: boolean;
}

export function generateEstimateProposalHtml({
  estimate,
  biz = {},
  totals,
  approveUrl,
  forEmail = false,
}: EstimateProposalArgs): string {
  const highlights: ProposalHighlight[] = (estimate.proposal_highlights || []).filter((h) => h.included !== false);
  const scope = estimate.proposal_scope?.included !== false ? (estimate.proposal_scope?.body || "") : "";
  const includeImages = estimate.proposal_images_included !== false;
  const fieldNoteImages: string[] = includeImages ? (estimate.images || []) : [];
  // Project images — uploaded specifically for the proposal (separate
  // from field notes). Used in the body gallery and as a candidate for
  // the cover. Cover image is filtered out so it doesn't repeat.
  const coverImage = estimate.proposal_cover_image_url || "";
  const projectImages: string[] = (estimate.proposal_images || []).filter((u) => u !== coverImage);
  const logoUrl = "https://relicbuilt.com/logo-full.png";

  const depositPct = estimate.deposit_percent ?? biz.deposit_percent ?? 50;
  const depositAmount = Math.round((totals.total * depositPct)) / 100;
  const balanceDue = Math.round((totals.total - depositAmount) * 100) / 100;

  const sentDate = estimate.proposal_sent_at
    ? new Date(estimate.proposal_sent_at)
    : new Date();
  const dateText = sentDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Proposal expires 30 days after it's sent. Same date is used as the
  // deposit due date once the client accepts.
  const expiresDate = estimate.proposal_expires_at
    ? new Date(estimate.proposal_expires_at)
    : new Date(sentDate.getTime() + 30 * 86400000);
  const expiresText = expiresDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const addressLine2 = [biz.biz_city, biz.biz_state, biz.biz_zip].filter(Boolean).join(", ");

  // For email rendering, keep the layout simple (no shadows, no gaps).
  // For everything else (preview / public proposal page / PDF), render
  // each "page" as a separate sheet-of-paper card so it's obvious where
  // page 1 ends and page 2 begins. Print CSS resets the cards back to a
  // continuous flow so the PDF still page-breaks cleanly.
  const wrap = forEmail
    ? `style="max-width:680px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;"`
    : `style="max-width:760px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222;"`;
  const pageGapHtml = forEmail
    ? ""
    : `<div class="proposal-page-gap" style="height:32px;background:transparent;"></div>`;

  const acceptanceSection = approveUrl
    ? `
  <div style="margin-top:36px;padding:24px;background:#fafafa;border:1px solid #e5e5e5;border-left:3px solid #c4a24d;page-break-inside:avoid;">
    <h2 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.16em;color:#111;font-weight:bold;">Accept This Proposal</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#555;line-height:1.6;">
      Click below to review and sign electronically. A ${depositPct}% deposit will start the project.
    </p>
    <a href="${approveUrl}" style="display:inline-block;background:#c4a24d;color:#0a0a0a;padding:14px 28px;text-decoration:none;font-weight:bold;letter-spacing:0.08em;font-size:13px;text-transform:uppercase;">
      Review &amp; Sign
    </a>
  </div>`
    : `
  <div style="margin-top:36px;border-top:2px solid #111;padding-top:24px;page-break-inside:avoid;">
    <h2 style="margin:0 0 16px;font-size:13px;text-transform:uppercase;letter-spacing:0.16em;color:#111;font-weight:bold;">Acceptance</h2>
    <p style="margin:0 0 32px;font-size:12px;color:#444;line-height:1.6;">
      By signing below, the client authorizes ${esc(biz.biz_name || "RELIC")} to begin work as outlined in this proposal.
      A ${depositPct}% deposit (${money(depositAmount)}) is due to commence work.
    </p>
    <div style="display:flex;gap:32px;">
      <div style="flex:1;">
        <div style="border-bottom:1px solid #999;height:32px;"></div>
        <p style="margin:6px 0 0;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.1em;">Client Signature</p>
      </div>
      <div style="width:160px;">
        <div style="border-bottom:1px solid #999;height:32px;"></div>
        <p style="margin:6px 0 0;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.1em;">Date</p>
      </div>
    </div>
  </div>`;

  const highlightsHtml = highlights.length > 0 ? `
  <section style="margin-bottom:32px;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Highlights</p>
    ${highlights.map((h) => `
      <div style="margin-bottom:16px;page-break-inside:avoid;">
        ${h.title ? `<h3 style="margin:0 0 4px;font-size:15px;color:#111;font-weight:bold;">${esc(h.title)}</h3>` : ""}
        ${h.body ? `<p style="margin:0;font-size:13px;color:#444;line-height:1.7;white-space:pre-wrap;">${esc(h.body)}</p>` : ""}
      </div>
    `).join("")}
  </section>
  ` : "";

  const scopeHtml = scope ? `
  <section style="margin-bottom:32px;page-break-inside:avoid;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Scope of Work</p>
    <p style="margin:0;font-size:13px;color:#444;line-height:1.7;white-space:pre-wrap;">${esc(scope)}</p>
  </section>
  ` : "";

  // Project images: dedicated proposal images, excluding the cover (which
  // gets its own page). Two-column gallery in the body of the proposal.
  const projectImagesHtml = projectImages.length > 0 ? `
  <section style="margin-bottom:32px;">
    <p style="margin:0 0 12px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Project Images</p>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
      ${projectImages.map((url) => `
        <img src="${url}" alt="Project image" style="width:100%;border:1px solid #e5e5e5;display:block;page-break-inside:avoid;" />
      `).join("")}
    </div>
  </section>
  ` : "";

  // Field-note images: from iPad markup app, optional inclusion.
  const fieldNoteImagesHtml = fieldNoteImages.length > 0 ? `
  <section style="margin-bottom:32px;">
    <p style="margin:0 0 12px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Reference Notes</p>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
      ${fieldNoteImages.map((url) => `
        <img src="${url}" alt="Field note" style="width:100%;border:1px solid #e5e5e5;display:block;page-break-inside:avoid;" />
      `).join("")}
    </div>
  </section>
  ` : "";

  // Inline styles for the cover and body cards. They share the page card
  // look (white bg, padding, shadow on screen) but the cover layout is
  // a centered flex column and forces a page break after.
  const cardBaseStyle = forEmail
    ? "background:#fff;padding:32px 40px;"
    : "background:#fff;padding:48px;box-shadow:0 2px 12px rgba(0,0,0,0.08);";

  // Cover page: logo + title block at the top, large hero image below.
  // Renders only if a cover image is selected. Wrapped in its own page
  // card so it visually separates from the body on screen, and uses
  // page-break-after for the printed PDF.
  //
  // Sizing: Letter is 11in tall. With 0.5in @page margins on each side
  // and the page card's 48px padding, the available area is ~9in. Keep
  // the section min-height comfortably under that so it doesn't
  // overflow into a second page before the page-break-after fires.
  const coverPageHtml = coverImage ? `
  <section class="proposal-page proposal-cover" style="${cardBaseStyle}page-break-after:always;display:flex;flex-direction:column;align-items:center;text-align:center;min-height:8.25in;">
    <img src="${logoUrl}" alt="${esc(biz.biz_name || "RELIC")}" style="width:75%;max-width:520px;height:auto;object-fit:contain;margin-bottom:18px;" />
    <div style="margin-bottom:18px;">
      <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.16em;color:#bbb;">Proposal</p>
      <h1 style="margin:6px 0 0;font-size:30px;font-weight:bold;color:#111;letter-spacing:0.02em;">${esc(estimate.project_name || "")}</h1>
      <p style="margin:10px 0 0;font-size:17px;color:#555;">Prepared for ${esc(estimate.client_name || "—")}</p>
      <p style="margin:10px 0 0;font-size:12px;color:#999;font-family:monospace;">${esc(estimate.estimate_number)} &nbsp;·&nbsp; ${dateText}</p>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;width:100%;">
      <img src="${coverImage}" alt="Project cover" style="max-width:100%;max-height:5.25in;object-fit:contain;border:1px solid #e5e5e5;" />
    </div>
  </section>
  ` : "";

  // Lump-sum cost — client sees just the total + deposit + balance.
  // The materials/labor/markup breakdown is intentionally hidden so the
  // proposal reads as a fixed-price quote.
  const costHtml = `
  <section style="margin-bottom:32px;page-break-inside:avoid;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Investment</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-top:2px solid #c4a24d;border-bottom:2px solid #c4a24d;">
        <td style="padding:14px 0;font-size:18px;font-weight:bold;color:#111;">Project Total</td>
        <td style="padding:14px 0;text-align:right;font-size:22px;font-family:monospace;font-weight:bold;color:#111;">${money(totals.total)}</td>
      </tr>
      <tr><td style="padding:8px 0 4px;font-size:12px;color:#888;">Deposit (${depositPct}%) due to start</td><td style="padding:8px 0 4px;text-align:right;font-size:12px;font-family:monospace;color:#555;">${money(depositAmount)}</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#888;">Balance prior to delivery</td><td style="padding:4px 0;text-align:right;font-size:12px;font-family:monospace;color:#555;">${money(balanceDue)}</td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:11px;color:#999;font-style:italic;line-height:1.5;">
      This proposal is valid through <strong style="color:#555;font-style:normal;">${expiresText}</strong>.
    </p>
  </section>
  `;

  const termsHtml = biz.terms_text ? `
  <section style="margin-bottom:24px;page-break-inside:avoid;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Terms</p>
    <p style="margin:0;font-size:11px;color:#888;white-space:pre-wrap;line-height:1.7;">${esc(biz.terms_text)}</p>
  </section>
  ` : "";

  return `
<style>
  /* On screen: each "page" is a sheet of paper with shadow + gap.
     In print/PDF: collapse those styles so pages render seamlessly. */
  @media print {
    .proposal-page { box-shadow: none !important; padding: 0 !important; min-height: 0 !important; }
    .proposal-page-gap { display: none !important; }
  }
</style>
<div ${wrap}>

  ${coverPageHtml}
  ${coverImage ? pageGapHtml : ""}

  <section class="proposal-page proposal-body" style="${cardBaseStyle}">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:28px;">
    <img src="${logoUrl}" alt="RELIC Custom Fabrications" style="height:72px;object-fit:contain;" />
    <div style="text-align:right;">
      <h1 style="margin:0 0 10px;font-size:32px;font-weight:bold;color:#111;letter-spacing:0.04em;">PROPOSAL</h1>
      ${biz.biz_name ? `<p style="margin:0;font-size:13px;font-weight:bold;color:#222;">${esc(biz.biz_name)}</p>` : ""}
      ${biz.biz_address ? `<p style="margin:2px 0;font-size:12px;color:#666;">${esc(biz.biz_address)}</p>` : ""}
      ${addressLine2 ? `<p style="margin:2px 0;font-size:12px;color:#666;">${esc(addressLine2)}</p>` : ""}
      ${biz.biz_phone ? `<p style="margin:6px 0 0;font-size:12px;color:#666;">${esc(biz.biz_phone)}</p>` : ""}
    </div>
  </div>

  <div style="border-top:1px solid #e5e5e5;margin-bottom:28px;"></div>

  <!-- Project / Client / Number -->
  <div style="display:flex;gap:24px;margin-bottom:32px;">
    <div style="flex:1;">
      <p style="margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Prepared For</p>
      <p style="margin:0;font-size:15px;font-weight:bold;color:#111;">${esc(estimate.client_name || "—")}</p>
    </div>
    <div style="flex:1;">
      <p style="margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Project</p>
      <p style="margin:0;font-size:15px;font-weight:bold;color:#111;">${esc(estimate.project_name || "—")}</p>
    </div>
    <div style="text-align:right;">
      <p style="margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:#bbb;">Proposal #</p>
      <p style="margin:0;font-size:13px;font-family:monospace;color:#555;">${esc(estimate.estimate_number)}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#666;">${dateText}</p>
    </div>
  </div>

  ${highlightsHtml}
  ${scopeHtml}
  ${projectImagesHtml}
  ${fieldNoteImagesHtml}
  ${costHtml}
  ${termsHtml}
  ${acceptanceSection}

  <div style="margin-top:36px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#ccc;text-align:center;">
    R&ensp;E&ensp;L&ensp;I&ensp;C &nbsp;&middot;&nbsp; Custom Fabrications &nbsp;&middot;&nbsp; (402) 235-8179 &nbsp;&middot;&nbsp; relicbuilt.com
  </div>

  </section>

</div>`;
}
