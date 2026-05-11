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

export type WallflowerSource = {
  workOrderId?: string;
  estimateId?: string;
  customWorkId?: string;
};

export type WallflowerNotifyOpts = {
  completed?: boolean;
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

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        "x-relic-api-key": apiKey,
      },
      body: JSON.stringify({
        work_order_id: row.wallflower_order_id,
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
