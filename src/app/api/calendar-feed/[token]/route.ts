import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadMergedCalendarData, buildRange } from "@/lib/calendar-data";

/**
 * iCal (.ics) feed for a Build Calendar share token, so the schedule can be
 * SUBSCRIBED into Apple/Google/Outlook calendars (each build becomes an
 * all-day, multi-day event spanning its build window). Token = access control.
 *
 * GET /api/calendar-feed/<token>   → text/calendar
 */
function icsDate(iso: string): string {
  return iso.replace(/-/g, ""); // YYYY-MM-DD → YYYYMMDD
}
function addDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function esc(s: string): string {
  return (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return new NextResponse("Not found", { status: 404 });

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
  if (!entity) return new NextResponse("This calendar link is no longer active.", { status: 404 });

  const brand = entity === "relic"
    ? (settings?.relic_profile?.name || "RELIC")
    : (settings?.biz_name || "Wallflower RELIC");
  const { projects, estimateHoursById, tentatives, tentativeHours } = await loadMergedCalendarData(supabase, entity);

  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wallflower RELIC//Build Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(brand)} Build Calendar`,
    `NAME:${esc(brand)} Build Calendar`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT3H",
    "X-PUBLISHED-TTL:PT3H",
  ];

  const addEvent = (id: string, name: string, range: { start: string; end: string }, desc: string, tentative: boolean) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${token}-${id}@relicbuilt.com`,
      `DTSTAMP:${stamp}`,
      `SUMMARY:${esc(name)}${tentative ? " (Tentative)" : ""}`,
      `DTSTART;VALUE=DATE:${icsDate(range.start)}`,
      `DTEND;VALUE=DATE:${addDay(range.end)}`,
      `DESCRIPTION:${esc(desc)}`,
      tentative ? "STATUS:TENTATIVE" : "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  };

  for (const p of projects) {
    const r = buildRange(p, estimateHoursById);
    if (!r) continue;
    if ((p.status as string) === "relic") { addEvent(p.id, "Relic Project", r, "Relic build (dates only)", false); continue; }
    addEvent(p.id, p.project_name || "Build", r, `Status: ${(p.status || "").replace("_", " ")}${p.client_name ? ` · ${p.client_name}` : ""}`, false);
  }
  for (const t of tentatives) {
    const r = buildRange(t, tentativeHours);
    if (r) addEvent(t.id, t.project_name || t.client_name || "Build", r, `Tentative (not yet approved)${t.client_name ? ` · ${t.client_name}` : ""}`, true);
  }

  lines.push("END:VCALENDAR");
  // iCal spec uses CRLF line endings.
  const body = lines.join("\r\n") + "\r\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="build-calendar.ics"`,
      "Cache-Control": "public, max-age=1800",
    },
  });
}
