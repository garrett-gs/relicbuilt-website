// Shared helpers (Spec §2, build step 2). Implement once, use everywhere.

import type { SupabaseClient } from "@supabase/supabase-js";
import { mcpUserEmail } from "./supabase.js";
import type { Totals } from "./types.js";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// --- 2b. calcTotals ------------------------------------------------------
// Mirror the app exactly. Totals are NOT stored — compute on read and include
// in every response. Round for display only; never write rounded values back.
export function calcTotals(
  lineItems: unknown,
  laborItems: unknown,
  markupPercent: unknown,
): Totals {
  const lines = Array.isArray(lineItems) ? lineItems : [];
  const labor = Array.isArray(laborItems) ? laborItems : [];
  const markup = Number(markupPercent) || 0;

  const materialTotal = lines.reduce(
    (s: number, li: Record<string, unknown>) =>
      s + (Number(li?.quantity) || 0) * (Number(li?.unit_price) || 0),
    0,
  );
  const laborTotal = labor.reduce(
    (s: number, l: Record<string, unknown>) => s + (Number(l?.cost) || 0),
    0,
  );
  const subtotal = materialTotal + laborTotal;
  const markupAmount = subtotal * (markup / 100);
  const total = subtotal + markupAmount;
  const marginPercent = total !== 0 ? (markupAmount / total) * 100 : 0;

  return {
    materialTotal: round2(materialTotal),
    laborTotal: round2(laborTotal),
    subtotal: round2(subtotal),
    markupAmount: round2(markupAmount),
    total: round2(total),
    // A 50% markup yields 33.3% margin — both are surfaced so they aren't confused.
    margin_percent: Math.round(marginPercent * 10) / 10,
  };
}

// --- 2a. generateEstimateNumber ------------------------------------------
// Ported from the app, with the .maybeSingle() fix so the first estimate of a
// new calendar year does not throw. Format: EST-<YYYY>-<NNNN>.
export async function generateEstimateNumber(client: SupabaseClient): Promise<string> {
  const year = new Date().getFullYear();
  const { data: latest } = await client
    .from("estimates")
    .select("estimate_number")
    .like("estimate_number", `EST-${year}-%`)
    .order("estimate_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastNum = latest?.estimate_number
    ? parseInt(String(latest.estimate_number).split("-").pop() || "0", 10)
    : 0;
  return `EST-${year}-${String(lastNum + 1).padStart(4, "0")}`;
}

// --- 2c. logActivity -----------------------------------------------------
// Every create/update writes an activity_log row, tagged meta.source="mcp".
export interface ActivityEntry {
  action: string;
  entity: string;
  entity_id?: string | null;
  label?: string;
  meta?: Record<string, unknown>;
}

export async function logActivity(
  client: SupabaseClient,
  entry: ActivityEntry,
): Promise<void> {
  const row = {
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entity_id ?? null,
    label: entry.label ?? null,
    user_name: mcpUserEmail(),
    meta: { source: "mcp", ...(entry.meta ?? {}) },
  };
  const { error } = await client.from("activity_log").insert(row);
  if (error) {
    // Non-fatal: log to stderr (never stdout — that's the MCP channel).
    console.error("[axiom-mcp] logActivity failed:", error.message);
  }
}

// --- 2d. stampUpdatedAt --------------------------------------------------
// No DB trigger maintains updated_at; every update must set it.
export function stampUpdatedAt(): { updated_at: string } {
  return { updated_at: new Date().toISOString() };
}

// --- 2e. Money validation ------------------------------------------------
// Decimal dollars, not integer cents. Reject non-finite/negative at the
// tool boundary. (Used by the write tools in later build steps.)
export function assertMoney(label: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number (dollars).`);
  }
  if (value < 0) {
    throw new Error(`${label} cannot be negative (got ${value}).`);
  }
  return value;
}
