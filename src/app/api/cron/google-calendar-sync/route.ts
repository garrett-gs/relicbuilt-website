// Pushes each entity's live build schedule into its dedicated Google calendar
// ("Axiom-<Business>"), so a subscribed Google Calendar stays accurate in near
// real time instead of lagging up to 24h on an .ics subscription refresh.
// Vercel Cron hits this every 15 min (see vercel.json); it reconciles — creates,
// updates, and deletes events to exactly match Axiom. Dormant until the service
// account + per-entity calendar IDs are set in env. Gated by CRONS_ENABLED (one
// project only) + CRON_SECRET, matching the other crons.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { googleConfigured } from "@/lib/google-calendar";
import { syncEntityToGoogle } from "@/lib/google-calendar-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (process.env.CRONS_ENABLED !== "true") {
    return Response.json({ skipped: true });
  }
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  if (!googleConfigured()) {
    return NextResponse.json({ skipped: "google service account not configured" });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Business names drive the calendar display name ("Axiom-<Business>").
  const { data: settings } = await supabase
    .from("settings")
    .select("biz_name, relic_profile")
    .limit(1)
    .single();
  const relicProfile = (settings?.relic_profile || {}) as { name?: string };

  const targets: { entity: string; calendarId: string; calendarName: string }[] = [];
  if (process.env.GOOGLE_CAL_ID_WALLFLOWER) {
    targets.push({
      entity: "wallflower_relic",
      calendarId: process.env.GOOGLE_CAL_ID_WALLFLOWER,
      calendarName: `Axiom-${settings?.biz_name || "Wallflower RELIC"}`,
    });
  }
  if (process.env.GOOGLE_CAL_ID_RELIC) {
    targets.push({
      entity: "relic",
      calendarId: process.env.GOOGLE_CAL_ID_RELIC,
      calendarName: `Axiom-${relicProfile.name || "RELIC"}`,
    });
  }

  if (!targets.length) {
    return NextResponse.json({ skipped: "no calendar ids configured" });
  }

  const results: unknown[] = [];
  for (const t of targets) {
    try {
      results.push(await syncEntityToGoogle(supabase, t.entity, t.calendarId, t.calendarName));
    } catch (e) {
      results.push({ entity: t.entity, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
