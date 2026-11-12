// Render a sample RELIC proposal with the live RELIC profile + terms, exactly
// as a client would see it, and write a self-contained HTML page to view.
import fs from "node:fs";
import path from "node:path";
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i > 0) process.env[t.slice(0, i)] ??= t.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const URL = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const PH: any = await import("../src/lib/proposal-html");
const generateEstimateProposalHtml = PH.generateEstimateProposalHtml ?? PH.default?.generateEstimateProposalHtml;
const EP: any = await import("../src/lib/entity-profile");
const proposalBiz = EP.proposalBiz ?? EP.default?.proposalBiz;

const res = await fetch(`${URL}/rest/v1/settings?select=*&limit=1`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
const settings = (await res.json())[0];

// A realistic RELIC custom build.
const lineItems = [
  { category: "Lumber", description: "Black walnut live-edge slab, 8/4, kiln-dried (42\" × 84\")", quantity: 1, unit_price: 1450, unit: "ea" },
  { category: "Lumber", description: "Walnut edging & breadboard stock", quantity: 1, unit_price: 180, unit: "ea" },
  { category: "Metal", description: "Blackened steel cantilever base, fabricated", quantity: 1, unit_price: 620, unit: "ea" },
  { category: "Hardware", description: "Threaded inserts, bolts, leveling feet", quantity: 1, unit_price: 85, unit: "set" },
  { category: "Finish", description: "Rubio Monocoat hardwax oil + consumables", quantity: 1, unit_price: 140, unit: "ea" },
];
const laborItems = [
  { description: "Slab flattening, joinery & assembly", cost: 1400 },
  { description: "Steel base fabrication & welding", cost: 700 },
  { description: "Sanding, finishing & delivery", cost: 650 },
];
const materialTotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
const laborTotal = laborItems.reduce((s, li) => s + li.cost, 0);
const markupPct = 12;
const markupAmount = Math.round((materialTotal + laborTotal) * (markupPct / 100) * 100) / 100;
const adjustment = -25; // round the total
const total = Math.round((materialTotal + laborTotal + markupAmount + adjustment) * 100) / 100;

const estimate = {
  id: "sample",
  entity: "relic",
  estimate_number: "EST-2026-0142",
  project_name: "Walnut Live-Edge Executive Desk",
  client_name: "Sarah Meduna",
  client_email: "sarah@styledinwhite.com",
  client_phone: "(402) 802-1349",
  site_same_as_client: true,
  line_items: lineItems,
  labor_items: laborItems,
  markup_percent: markupPct,
  adjustment,
  deposit_percent: 50,
  proposal_scope: {
    included: true,
    body:
      "A one-of-a-kind executive desk built from a single book-matched black walnut slab with a blackened-steel cantilever base. Natural live edge retained and stabilized; surface finished in a low-sheen hardwax oil for a hand-rubbed feel. Cable management routed discreetly through the base. Delivered and set in place.",
  },
  proposal_highlights: [
    { included: true, title: "Single-slab top", body: "One continuous 42\" × 84\" black walnut slab — no glue-ups across the field." },
    { included: true, title: "Blackened steel base", body: "Hand-fabricated cantilever base, welded and patinated in-house." },
    { included: true, title: "Hand-rubbed finish", body: "Rubio Monocoat hardwax oil — repairable, food-safe, and warm underhand." },
  ],
  proposal_images_included: false,
  proposal_sent_at: new Date().toISOString(),
};

const biz = proposalBiz("relic", settings);
// Show the terms you set in RELIC Settings (the per-company Terms box).
biz.terms_text = settings.terms_text || biz.terms_text;
const body = generateEstimateProposalHtml({
  estimate,
  biz,
  totals: { materialTotal, laborTotal, markupAmount, total },
  approveUrl: "#",
  forEmail: false,
  clientCompany: "Styled in White",
  clientAddress: "1204 Jackson St, Omaha, NE 68102",
});

const page = `<title>RELIC Proposal Preview</title>
<style>
  :root{ color-scheme: light; }
  body{ margin:0; background:#e9e8e4; }
  .banner{ font-family:Arial,Helvetica,sans-serif; background:#454d23; color:#fff; font-size:13px; padding:10px 16px; text-align:center; }
  .banner b{ color:#e8e0c8; }
  .stage{ padding:24px max(16px,env(safe-area-inset-right,0px)) 48px; }
</style>
<div class="banner">Mock proposal &mdash; <b>sample data</b>, rendered with your RELIC branding and the <b>Terms &amp; Conditions from your RELIC Settings</b>. This is what a client sees.</div>
<div class="stage">
${body}
</div>`;

const out = process.argv[2] || "/tmp/relic-proposal.html";
fs.writeFileSync(out, page);
console.log("wrote", out, `(${page.length} bytes)`);
console.log("terms source:", (settings.relic_profile?.terms ? "relic_profile.terms" : (settings.terms_text ? "terms_text (fallback)" : "none")));
