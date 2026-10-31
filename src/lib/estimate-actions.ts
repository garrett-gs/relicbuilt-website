import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { Estimate } from "@/types/axiom";
import { authedFetch } from "@/lib/authed-fetch";

/**
 * Persist estimate updates and run the cross-entity side effects:
 *  - mirror status changes back to Wallflower (the route no-ops when the
 *    estimate isn't linked to a work order, so it's safe to always fire)
 *
 * UI refresh (re-fetching lists, updating local selection) is the caller's job.
 * Used by both the Estimator page and the embedded EstimateDrawer so the
 * behavior is identical wherever an estimate is edited.
 *
 * `_userEmail` is retained on the signature for call-site compatibility (and
 * future activity logging); the lead auto-advance/lost effects were removed
 * with the Leads feature.
 */
export async function persistEstimate(
  id: string,
  updates: Partial<Estimate>,
  _userEmail: string,
) {
  // `.select()` so we can see how many rows the update actually touched.
  // Supabase returns 200 with an empty array when RLS rejects the write —
  // typically a stale/expired auth session that's dropped to the read-only
  // anon role. Without this check a failed save looks successful and the
  // user's edits are silently lost. Throw so the caller can surface it.
  const { data, error } = await axiom
    .from("estimates")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  if (error) throw new Error(error.message || "Could not save changes.");
  if (!data || data.length === 0) {
    throw new Error(
      "Your session expired, so your changes couldn't be saved. Reload the page and sign in again — your edits are still on screen.",
    );
  }

  if (updates.status) {
    authedFetch("/api/wallflower-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: { estimateId: id }, status: updates.status }),
    }).catch((err) => console.error("[wallflower-status] notify failed:", err));
  }
}

export async function deleteEstimateById(id: string, userEmail: string) {
  await axiom.from("estimates").delete().eq("id", id);
  await logActivity({
    action: "deleted",
    entity: "estimate",
    entity_id: id,
    label: "Deleted estimate",
    user_name: userEmail,
  });
}
