import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { SITE_TENANT_SLUG } from "@/lib/axiom-admin";

/**
 * Keeps each workspace's billing state in step with Relicon billing
 * (billing.relicon.app, the entitlements API). The database enforces it
 * (supabase/tenancy-phase3.sql): read_only blocks the team's changes, none
 * hides the workspace.
 *
 * Fails open: if the billing service can't be reached or isn't configured,
 * the last known state stands, so an outage never locks anyone out.
 */

export type WorkspaceAccess = "full" | "read_only" | "none";

export interface WorkspaceBilling {
  slug: string;
  name: string;
  access: WorkspaceAccess;
  billing_status: string | null;
  grace_ends_at: string | null;
  trial_ends_at: string | null;
  billing_checked_at: string | null;
}

const COLUMNS = "slug,name,access,billing_status,grace_ends_at,trial_ends_at,billing_checked_at";
const RECHECK_MS = 60 * 60 * 1000; // at most hourly from app opens

interface Entitlements {
  status: string;
  access: WorkspaceAccess;
  products: string[];
  grace_ends_at: string | null;
  trial_days_left: number | null;
}

/** Relicon's answer, reduced to what Axiom stores. Axiom must be in the plan. */
export function billingPatch(e: Entitlements, now: Date) {
  return {
    access: e.products.includes("axiom") ? e.access : ("none" as const),
    billing_status: e.status,
    grace_ends_at: e.grace_ends_at,
    trial_ends_at:
      e.trial_days_left === null ? null : new Date(now.getTime() + e.trial_days_left * 86_400_000).toISOString(),
    billing_checked_at: now.toISOString(),
  };
}

async function fetchEntitlements(accountId: string): Promise<Entitlements | null> {
  const key = process.env.RELICON_ENTITLEMENTS_KEY;
  if (!key) return null;
  const base = process.env.RELICON_BILLING_URL || "https://billing.relicon.app";
  try {
    const res = await fetch(`${base}/api/v1/entitlements/${accountId}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[relicon-billing] entitlements ${accountId}: ${res.status}`);
      return null;
    }
    return (await res.json()) as Entitlements;
  } catch (err) {
    console.error("[relicon-billing] entitlements unreachable:", err);
    return null;
  }
}

export async function workspaceBilling(db: SupabaseClient, slug = SITE_TENANT_SLUG): Promise<WorkspaceBilling | null> {
  const { data } = await db.from("tenants").select(COLUMNS).eq("slug", slug).maybeSingle<WorkspaceBilling>();
  return data;
}

/**
 * Refresh one workspace from Relicon (skipped if checked within the hour,
 * unless forced). Returns the workspace's current state either way.
 */
export async function refreshWorkspaceBilling(
  db: SupabaseClient,
  slug = SITE_TENANT_SLUG,
  { force = false, now = new Date() } = {},
): Promise<WorkspaceBilling | null> {
  const { data: t } = await db
    .from("tenants")
    .select(`${COLUMNS},billing_account_id`)
    .eq("slug", slug)
    .maybeSingle<WorkspaceBilling & { billing_account_id: string | null }>();
  if (!t) return null;
  const { billing_account_id, ...current } = t;
  if (!billing_account_id) return current; // not billed (internal)
  const fresh = t.billing_checked_at && now.getTime() - Date.parse(t.billing_checked_at) < RECHECK_MS;
  if (fresh && !force) return current;

  const e = await fetchEntitlements(billing_account_id);
  if (!e) return current;
  const patch = billingPatch(e, now);
  const { error } = await db.from("tenants").update(patch).eq("slug", slug);
  if (error) {
    console.error("[relicon-billing] update failed:", error.message);
    return current;
  }
  if (patch.access !== current.access) {
    console.log(`[relicon-billing] ${slug}: ${current.access} → ${patch.access} (${e.status})`);
  }
  return { ...current, ...patch };
}

/**
 * For server routes that change data on a team member's behalf: refuses when
 * this site's workspace is read-only or canceled. (The database enforces the
 * same rule for signed-in users; server routes use the service key, so they
 * check here.)
 */
export async function requireWritableWorkspace(db: SupabaseClient): Promise<NextResponse | null> {
  const w = await workspaceBilling(db);
  if (!w || w.access === "full") return null;
  return NextResponse.json(
    {
      error:
        w.access === "read_only"
          ? "This workspace is read-only until the Relicon bill is paid."
          : "This workspace's Relicon plan has ended.",
    },
    { status: 403 },
  );
}
