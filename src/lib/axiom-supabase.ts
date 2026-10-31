import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SITE_ENTITY } from "@/lib/axiom-site";

// The workspace every request acts in, sent as `x-axiom-tenant` so the
// database can stamp new rows with it (current_tenant_id(), see
// supabase/tenancy-phase1.sql). A site locked to one business always sends
// that business; the legacy switcher updates it via setAxiomTenant().
let tenantSlug: string | null = SITE_ENTITY;

export function setAxiomTenant(slug: string | null) {
  tenantSlug = SITE_ENTITY ?? slug;
}

const withTenant: typeof fetch = (input, init) => {
  if (!tenantSlug) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set("x-axiom-tenant", tenantSlug);
  return fetch(input, { ...init, headers });
};

let _axiom: SupabaseClient | null = null;

export const axiom: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_axiom) {
      const url = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY;
      if (!url || !key) {
        throw new Error("Axiom Supabase credentials not configured. Set NEXT_PUBLIC_AXIOM_SUPABASE_URL and NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY in .env.local");
      }
      _axiom = createClient(url, key, { global: { fetch: withTenant } });
    }
    return (_axiom as unknown as Record<string | symbol, unknown>)[prop];
  },
});
