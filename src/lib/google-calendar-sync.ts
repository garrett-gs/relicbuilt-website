// Reconciles one entity's live build schedule into its dedicated Google
// calendar ("Axiom-<Business>"). The Axiom build calendar is the source of
// truth; this makes Google match it exactly on every run — creating new
// builds, updating moved dates, and DELETING anything that fell off (rejected
// or cancelled jobs, which loadCalendarData already drops). Self-healing: it
// never drifts, because it diffs desired-vs-actual rather than replaying edits.

import { SupabaseClient } from "@supabase/supabase-js";
import { loadCalendarData, buildRange } from "@/lib/calendar-data";
import {
  ensureCalendarName,
  listAxiomEvents,
  insertEvent,
  updateEvent,
  deleteEvent,
  type GCalEvent,
} from "@/lib/google-calendar";

/** All-day events use an EXCLUSIVE end date in Google; add a day to the
 *  inclusive build end so a 1-day build shows as a single day. */
function addDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function titleCase(s: string): string {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Desired {
  key: string;
  summary: string;
  start: string;
  endExclusive: string;
  description: string;
  tentative: boolean;
}

export interface SyncResult {
  entity: string;
  created: number;
  updated: number;
  deleted: number;
  desired: number;
  named?: boolean;
}

export async function syncEntityToGoogle(
  client: SupabaseClient,
  entity: string,
  calendarId: string,
  calendarName?: string
): Promise<SyncResult> {
  // Keep the calendar's display name correct where we're allowed to.
  let named: boolean | undefined;
  if (calendarName) named = await ensureCalendarName(calendarId, calendarName);

  const { projects, estimateHoursById, tentatives, tentativeHours } = await loadCalendarData(client, entity);

  const desired: Desired[] = [];
  for (const p of projects) {
    const r = buildRange(p, estimateHoursById);
    if (!r) continue;
    const status = String(p.status || "");
    const isMaster = status === "master";
    const parts = isMaster
      ? ["Master project — combined build window"]
      : [p.client_name ? `Client: ${p.client_name}` : "", status ? `Status: ${titleCase(status)}` : ""].filter(Boolean);
    desired.push({
      key: `axiom:${p.id}`,
      summary: p.project_name || "Build",
      start: r.start,
      endExclusive: addDay(r.end),
      description: parts.join("\n"),
      tentative: false,
    });
  }
  for (const t of tentatives) {
    const r = buildRange(t, tentativeHours);
    if (!r) continue;
    desired.push({
      key: `axiom:${t.id}`,
      summary: `${t.project_name || t.client_name || "Build"} (Tentative)`,
      start: r.start,
      endExclusive: addDay(r.end),
      description: ["Tentative — not yet approved", t.client_name ? `Client: ${t.client_name}` : ""].filter(Boolean).join("\n"),
      tentative: true,
    });
  }

  const existing = await listAxiomEvents(calendarId);
  const byKey = new Map<string, GCalEvent>();
  for (const e of existing) {
    const k = e.extendedProperties?.private?.axiomKey;
    if (k) byKey.set(k, e);
  }

  let created = 0, updated = 0, deleted = 0;
  const seen = new Set<string>();

  for (const d of desired) {
    seen.add(d.key);
    const body: GCalEvent = {
      summary: d.summary,
      description: d.description,
      start: { date: d.start },
      end: { date: d.endExclusive },
      transparency: "transparent",
      status: d.tentative ? "tentative" : "confirmed",
      extendedProperties: { private: { axiomSource: "build", axiomKey: d.key } },
    };
    const cur = byKey.get(d.key);
    if (!cur) {
      await insertEvent(calendarId, body);
      created++;
    } else {
      const changed =
        (cur.summary || "") !== body.summary ||
        cur.start?.date !== d.start ||
        cur.end?.date !== d.endExclusive ||
        (cur.description || "") !== d.description ||
        (cur.status || "confirmed") !== body.status;
      if (changed && cur.id) {
        await updateEvent(calendarId, cur.id, body);
        updated++;
      }
    }
  }

  // Anything we previously pushed that's no longer in the schedule → remove it
  // (this is what makes a rejected/cancelled job disappear from Google).
  for (const [k, e] of byKey) {
    if (!seen.has(k) && e.id) {
      await deleteEvent(calendarId, e.id);
      deleted++;
    }
  }

  return { entity, created, updated, deleted, desired: desired.length, named };
}
