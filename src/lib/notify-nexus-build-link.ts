/**
 * Outbound webhook that hands Nexus the Axiom build-portal URL for a build.
 *
 * Fires when the estimate is first created (from a Nexus intake) and again on
 * approval/sign-off, per the Nexus integration contract. The client-facing
 * portal lives at:  {AXIOM_PUBLIC_URL}/build/<estimate_id>?token=<proposal_token>
 *
 * Uses the SAME Nexus edge-function host + auth as the status/approval webhooks
 * (so it reuses secrets already configured): POSTs to
 *   {WR_SUPABASE_URL}/functions/v1/relic-build-link
 * with `Authorization: Bearer <WR_SUPABASE_SERVICE_KEY>` and
 * `x-relic-api-key: <RELIC_TO_WALLFLOWER_API_KEY>`. Set NEXUS_BUILD_WEBHOOK_URL
 * to override the endpoint. No-op (never throws) until the creds are present.
 */

const FN = "relic-build-link";

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
  if (!args.proposalToken) return;
  const bearer = process.env.WR_SUPABASE_SERVICE_KEY;
  const apiKey = process.env.RELIC_TO_WALLFLOWER_API_KEY;
  const wrBase = process.env.WR_SUPABASE_URL;
  const endpoint = process.env.NEXUS_BUILD_WEBHOOK_URL || (wrBase ? `${wrBase}/functions/v1/${FN}` : "");
  if (!endpoint || !bearer || !apiKey) return; // not configured yet — no-op

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
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        "x-relic-api-key": apiKey,
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
