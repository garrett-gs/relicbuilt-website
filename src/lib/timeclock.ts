import { axiom } from "@/lib/axiom-supabase";
import type { LaborEntry, TeamMember, TimeEntry } from "@/types/axiom";

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
        time_entry_id: entry.id,
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

// ── Admin time-log edits (Crew → Time Logs) ────────────────────────────────
//
// Editing or deleting a completed entry has to keep the project's labor log and
// rolled-up actual_cost in step, or the project P&L drifts from reality. We find
// the matching labor-log row by its `time_entry_id` stamp (exact, for entries
// clocked out after that field shipped) and fall back to a signature match for
// legacy rows. Cost is reconciled by delta against the matched row's stored
// cost so non-labor costs in actual_cost are left untouched.

/** Index of the labor-log row that came from this time entry, or -1. */
function laborLogIndexFor(log: LaborEntry[], entry: TimeEntry): number {
  const byId = log.findIndex((le) => le.time_entry_id && le.time_entry_id === entry.id);
  if (byId !== -1) return byId;
  // Legacy best-effort: timeclock-sourced, same start time + member + hours.
  const startHHMM = hhmmLocal(entry.clock_in);
  return log.findIndex(
    (le) =>
      le.source === "timeclock" &&
      !le.time_entry_id &&
      le.clock_in === startHHMM &&
      (le.description || "").startsWith(entry.member_name) &&
      Math.abs((le.hours || 0) - (entry.hours || 0)) < 0.011,
  );
}

/** Build the labor-log row for an (edited) entry — mirrors clockOutEntry. */
function laborRowFromEntry(entry: TimeEntry, hours: number): LaborEntry {
  const rate = entry.hourly_rate || 60;
  const tasks = entry.tasks || [];
  const baseDesc = tasks.length ? `${entry.member_name} — ${tasks.join(", ")}` : entry.member_name;
  return {
    date: (entry.clock_out || entry.clock_in).split("T")[0],
    clock_in: hhmmLocal(entry.clock_in),
    clock_out: entry.clock_out ? hhmmLocal(entry.clock_out) : undefined,
    hours,
    rate,
    cost: round2(hours * rate),
    description: entry.notes ? `${baseDesc} [${entry.notes}]` : baseDesc,
    tasks,
    source: "timeclock",
    time_entry_id: entry.id,
    edited: true,
  };
}

/** Reconcile the project labor log after an entry changed (replace) or was removed. */
async function reconcileLaborLog(
  original: TimeEntry,
  replacement: LaborEntry | null,
): Promise<void> {
  if (!original.custom_work_id) return;
  const { data: project } = await axiom
    .from("custom_work")
    .select("labor_log, actual_cost")
    .eq("id", original.custom_work_id)
    .single();
  if (!project) return;
  const log: LaborEntry[] = project.labor_log || [];
  const idx = laborLogIndexFor(log, original);
  const oldCost = idx !== -1 ? log[idx].cost || 0 : 0;
  const next = [...log];
  if (idx !== -1) {
    if (replacement) next[idx] = replacement;
    else next.splice(idx, 1);
  } else if (replacement) {
    // No matching row (legacy/hand-entered) — append rather than silently drop.
    next.push(replacement);
  }
  const newCost = replacement ? replacement.cost || 0 : 0;
  await axiom
    .from("custom_work")
    .update({
      labor_log: next,
      actual_cost: round2((project.actual_cost || 0) - oldCost + newCost),
      updated_at: new Date().toISOString(),
    })
    .eq("id", original.custom_work_id);
}

export interface EditEntryPatch {
  clock_in?: string; // ISO
  clock_out?: string; // ISO
  tasks?: string[];
  notes?: string;
  // Reassign the entry to a different project (someone clocked into the wrong
  // one). Omit to keep the current project; pass an id to move it, or null to
  // detach ("No project"). project_name is stored alongside for display.
  custom_work_id?: string | null;
  project_name?: string | null;
}

/**
 * Admin edit of a completed entry: recompute hours, write the row, reconcile the
 * project labor log, and clear any prior approval so the new numbers get re-signed.
 */
export async function editTimeEntry(original: TimeEntry, patch: EditEntryPatch): Promise<TimeEntry> {
  const clock_in = patch.clock_in ?? original.clock_in;
  const clock_out = patch.clock_out ?? original.clock_out;
  if (!clock_out) throw new Error("An entry needs a clock-out time before it can be edited here.");
  if (new Date(clock_out).getTime() <= new Date(clock_in).getTime())
    throw new Error("Clock-out must be after clock-in.");
  const hours = hoursFromEntry({ clock_in, clock_out });
  const tasks = patch.tasks ?? original.tasks ?? [];
  const notes = patch.notes ?? original.notes ?? null;

  // Project reassignment: undefined = keep as-is; otherwise move to the given
  // project (or null for none). A real change shifts the labor cost from the
  // old project's log to the new one's.
  const reassign = patch.custom_work_id !== undefined;
  const custom_work_id = reassign ? patch.custom_work_id ?? null : original.custom_work_id ?? null;
  const project_name = reassign ? patch.project_name ?? null : original.project_name ?? null;
  const projectChanged = reassign && (patch.custom_work_id ?? null) !== (original.custom_work_id ?? null);

  const updated: TimeEntry = {
    ...original,
    clock_in,
    clock_out,
    hours,
    tasks,
    notes: notes || undefined,
    custom_work_id: custom_work_id ?? undefined,
    project_name: project_name ?? undefined,
    // Moving to a real project means it's no longer a catalog-product entry.
    product_id: projectChanged && custom_work_id ? undefined : original.product_id,
    approved: false,
    approved_by: undefined,
    approved_at: undefined,
  };

  const updatePayload: Record<string, unknown> = {
    clock_in, clock_out, hours, tasks, notes,
    approved: false, approved_by: null, approved_at: null,
  };
  if (reassign) {
    updatePayload.custom_work_id = custom_work_id;
    updatePayload.project_name = project_name;
    if (projectChanged && custom_work_id) updatePayload.product_id = null;
  }

  const { data, error } = await axiom
    .from("time_entries")
    .update(updatePayload)
    .eq("id", original.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Entry not found — it may have been deleted. Refresh.");

  const laborRow = laborRowFromEntry(updated, hours);
  if (projectChanged) {
    // Remove the entry's cost from the old project, then add it to the new one.
    await reconcileLaborLog(original, null);
    await reconcileLaborLog(updated, laborRow);
  } else {
    await reconcileLaborLog(original, laborRow);
  }
  return updated;
}

/** Admin delete of a completed entry, backing its cost out of the project. */
export async function deleteTimeEntry(entry: TimeEntry): Promise<void> {
  const { data, error } = await axiom.from("time_entries").delete().eq("id", entry.id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Entry not found — it may already be gone. Refresh.");
  await reconcileLaborLog(entry, null);
}

/** Approve or un-approve an entry (sign-off that the times are accurate). */
export async function setEntryApproval(
  entry: TimeEntry,
  approved: boolean,
  approvedBy: string | null | undefined,
): Promise<TimeEntry> {
  const approved_at = approved ? new Date().toISOString() : null;
  const approved_by = approved ? approvedBy || null : null;
  const { data, error } = await axiom
    .from("time_entries")
    .update({ approved, approved_by, approved_at })
    .eq("id", entry.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Entry not found. Refresh.");
  return { ...entry, approved, approved_by: approved_by || undefined, approved_at: approved_at || undefined };
}
