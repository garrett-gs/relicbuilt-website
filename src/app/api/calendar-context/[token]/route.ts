import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadMergedCalendarData } from "@/lib/calendar-data";

/**
 * Public, read-only Build Calendar data for a share token. The token is the
 * access control: it maps to exactly one entity via settings.calendar_share_tokens,
 * and we return only that entity's calendar. No auth required.
 *
 * GET /api/calendar-context/<token>
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "not found" }, { status: 404 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name, relic_profile, calendar_share_tokens")
      .limit(1)
      .single();

    const tokens = (settings?.calendar_share_tokens || {}) as Record<string, string>;
    const entity = Object.keys(tokens).find((e) => tokens[e] === token);
    if (!entity) return NextResponse.json({ error: "This calendar link is no longer active." }, { status: 404 });

    const data = await loadMergedCalendarData(supabase, entity);
    const brand = entity === "relic"
      ? (settings?.relic_profile?.name || "RELIC")
      : (settings?.biz_name || "Wallflower RELIC");

    return NextResponse.json({ entity, brand, ...data });
  } catch (err) {
    console.error("[calendar-context] error:", err);
    return NextResponse.json({ error: "Couldn't load the calendar." }, { status: 500 });
  }
}
