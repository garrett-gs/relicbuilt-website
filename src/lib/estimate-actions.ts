import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { Estimate } from "@/types/axiom";

/**
 * Persist estimate updates and run the cross-entity side effects:
 *  - mirror status changes back to Wallflower (the route no-ops when the
 *    estimate isn't linked to a work order, so it's safe to always fire)
 *  - auto-advance a linked lead to "quoted" when the estimate is sent
 *  - auto-mark a linked lead "lost" when the estimate is rejected
 *
 * UI refresh (re-fetching lists, updating local selection) is the caller's job.
 * Used by both the Estimator page and the embedded EstimateDrawer so the
 * behavior is identical wherever an estimate is edited.
 */
export async function persistEstimate(
  id: string,
  updates: Partial<Estimate>,
  userEmail: string,
) {
  await axiom
    .from("estimates")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updates.status) {
    fetch("/api/wallflower-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: { estimateId: id }, status: updates.status }),
    }).catch((err) => console.error("[wallflower-status] notify failed:", err));
  }

  if (updates.status === "sent") {
    const { data: linkedLead } = await axiom
      .from("leads")
      .select("id, status")
      .eq("estimate_id", id)
      .maybeSingle();
    if (linkedLead && linkedLead.status !== "quoted" && linkedLead.status !== "lost") {
      await axiom
        .from("leads")
        .update({ status: "quoted", updated_at: new Date().toISOString() })
        .eq("id", linkedLead.id);
      await logActivity({
        action: "updated",
        entity: "lead",
        entity_id: linkedLead.id,
        label: "Lead auto-advanced to Quoted (estimate sent)",
        user_name: userEmail,
      });
    }
  }

  if (updates.status === "rejected") {
    const { data: linkedLead } = await axiom
      .from("leads")
      .select("id, status")
      .eq("estimate_id", id)
      .maybeSingle();
    if (linkedLead && linkedLead.status !== "lost") {
      await axiom
        .from("leads")
        .update({ status: "lost", updated_at: new Date().toISOString() })
        .eq("id", linkedLead.id);
      await logActivity({
        action: "updated",
        entity: "lead",
        entity_id: linkedLead.id,
        label: "Lead auto-marked Lost (estimate rejected)",
        user_name: userEmail,
      });
    }
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
