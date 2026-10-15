/**
 * Outbound POST that hands Nexus a build's material cost so Nexus can record
 * it as project spend (a `project_spend_lines` row, category=materials,
 * source=axiom, paid=false). Matches Nexus's `axiom-build-cost` edge-function
 * contract. Fires whenever a build's cost is finalized or updated — i.e. from
 * "Send to WR Nexus" (send-to-wr), keyed on the relic_builds.id (build_id).
 *
 * Endpoint: {WR_SUPABASE_URL}/functions/v1/axiom-build-cost (override with
 * NEXUS_BUILD_COST_URL). Nexus is in SOFT-LAUNCH — the function accepts posts
 * without secret enforcement for now, so this fires as soon as the endpoint is
 * configured (WR_SUPABASE_URL is already set). Once Nexus flips on enforcement
 * (AXIOM_WEBHOOK_SECRET on their side), set NEXUS_BUILD_COST_SECRET here and it
 * rides along as the `X-Axiom-Secret` header. A Supabase-gateway Bearer is sent
 * too when WR_SUPABASE_SERVICE_KEY is available, in case JWT verify is on.
 *
 * Best-effort: never throws — a failure must not break "Send to WR Nexus".
 */

interface BuildCostArgs {
  /** relic_builds.id — the uuid Nexus keys project spend on. */
  buildId: string;
  /** Required. RELIC's material cost (pre-markup) for this build. */
  materialTotal: number;
  /** Optional — informational on Nexus, not posted as spend. */
  laborTotal?: number;
  /** Optional — supplier for this build's materials. */
  vendor?: string | null;
  /** Optional — YYYY-MM-DD; Nexus defaults to today when omitted. */
  incurredDate?: string | null;
  /** Optional — free-text memo. */
  notes?: string | null;
}

export async function notifyNexusBuildCost(args: BuildCostArgs): Promise<void> {
  if (!args.buildId || args.materialTotal == null) return;

  const secret = process.env.NEXUS_BUILD_COST_SECRET;
  const base = process.env.WR_SUPABASE_URL;
  const endpoint =
    process.env.NEXUS_BUILD_COST_URL || (base ? `${base}/functions/v1/axiom-build-cost` : "");
  // Fires as soon as the endpoint is configured. Soft-launch: the secret is
  // optional until Nexus enforces it; it's attached when NEXUS_BUILD_COST_SECRET is set.
  if (!endpoint) return;

  const payload: Record<string, unknown> = {
    build_id: args.buildId,
    material_total: args.materialTotal,
  };
  if (args.laborTotal != null) payload.labor_total = args.laborTotal;
  if (args.vendor) payload.vendor = args.vendor;
  if (args.incurredDate) payload.incurred_date = args.incurredDate;
  if (args.notes) payload.notes = args.notes;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) headers["X-Axiom-Secret"] = secret;
  const bearer = process.env.WR_SUPABASE_SERVICE_KEY;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[nexus-build-cost] ${res.status}: ${txt.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("[nexus-build-cost] error:", e);
  }
}
