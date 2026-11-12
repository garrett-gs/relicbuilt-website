// Shared "price this quote request" action: turns a Nexus quote-request work
// order into a linked draft estimate and opens the Nexus pricing loop. Used by
// both the Nexus Intake board (Build Estimate) and the Estimator's New Estimate
// → From Quote Request flow, so the two entry points behave identically.

import { axiom } from "@/lib/axiom-supabase";
import { authedFetch } from "@/lib/authed-fetch";
import { logActivity } from "@/lib/activity";
import type { WallflowerWorkOrder, BusinessEntity } from "@/types/axiom";

export async function createEstimateFromQuoteRequest(
  wo: WallflowerWorkOrder,
  ctx: { entity: BusinessEntity; userEmail: string },
): Promise<{ id: string; estimate_number: string } | null> {
  // Next estimate number from the GLOBAL max (server-side) so it never collides
  // with another company's estimate in the shared table. Falls back to a
  // tenant-scoped guess only if the endpoint is unreachable.
  const year = new Date().getFullYear();
  let estimate_number = "";
  try {
    const res = await authedFetch(`/api/next-estimate-number?prefix=EST&year=${year}`);
    if (res.ok) {
      const j = await res.json();
      if (j?.estimate_number) estimate_number = j.estimate_number as string;
    }
  } catch { /* fall through */ }
  if (!estimate_number) {
    const { data: latest } = await axiom
      .from("estimates").select("estimate_number")
      .like("estimate_number", `EST-${year}-%`)
      .order("estimate_number", { ascending: false }).limit(1).maybeSingle();
    const lastNum = latest?.estimate_number ? parseInt(latest.estimate_number.split("-").pop() || "0", 10) : 0;
    estimate_number = `EST-${year}-${String(lastNum + 1).padStart(4, "0")}`;
  }

  // Stable proposal token so the Nexus build-portal URL is fixed from creation.
  const proposalToken = `prop_${(crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/-/g, "")}`;

  // Who it's for, carried over from the Nexus quote. Link an existing Axiom
  // customer by email (then by exact name) so the estimate ties to their record;
  // otherwise just carry the name/email/phone so the proposal still addresses
  // them. Never auto-create a customer here (avoids duplicates).
  const clientName = wo.client_name || "";
  const clientEmail = wo.client_email || null;
  const clientPhone = wo.client_phone || null;
  let customerId: string | null = null;
  if (clientEmail) {
    const { data: byEmail } = await axiom
      .from("customers").select("id").eq("entity", ctx.entity).ilike("email", clientEmail).limit(1).maybeSingle();
    customerId = byEmail?.id ?? null;
  }
  if (!customerId && clientName) {
    const { data: byName } = await axiom
      .from("customers").select("id").eq("entity", ctx.entity).ilike("name", clientName).limit(1).maybeSingle();
    customerId = byName?.id ?? null;
  }

  const { data } = await axiom
    .from("estimates")
    .insert({
      entity: ctx.entity,
      estimate_number,
      project_name: `Wallflower — ${wo.item_name}`,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      customer_id: customerId,
      status: "draft",
      line_items: [],
      labor_items: [],
      markup_percent: 0,
      notes: [
        `Work Order: ${wo.item_name}`,
        `Type: ${wo.work_type}`,
        `Scope: ${wo.scope}`,
        wo.occasion ? `Occasion: ${wo.occasion}` : "",
        wo.event_date ? `Event date: ${wo.event_date}` : "",
        wo.venue ? `Venue: ${wo.venue}` : "",
        wo.description ? `Description: ${wo.description}` : "",
        wo.quantity > 1 ? `Quantity: ${wo.quantity}` : "",
      ].filter(Boolean).join("\n"),
      images: wo.images && wo.images.length > 0 ? wo.images : undefined,
      proposal_token: proposalToken,
    })
    .select()
    .single();

  if (!data) return null;

  // Link the estimate back to the quote request and flip it to Estimated.
  await axiom
    .from("wallflower_work_orders")
    .update({ estimate_id: data.id, status: "estimated", updated_at: new Date().toISOString() })
    .eq("id", wo.id);

  // Tell Wallflower we've quoted it. Non-blocking.
  authedFetch("/api/wallflower-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: { workOrderId: wo.id }, status: "estimated" }),
  }).catch((err) => console.error("[wallflower-status] notify failed:", err));

  // Open the Nexus custom-build pricing loop for this estimate. Non-blocking.
  authedFetch("/api/wallflower/link-estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estimateId: data.id, estimateNumber: estimate_number, proposalToken, workOrderId: wo.id }),
  }).catch((err) => console.error("[wallflower/link-estimate] notify failed:", err));

  await logActivity({
    action: "created",
    entity: "estimate",
    entity_id: data.id,
    label: `Created estimate ${estimate_number} from Wallflower quote request`,
    user_name: ctx.userEmail,
  });

  return { id: data.id, estimate_number };
}
