import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SITE_ENTITY } from "@/lib/axiom-site";

/**
 * Server-side Axiom database access (service key, bypasses row-level
 * security). Every server route uses this instead of creating its own client
 * so that each request names this site's workspace (`x-axiom-tenant`): the
 * database stamps new rows with it (see supabase/tenancy-phase1.sql).
 *
 * Because the service key sees every workspace, reads of tables that both
 * workspaces have their own copy of (inventory, vendors, receipts…) must be
 * scoped with `.eq("tenant_id", await siteTenantId(db))`.
 */

// The workspace this deployment serves. Each production site is locked to one
// business; an unlocked (local) build acts as Wallflower.
// Resolve the workspace this deployment serves, at RUNTIME. AXIOM_SITE_ENTITY is
// a non-public env var — unlike NEXT_PUBLIC_*, it is NOT inlined at build time,
// so it reads the current value on every cold start and is immune to Vercel's
// per-route build-cache staleness (which silently kept this route stamping the
// wrong tenant after the entity lock changed). Falls back to the build-time
// NEXT_PUBLIC entity, then to wallflower_relic.
function resolveSiteTenant(): string {
  return process.env.AXIOM_SITE_ENTITY || SITE_ENTITY || "wallflower_relic";
}

export const SITE_TENANT_SLUG: string = resolveSiteTenant();

export function axiomAdmin(slug: string = resolveSiteTenant()): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-axiom-tenant": slug } },
    },
  );
}

const ids = new Map<string, string>();

/** A workspace's id by slug (cached; workspaces don't change ids). */
export async function tenantIdForSlug(db: SupabaseClient, slug: string): Promise<string> {
  const hit = ids.get(slug);
  if (hit) return hit;
  const { data, error } = await db.from("tenants").select("id").eq("slug", slug).single();
  if (error || !data) throw new Error(`Unknown workspace "${slug}"`);
  ids.set(slug, data.id);
  return data.id;
}

export const siteTenantId = (db: SupabaseClient) => tenantIdForSlug(db, SITE_TENANT_SLUG);
