import { getWRClient } from "@/lib/wr-supabase";

/**
 * Outbound webhook that hands Nexus the Axiom build-portal URL for a build,
 * matching Nexus's `relic-build-link` edge-function contract.
 *
 * Fires when the estimate is created (from a Nexus intake) and again on
 * approval/sign-off. Portal: {AXIOM_PUBLIC_URL}/build/<estimate_id>?token=<token>.
 *
 * Endpoint: {WR_SUPABASE_URL}/functions/v1/relic-build-link (override with
 * NEXUS_BUILD_WEBHOOK_URL). Auth: `Authorization: Bearer <WR_SUPABASE_SERVICE_KEY>`
 * for the Supabase gateway + `x-axiom-api-key: <RELIC_INBOUND_API_KEY>` (the shared
 * secret Nexus's function verifies; falls back to WALLFLOWER_API_KEY). Best-effort,
 * never throws — a webhook failure must not break intake or approval.
 */

const FN = "relic-build-link";
const EVENT_MAP: Record<"created" | "updated" | "approved", string> = {
  created: "estimate.created",
  updated: "estimate.updated",
  approved: "estimate.approved",
};

interface BuildLinkArgs {
  estimateId: string;
  estimateNumber?: string | null;
  proposalToken: string;
  event: "created" | "updated" | "approved";
  estimateAmount?: number;
  status?: string; // draft | sent | approved | rejected
  approvedAt?: string | null;
  approvedBy?: string | null;
  relicBuildId?: string | null; // resolved from the WR DB if not supplied
  wallflowerOrderId?: string | null;
  nexusRef?: unknown;
}

export function buildPortalUrl(estimateId: string, proposalToken: string): string {
  const base = (process.env.AXIOM_PUBLIC_URL || "https://axiom.wallflower-relic.com").replace(/\/+$/, "");
  return `${base}/build/${estimateId}?token=${encodeURIComponent(proposalToken)}`;
}

export async function notifyNexusBuildLink(args: BuildLinkArgs): Promise<void> {
  if (!args.proposalToken) return;
  const bearer = process.env.WR_SUPABASE_SERVICE_KEY;
  const wrBase = process.env.WR_SUPABASE_URL;
  const endpoint = process.env.NEXUS_BUILD_WEBHOOK_URL || (wrBase ? `${wrBase}/functions/v1/${FN}` : "");
  const axiomKey = process.env.RELIC_INBOUND_API_KEY || process.env.WALLFLOWER_API_KEY || "wfrelic2026";
  if (!endpoint || !bearer) return; // not configured — no-op

  // Nexus matches the build to quotes.items[].relic_build_id. It exists once
  // send-to-wr has seeded the relic_builds row (i.e. by approval time); at
  // create it may be null and Nexus falls back to build_url.
  let relicBuildId = args.relicBuildId ?? null;
  if (!relicBuildId) {
    try {
      const wr = getWRClient();
      const { data } = await wr
        .from("relic_builds")
        .select("id")
        .eq("relic_estimate_id", args.estimateId)
        .limit(1)
        .maybeSingle();
      relicBuildId = (data?.id as string | undefined) ?? null;
    } catch {
      /* WR not reachable — leave null */
    }
  }

  const payload = {
    event: EVENT_MAP[args.event],
    relic_build_id: relicBuildId,
    build_url: buildPortalUrl(args.estimateId, args.proposalToken),
    estimate_id: args.estimateId,
    estimate_number: args.estimateNumber ?? null,
    estimate_amount: args.estimateAmount ?? 0,
    status: args.status ?? (args.event === "approved" ? "approved" : "draft"),
    approved_at: args.approvedAt ?? null,
    approved_by: args.approvedBy ?? null,
    wallflower_order_id: args.wallflowerOrderId ?? null,
    nexus_ref: args.nexusRef ?? null,
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        "x-axiom-api-key": axiomKey,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[nexus-build-link] ${res.status}: ${txt.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("[nexus-build-link] error:", e);
  }
}
