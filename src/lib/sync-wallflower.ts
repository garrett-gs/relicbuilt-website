import { getWRClient } from "@/lib/wr-supabase";
import { axiomAdmin } from "@/lib/axiom-admin";

/**
 * Sync companies + customers FROM Wallflower RELIC Nexus INTO Axiom.
 *
 * Direction is one-way (Nexus -> Axiom). Matching:
 *   - companies  : by normalized name
 *   - customers  : by normalized email, falling back to normalized name
 * On a match we UPDATE the Axiom row's fields with the Nexus values; otherwise
 * we INSERT a new row. Axiom's `companies` table only has name/address/industry,
 * so the extra Nexus company fields (email/phone/website/notes/unit) are dropped.
 *
 * New customer rows take the `customers.entity` column default (wallflower_relic)
 * — we never flip an existing row's entity here.
 *
 * This is the engine shared by the user-triggered route
 * (POST /api/axiom/sync-wallflower) and the daily cron
 * (GET /api/cron/sync-wallflower). It owns no auth — callers gate access.
 */

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export type SyncResult = {
  companies: { inserted: string[]; updated: string[] };
  customers: { inserted: string[]; updated: string[] };
};

export async function runWallflowerSync(): Promise<SyncResult> {
  const wr = getWRClient();
  // Nexus customers belong to the Wallflower workspace, whichever site runs this.
  const axiom = axiomAdmin("wallflower_relic");

  // ── Pull Nexus + existing Axiom data ──
  const [
    { data: wrCompanies, error: wrCoErr },
    { data: wrCustomers, error: wrCuErr },
    { data: axCompanies, error: axCoErr },
    { data: axCustomers, error: axCuErr },
  ] = await Promise.all([
    wr.from("companies").select("id,name,address,industry"),
    wr.from("customers").select("id,name,email,phone,type,status,address,website,industry,company_id"),
    // Wallflower rows only: Nexus is Wallflower's CRM, so it must never match
    // (and overwrite) a Relic company or customer with the same name/email.
    axiom.from("companies").select("id,name,address,industry").eq("entity", "wallflower_relic"),
    axiom.from("customers").select("id,name,email").eq("entity", "wallflower_relic"),
  ]);

  const anyErr = wrCoErr || wrCuErr || axCoErr || axCuErr;
  if (anyErr) {
    throw new Error(`Failed to read data: ${anyErr.message}`);
  }

  const now = new Date().toISOString();
  const result: SyncResult = {
    companies: { inserted: [], updated: [] },
    customers: { inserted: [], updated: [] },
  };

  // ── Companies ── build map: nexus company id -> axiom company id ──
  const axCompanyByName = new Map<string, { id: string }>();
  for (const c of axCompanies ?? []) axCompanyByName.set(norm(c.name), c);

  const nexusToAxiomCompany = new Map<string, string>();
  // Nexus company id -> name, for the denormalized customers.company_name.
  const nexusCompanyName = new Map<string, string>();
  for (const co of wrCompanies ?? []) nexusCompanyName.set(co.id, co.name);

  for (const co of wrCompanies ?? []) {
    const fields = { address: co.address ?? null, industry: co.industry ?? null };
    const match = axCompanyByName.get(norm(co.name));
    if (match) {
      await axiom.from("companies").update({ ...fields, updated_at: now }).eq("id", match.id);
      nexusToAxiomCompany.set(co.id, match.id);
      result.companies.updated.push(co.name);
    } else {
      const { data: inserted, error } = await axiom
        .from("companies")
        .insert({ name: co.name, ...fields })
        .select("id")
        .single();
      if (error || !inserted) {
        console.error("company insert failed:", co.name, error);
        continue;
      }
      nexusToAxiomCompany.set(co.id, inserted.id);
      axCompanyByName.set(norm(co.name), inserted);
      result.companies.inserted.push(co.name);
    }
  }

  // ── Customers ── match by email, then name ──
  const axCustByEmail = new Map<string, { id: string }>();
  const axCustByName = new Map<string, { id: string }>();
  for (const c of axCustomers ?? []) {
    if (c.email) axCustByEmail.set(norm(c.email), c);
    axCustByName.set(norm(c.name), c);
  }

  for (const cu of wrCustomers ?? []) {
    const companyId = cu.company_id ? nexusToAxiomCompany.get(cu.company_id) ?? null : null;
    const common = {
      name: cu.name,
      email: cu.email ?? null,
      phone: cu.phone ?? null,
      type: cu.type ?? "Individual",
      status: cu.status ?? "active",
      address: cu.address ?? null,
      website: cu.website ?? null,
      industry: cu.industry ?? null,
      company_id: companyId,
      company_name: cu.company_id ? nexusCompanyName.get(cu.company_id) ?? null : null,
    };

    const match =
      (cu.email && axCustByEmail.get(norm(cu.email))) ||
      axCustByName.get(norm(cu.name)) ||
      null;

    if (match) {
      // Note: we deliberately do not touch `notes` so manual Axiom notes survive.
      await axiom.from("customers").update({ ...common, updated_at: now }).eq("id", match.id);
      result.customers.updated.push(cu.name);
    } else {
      const { data: inserted, error } = await axiom
        .from("customers")
        .insert(common)
        .select("id")
        .single();
      if (error || !inserted) {
        console.error("customer insert failed:", cu.name, error);
        continue;
      }
      if (cu.email) axCustByEmail.set(norm(cu.email), inserted);
      axCustByName.set(norm(cu.name), inserted);
      result.customers.inserted.push(cu.name);
    }
  }

  return result;
}
