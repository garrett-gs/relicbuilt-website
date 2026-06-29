// One-off lookup: find every estimate for a client and report its status
// and proposal-send state. Useful for the "did the proposal actually go
// out to so-and-so?" question without opening Axiom.
//
// Run:
//   node --env-file=.env.local scripts/lookup-client-estimate.mjs "Mary Watson"
//
// Optional second arg filters to estimates whose project name contains
// a substring (case-insensitive):
//   node --env-file=.env.local scripts/lookup-client-estimate.mjs "Mary Watson" trim

import { createClient } from "@supabase/supabase-js";

const [, , clientArg, projectArg] = process.argv;
if (!clientArg) {
  console.error("Usage: node --env-file=.env.local scripts/lookup-client-estimate.mjs <client-name> [project-substring]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Axiom Supabase credentials missing from .env.local");
  process.exit(1);
}

const axiom = createClient(url, key);

const { data, error } = await axiom
  .from("estimates")
  .select(
    "id,estimate_number,project_name,client_name,status,proposal_status,proposal_sent_at,proposal_approved_at,proposal_token,deposit_paid_at,created_at,updated_at",
  )
  .ilike("client_name", `%${clientArg}%`)
  .order("created_at", { ascending: false });

if (error) {
  console.error("Query failed:", error);
  process.exit(1);
}

const matches = projectArg
  ? data.filter((e) => (e.project_name || "").toLowerCase().includes(projectArg.toLowerCase()))
  : data;

if (matches.length === 0) {
  console.log(`No estimates found for client matching "${clientArg}"${projectArg ? ` + project ~ "${projectArg}"` : ""}.`);
  process.exit(0);
}

console.log(`Found ${matches.length} estimate(s):\n`);
for (const e of matches) {
  console.log(`  ${e.estimate_number} — ${e.project_name || "(no project name)"}`);
  console.log(`    Client:           ${e.client_name}`);
  console.log(`    Status:           ${e.status}`);
  console.log(`    Proposal status:  ${e.proposal_status ?? "(none)"}`);
  console.log(`    Proposal sent at: ${e.proposal_sent_at ?? "(never sent)"}`);
  console.log(`    Proposal approved:${e.proposal_approved_at ?? "(not approved)"}`);
  console.log(`    Deposit paid at:  ${e.deposit_paid_at ?? "(not paid)"}`);
  console.log(`    Created:          ${e.created_at}`);
  console.log(`    Updated:          ${e.updated_at}`);
  if (e.proposal_token) {
    console.log(`    Proposal link:    https://relicbuilt.com/axiom/portal/${e.proposal_token}`);
  }
  console.log("");
}

// Also list proposal audit events so we can see if Mary opened it
const ids = matches.map((e) => e.id);
const { data: events } = await axiom
  .from("proposal_audit_events")
  .select("estimate_id,event_type,created_at,signer_name,signer_email,ip_address")
  .in("estimate_id", ids)
  .order("created_at", { ascending: true });

if (events && events.length > 0) {
  console.log("Proposal events:\n");
  for (const ev of events) {
    const est = matches.find((m) => m.id === ev.estimate_id);
    console.log(`  ${ev.created_at}  [${est?.estimate_number}]  ${ev.event_type}${ev.signer_name ? ` — ${ev.signer_name}` : ""}${ev.signer_email ? ` <${ev.signer_email}>` : ""}`);
  }
} else {
  console.log("No proposal events recorded (no opens / signs / etc.)");
}
