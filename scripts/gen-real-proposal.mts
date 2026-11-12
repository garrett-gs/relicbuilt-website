// Render a REAL RELIC estimate's proposal with live branding + terms.
// Usage: tsx gen-real-proposal.mts <estimateId> <outFile>
import fs from "node:fs";
import path from "node:path";
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i > 0) process.env[t.slice(0, i)] ??= t.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const URL = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const api = async (p: string) => (await fetch(`${URL}/rest/v1/${p}`, { headers: H })).json();

const PH: any = await import("../src/lib/proposal-html");
const generateEstimateProposalHtml = PH.generateEstimateProposalHtml ?? PH.default?.generateEstimateProposalHtml;
const composeClientAddress = PH.composeClientAddress ?? PH.default?.composeClientAddress;
const EP: any = await import("../src/lib/entity-profile");
const proposalBiz = EP.proposalBiz ?? EP.default?.proposalBiz;

const estimateId = process.argv[2];
const out = process.argv[3] || "/tmp/relic-real-proposal.html";

const settings = (await api(`settings?select=*&limit=1`))[0];
const estimate = (await api(`estimates?id=eq.${estimateId}&select=*`))[0];
if (!estimate) { console.error("estimate not found"); process.exit(1); }

let clientCompany: string | undefined, clientAddress: string | undefined;
if (estimate.customer_id) {
  const c = (await api(`customers?id=eq.${estimate.customer_id}&select=*`))[0];
  if (c) {
    clientCompany = c.company_name || undefined;
    clientAddress = composeClientAddress ? composeClientAddress(c) : (c.address || undefined);
  }
}

const li = estimate.line_items || [];
const lab = estimate.labor_items || [];
const materialTotal = li.reduce((s: number, x: any) => s + (Number(x.quantity) || 0) * (Number(x.unit_price) || 0), 0);
const laborTotal = lab.reduce((s: number, x: any) => s + (Number(x.cost) || 0), 0);
const markupAmount = Math.round((materialTotal + laborTotal) * ((Number(estimate.markup_percent) || 0) / 100) * 100) / 100;
const total = Math.round((materialTotal + laborTotal + markupAmount + (Number(estimate.adjustment) || 0)) * 100) / 100;

const biz = proposalBiz("relic", settings); // terms now come from relic_profile.terms (your Settings)
const body = generateEstimateProposalHtml({
  estimate, biz,
  totals: { materialTotal, laborTotal, markupAmount, total },
  approveUrl: "#", forEmail: false,
  clientCompany, clientAddress,
});

const page = `<title>RELIC Proposal Preview</title>
<style>
  :root{ color-scheme: light; }
  body{ margin:0; background:#e9e8e4; }
  .banner{ font-family:Arial,Helvetica,sans-serif; background:#454d23; color:#fff; font-size:13px; padding:10px 16px; text-align:center; }
  .banner b{ color:#e8e0c8; }
  .stage{ padding:24px max(16px,env(safe-area-inset-right,0px)) 48px; }
</style>
<div class="banner">Real RELIC estimate <b>${estimate.estimate_number}</b> &mdash; rendered with your live branding &amp; Terms. This is what the client sees.</div>
<div class="stage">
${body}
</div>`;
fs.writeFileSync(out, page);
console.log(`wrote ${out} — ${estimate.estimate_number} "${estimate.project_name}" total $${total}`);
