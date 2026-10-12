// Outbound status webhook from RELIC → Wallflower RELIC.
//
// Wallflower stores its own work-order id on each row that originated from
// them (wallflower_work_orders.wallflower_order_id). When that row's status
// changes — or the status of anything downstream of it (the linked estimate,
// or the custom_work project the estimate eventually creates) — we POST a
// status update so Wallflower's dashboard shows the live RELIC state.
//
// Callers pass one of three id types (workOrderId, estimateId, customWorkId).
// We resolve them back to the wallflower_work_orders row, dedupe against the
// last-sent status, then POST. Failures are logged and swallowed — never
// allowed to break the local status update that triggered us.
//
// RELIC sends its status vocabulary as-is (e.g. "in_progress", "complete",
// "accepted", "sent", "new", "in_review", "quoted", "draft", "estimated",
// "received"). Wallflower normalizes to snake_case and colors known values;
// unrecognized values render neutral. Hand this list to the Wallflower side
// so they can map any new values into their color scheme.

import type { SupabaseClient } from "@supabase/supabase-js";

const ENDPOINT = "https://mgwvpkezvuswvbkzwysx.supabase.co/functions/v1/relic-status-update";

// Nexus's newer WO-lifecycle webhook. Separate contract from relic-status-update
// above: Nexus auto-closes the matching card when Axiom reports a WO complete.
// Same Supabase host, but a different function + the estimate.* shared key
// (x-axiom-api-key), echoing wallflower_order_id back. Override host via env.
const NEXUS_WO_ENDPOINT =
  process.env.NEXUS_WO_WEBHOOK_URL ||
  "https://mgwvpkezvuswvbkzwysx.supabase.co/functions/v1/axiom-webhook";

// Map Axiom's status vocabulary onto the WO-event contract Nexus accepts. Nexus
// 400s unknown statuses (no silent drift), so anything outside its WO vocabulary
// — estimate-lifecycle values like accepted/estimated/received/draft/new — maps
// to null and simply isn't forwarded (those ride the estimate.* flow instead).
type NexusWoEvent = { event: "work_order.completed" | "work_order.updated"; status: string };
function mapToNexusWoEvent(raw: string): NexusWoEvent | null {
  const s = (raw || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (["complete", "completed", "cleared", "done"].includes(s)) {
    return { event: "work_order.completed", status: "complete" };
  }
  if (["cancelled", "canceled"].includes(s)) {
    return { event: "work_order.updated", status: "cancelled" };
  }
  if (["pending", "in_progress", "waiting_on_parts"].includes(s)) {
    return { event: "work_order.updated", status: s };
  }
  return null;
}

// Fire the Nexus WO-lifecycle webhook. Independent best-effort — a failure here
// never blocks the relic-status-update send or the local status change.
async function fireNexusWorkOrderEvent(
  wallflowerOrderId: string,
  rawStatus: string,
  opts?: WallflowerNotifyOpts
): Promise<void> {
  try {
    const mapped = mapToNexusWoEvent(rawStatus);
    if (!mapped) return; // not part of Nexus's WO vocabulary — skip (avoids 400)

    // Auth mirrors the estimate.* events (see notify-nexus-build-link): a valid
    // Supabase bearer to clear the gateway + the shared x-axiom-api-key.
    const bearer = process.env.WR_SUPABASE_SERVICE_KEY;
    const axiomKey =
      process.env.RELIC_INBOUND_API_KEY || process.env.WALLFLOWER_API_KEY || "wfrelic2026";
    if (!bearer) return; // not configured — no-op

    const payload: Record<string, unknown> = {
      event: mapped.event,
      wallflower_order_id: wallflowerOrderId,
      status: mapped.status,
    };
    if (mapped.event === "work_order.completed") {
      payload.completed_at = new Date().toISOString();
    }
    if (opts?.actor) payload.completed_by = opts.actor;
    if (opts?.notes) payload.notes = opts.notes;

    const res = await fetch(NEXUS_WO_ENDPOINT, {
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
      // 404 = Nexus has no WO with this id yet; safe to ignore (nothing to close).
      console.error(`[nexus-wo-event] ${res.status} event=${mapped.event}: ${txt.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("[nexus-wo-event] error:", e);
  }
}

export type WallflowerSource = {
  workOrderId?: string;
  estimateId?: string;
  customWorkId?: string;
};

export type WallflowerNotifyOpts = {
  completed?: boolean;
  /** Who cleared/updated the WO — forwarded to Nexus as completed_by. */
  actor?: string;
  /** Optional free-text note forwarded to Nexus on the WO event. */
  notes?: string;
};

type ResolvedRow = {
  id: string;
  wallflower_order_id: string | null;
  last_wallflower_status_sent: string | null;
};

async function resolveRow(
  db: SupabaseClient,
  source: WallflowerSource
): Promise<ResolvedRow | null> {
  if (source.workOrderId) {
    const { data } = await db
      .from("wallflower_work_orders")
      .select("id, wallflower_order_id, last_wallflower_status_sent")
      .eq("id", source.workOrderId)
      .maybeSingle();
    return (data as ResolvedRow | null) ?? null;
  }
  if (source.estimateId) {
    const { data } = await db
      .from("wallflower_work_orders")
      .select("id, wallflower_order_id, last_wallflower_status_sent")
      .eq("estimate_id", source.estimateId)
      .maybeSingle();
    return (data as ResolvedRow | null) ?? null;
  }
  if (source.customWorkId) {
    // custom_work has no direct FK back to wallflower_work_orders, so we
    // chain through estimates: find the estimate that produced this project,
    // then look up the work order linked to that estimate.
    const { data: est } = await db
      .from("estimates")
      .select("id")
      .eq("custom_work_id", source.customWorkId)
      .maybeSingle();
    if (!est?.id) return null;
    return resolveRow(db, { estimateId: (est as { id: string }).id });
  }
  return null;
}

export async function notifyWallflowerStatus(
  db: SupabaseClient,
  source: WallflowerSource,
  status: string,
  opts?: WallflowerNotifyOpts
): Promise<void> {
  try {
    const apiKey = process.env.RELIC_TO_WALLFLOWER_API_KEY;
    // Supabase Edge Functions need a valid JWT as the Bearer token to pass
    // the gateway; the function itself authenticates on x-relic-api-key.
    // We reuse the same Wallflower service key the rest of the app already
    // uses for outbound calls (see lib/wr-supabase.ts).
    const bearer = process.env.WR_SUPABASE_SERVICE_KEY;
    if (!apiKey || !bearer) {
      console.warn("[wallflower-status] missing RELIC_TO_WALLFLOWER_API_KEY or WR_SUPABASE_SERVICE_KEY; skipping notify");
      return;
    }

    const row = await resolveRow(db, source);
    if (!row || !row.wallflower_order_id) return; // not a Wallflower-originated build
    if (row.last_wallflower_status_sent === status) return; // dedupe

    // Mirror WO lifecycle to Nexus's axiom-webhook (work_order.completed /
    // .updated) so completing a WO in Axiom auto-closes its Nexus card. Fired
    // independently — must not gate on, or be gated by, the relic-status-update
    // send below. Non-WO statuses are skipped inside the helper.
    await fireNexusWorkOrderEvent(row.wallflower_order_id, status, opts);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        "x-relic-api-key": apiKey,
      },
      body: JSON.stringify({
        work_order_id: row.wallflower_order_id,
        // The RELIC-side work order id, so Nexus can map/link the row and
        // surface a "received by RELIC" indicator against its own order.
        relic_work_order_id: row.id,
        status,
        ...(opts?.completed != null ? { completed: opts.completed } : {}),
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[wallflower-status] ${res.status} for status="${status}": ${txt.slice(0, 200)}`);
      return;
    }

    await db
      .from("wallflower_work_orders")
      .update({ last_wallflower_status_sent: status })
      .eq("id", row.id);
  } catch (err) {
    // Never throw — the local DB update that triggered us is the source of
    // truth, and this webhook is best-effort sync.
    console.error("[wallflower-status] error:", err);
  }
}
