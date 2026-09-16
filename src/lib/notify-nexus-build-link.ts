/**
 * Outbound webhook that hands Nexus the Axiom build-portal URL for a build.
 *
 * Fires when the estimate is first created (from a Nexus intake) and again on
 * approval/sign-off, per the Nexus integration contract. The client-facing
 * portal lives at:  {AXIOM_PUBLIC_URL}/build/<estimate_id>?token=<proposal_token>
 *
 * Configured entirely by env — a no-op until Nexus provides the target:
 *   NEXUS_BUILD_WEBHOOK_URL   where to POST (required to fire)
 *   NEXUS_BUILD_WEBHOOK_KEY   sent as the `x-relic-api-key` header (optional)
 *   AXIOM_PUBLIC_URL          portal base (default https://axiom.wallflower-relic.com)
 * Never throws — a webhook failure must not break intake or approval.
 */

interface BuildLinkArgs {
  estimateId: string;
  estimateNumber?: string | null;
  proposalToken: string;
  wallflowerOrderId?: string | null;
  nexusRef?: unknown;
  event: "created" | "approved";
  status?: string;
}

export function buildPortalUrl(estimateId: string, proposalToken: string): string {
  const base = (process.env.AXIOM_PUBLIC_URL || "https://axiom.wallflower-relic.com").replace(/\/+$/, "");
  return `${base}/build/${estimateId}?token=${encodeURIComponent(proposalToken)}`;
}

export async function notifyNexusBuildLink(args: BuildLinkArgs): Promise<void> {
  const url = process.env.NEXUS_BUILD_WEBHOOK_URL;
  if (!url || !args.proposalToken) return; // not configured / no token yet — no-op
  const key = process.env.NEXUS_BUILD_WEBHOOK_KEY;
  const payload = {
    event: args.event,
    build_url: buildPortalUrl(args.estimateId, args.proposalToken),
    estimate_id: args.estimateId,
    estimate_number: args.estimateNumber ?? null,
    wallflower_order_id: args.wallflowerOrderId ?? null,
    nexus_ref: args.nexusRef ?? null,
    status: args.status ?? null,
  };
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-relic-api-key": key } : {}) },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("[notify-nexus-build-link] failed:", e);
  }
}
