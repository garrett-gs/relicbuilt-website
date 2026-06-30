import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWRClient } from "@/lib/wr-supabase";

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
 * Auth: requires a valid Axiom user session — the caller must pass their
 * Supabase access token as `Authorization: Bearer <token>`.
 */

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export async function POST(req: NextRequest) {
  try {
    const axiomUrl = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

    // ── Verify the caller is a logged-in Axiom user ──
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authClient = createClient(axiomUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wr = getWRClient();
    const axiom = createClient(axiomUrl, serviceKey);

    // ── Pull Nexus + existing Axiom data ──
    const [
      { data: wrCompanies, error: wrCoErr },
      { data: wrCustomers, error: wrCuErr },
      { data: axCompanies, error: axCoErr },
      { data: axCustomers, error: axCuErr },
    ] = await Promise.all([
      wr.from("companies").select("id,name,address,industry"),
      wr.from("customers").select("id,name,email,phone,type,status,address,website,industry,company_id"),
      axiom.from("companies").select("id,name,address,industry"),
      axiom.from("customers").select("id,name,email"),
    ]);

    const anyErr = wrCoErr || wrCuErr || axCoErr || axCuErr;
    if (anyErr) {
      console.error("sync-wallflower read error:", anyErr);
      return NextResponse.json({ error: "Failed to read data", detail: anyErr.message }, { status: 500 });
    }

    const now = new Date().toISOString();
    const result = {
      companies: { inserted: [] as string[], updated: [] as string[] },
      customers: { inserted: [] as string[], updated: [] as string[] },
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

    return NextResponse.json({
      ok: true,
      summary: {
        companies: { inserted: result.companies.inserted.length, updated: result.companies.updated.length },
        customers: { inserted: result.customers.inserted.length, updated: result.customers.updated.length },
      },
      detail: result,
    });
  } catch (err) {
    console.error("sync-wallflower error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
