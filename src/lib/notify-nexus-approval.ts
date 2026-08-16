import type { SupabaseClient } from "@supabase/supabase-js";
import { getWRClient } from "@/lib/wr-supabase";

// On Axiom design-proposal approval, push the approval event to Nexus's
// relic-approval-update edge function so Nexus marks the build approved and
// moves it toward invoice/payment. Best-effort: never throws, never blocks the
// approval that triggered it. Same edge-fn host + auth as the status webhook.
export async function notifyNexusApproval(
  axiom: SupabaseClient,
  estimate: { id: string; estimate_number?: string | null; client_name?: string | null },
  signatureName: string,
  approvedAmount: number
): Promise<void> {
  try {
    const base = process.env.WR_SUPABASE_URL;
    const bearer = process.env.WR_SUPABASE_SERVICE_KEY;
    const apiKey = process.env.RELIC_TO_WALLFLOWER_API_KEY;
    if (!base || !bearer || !apiKey) {
      console.warn("[nexus-approval] missing WR creds; skipping approval push");
      return;
    }

    // The build must be linked to a Nexus quote (via the work order's nexus_ref)
    // for the approval to have somewhere to land.
    const { data: wo } = await axiom
      .from("wallflower_work_orders")
      .select("nexus_ref")
      .eq("estimate_id", estimate.id)
      .not("nexus_ref", "is", null)
      .limit(1)
      .maybeSingle();
    const ref = (wo?.nexus_ref ?? null) as { type?: string; id?: string } | null;
    // Fire for builds linked to a Nexus quote OR order. Nexus only creates the
    // invoice on this approval event — never before — so scope-approval-first
    // is enforced by the handoff, not a premature invoice.
    if (!ref || !ref.id || (ref.type !== "quote" && ref.type !== "order")) return;

    // relic_build_id = the relic_builds row id in Nexus (seeded by send-to-wr),
    // which keys the exact quotes.items[] line to stamp as approved.
    let relicBuildId: string | null = null;
    try {
      const wr = getWRClient();
      const { data: rb } = await wr
        .from("relic_builds")
        .select("id")
        .eq("relic_estimate_id", estimate.id)
        .maybeSingle();
      relicBuildId = rb?.id ?? null;
    } catch (e) {
      console.error("[nexus-approval] relic_builds lookup failed:", e);
    }

    const payload = {
      nexus_ref: { type: ref.type, id: ref.id },
      relic_build_id: relicBuildId,
      approved: true,
      approved_amount: approvedAmount,
      approved_at: new Date().toISOString(),
      approved_by: signatureName || estimate.client_name || "Client",
      axiom_approval_id: crypto.randomUUID(),
      estimate_number: estimate.estimate_number ?? null,
      relic_estimate_id: estimate.id,
    };

    const res = await fetch(`${base}/functions/v1/relic-approval-update`, {
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
      console.error(`[nexus-approval] ${res.status}: ${txt.slice(0, 200)}`);
    }
  } catch (err) {
    console.error("[nexus-approval] error:", err);
  }
}
