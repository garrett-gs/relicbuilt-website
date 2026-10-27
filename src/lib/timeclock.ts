import { axiom } from "@/lib/axiom-supabase";
import type { TeamMember, TimeEntry } from "@/types/axiom";

// Fired after any clock in/out so the corner widget refreshes immediately
// instead of waiting for its next poll.
export const CLOCK_CHANGED_EVENT = "axiom:clock-changed";
export function emitClockChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CLOCK_CHANGED_EVENT));
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Hours between clock_in and clock_out (or now, if still open). */
export function hoursFromEntry(entry: { clock_in: string; clock_out?: string | null }) {
  const out = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
  return round2((out - new Date(entry.clock_in).getTime()) / 3600000);
}

/** Local "HH:MM" (24h) from an ISO timestamp — used on the project labor log. */
export function hhmmLocal(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Resolve the signed-in user to a team member by email (case-insensitive). */
export function findMemberByEmail(
  members: TeamMember[],
  email: string | null | undefined,
): TeamMember | null {
  if (!email) return null;
  return members.find((m) => m.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

/** The member's currently-open shift, if any. */
export async function getActiveEntry(memberName: string): Promise<TimeEntry | null> {
  const { data } = await axiom
    .from("time_entries")
    .select("*")
    .eq("member_name", memberName)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1);
  return data && data.length ? (data[0] as TimeEntry) : null;
}

export interface ClockOutOpts {
  tasks?: string[];
  memberName?: string;
  breakHours?: number;
  breakReason?: string;
}

/**
 * Close an open time entry and append it to the project's labor log.
 *
 * Shared by the Time Clock page and the corner widget so the two never drift.
 * The update is guarded by `clock_out IS NULL` so two devices can't double-close
 * the same shift, and it `.select()`s the row so a 0-row write (stale anon
 * session / already closed) throws instead of silently succeeding.
 */
export async function clockOutEntry(
  entry: TimeEntry,
  opts: ClockOutOpts = {},
): Promise<{ hours: number; clockOut: string }> {
  const tasks = opts.tasks ?? ((entry as unknown as { tasks?: string[] }).tasks || []);
  const memberName = opts.memberName ?? entry.member_name;
  const deduct = Math.max(0, Number(opts.breakHours) || 0);
  const breakReason = (opts.breakReason || "").trim();

  const clockOut = new Date().toISOString();
  const rawHours = hoursFromEntry({ ...entry, clock_out: clockOut });
  const hours = Math.max(0, round2(rawHours - deduct));
  const breakNote = deduct > 0 ? `[break: -${deduct}h${breakReason ? ` (${breakReason})` : ""}]` : "";

  const { data: updated, error } = await axiom
    .from("time_entries")
    .update({ clock_out: clockOut, hours, tasks, notes: breakNote || null })
    .eq("id", entry.id)
    .is("clock_out", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) {
    throw new Error("That shift was already clocked out, or your session expired. Refresh and check your hours.");
  }

  // Append to the project's labor log (Shop/product hours have no project).
  if (entry.custom_work_id) {
    const { data: project } = await axiom
      .from("custom_work")
      .select("labor_log, actual_cost")
      .eq("id", entry.custom_work_id)
      .single();
    if (project) {
      const rate = entry.hourly_rate || 60;
      const cost = round2(hours * rate);
      const baseDesc = tasks.length ? `${memberName} — ${tasks.join(", ")}` : memberName;
      const logEntry = {
        date: new Date().toISOString().split("T")[0],
        clock_in: hhmmLocal(entry.clock_in),
        clock_out: hhmmLocal(clockOut),
        hours,
        rate,
        cost,
        description: breakNote ? `${baseDesc} ${breakNote}` : baseDesc,
        tasks,
        source: "timeclock",
      };
      await axiom
        .from("custom_work")
        .update({
          labor_log: [...(project.labor_log || []), logEntry],
          actual_cost: (project.actual_cost || 0) + cost,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.custom_work_id);
    }
  }

  return { hours, clockOut };
}
