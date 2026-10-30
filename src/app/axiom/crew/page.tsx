"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { useAuth } from "@/components/axiom/AuthProvider";
import { formatDate } from "@/lib/utils";
import {
  deleteTimeEntry,
  editTimeEntry,
  setEntryApproval,
} from "@/lib/timeclock";
import type { TimeEntry } from "@/types/axiom";
import {
  Clock,
  User,
  Hammer,
  RefreshCw,
  CheckCircle2,
  Circle,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

interface TeamMember {
  name: string;
  email: string;
  role: "superadmin" | "admin" | "manager" | "staff";
  hourly_rate: number;
  color?: string;
}

interface ActiveEntry {
  id: string;
  member_name: string;
  project_name: string | null;
  custom_work_id: string | null;
  clock_in: string;
  tasks: string[] | null;
  notes: string | null;
}

function elapsed(clockIn: string) {
  const ms = Date.now() - new Date(clockIn).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const hhmm = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "—";

// Split date/time fields (month, day, year, hour, minute, am/pm) — easier to
// hit than a native picker on a shop screen. All in the browser's local zone.
interface DTParts {
  mo: string;
  d: string;
  y: string;
  h: string;
  mi: string;
  ap: "AM" | "PM";
}
function isoToParts(iso?: string): DTParts {
  const dt = iso ? new Date(iso) : new Date();
  let h = dt.getHours();
  const ap: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return {
    mo: String(dt.getMonth() + 1),
    d: String(dt.getDate()),
    y: String(dt.getFullYear()),
    h: String(h),
    mi: String(dt.getMinutes()).padStart(2, "0"),
    ap,
  };
}
// Returns a valid Date or null if any field is out of range / blank.
function partsToDate(p: DTParts): Date | null {
  const mo = Number(p.mo), d = Number(p.d), y = Number(p.y), h12 = Number(p.h), mi = Number(p.mi);
  if (![mo, d, y, h12, mi].every(Number.isFinite)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  if (h12 < 1 || h12 > 12 || mi < 0 || mi > 59) return null;
  let h = h12 % 12;
  if (p.ap === "PM") h += 12;
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  // Reject rollovers like Feb 31 → Mar 3.
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}
// Local YYYY-MM-DD for a date N days ago (for the default range).
function localDateStr(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Tab = "live" | "logs";
type SortMode = "incoming" | "name" | "date" | "project";

const SORT_LABELS: Record<SortMode, string> = {
  incoming: "As they come in",
  name: "Name",
  date: "Date",
  project: "Project",
};

// Group a list of entries for display. "incoming" is one flat, newest-first
// group with no header; the others group + label and sort the groups.
function buildGroups(
  list: TimeEntry[],
  mode: SortMode
): { key: string; label: string | null; entries: TimeEntry[] }[] {
  const byTimeDesc = (a: TimeEntry, b: TimeEntry) =>
    new Date(b.clock_in).getTime() - new Date(a.clock_in).getTime();
  if (mode === "incoming") {
    return [{ key: "all", label: null, entries: [...list].sort(byTimeDesc) }];
  }
  const map = new Map<string, TimeEntry[]>();
  const keyOf = (e: TimeEntry) =>
    mode === "name"
      ? e.member_name
      : mode === "project"
      ? e.project_name || "No project"
      : localDateStr(new Date(e.clock_in));
  for (const e of list) {
    const k = keyOf(e);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  const keys = Array.from(map.keys());
  // Date newest-first (ISO strings sort lexically); name/project alphabetical.
  keys.sort((a, b) => (mode === "date" ? b.localeCompare(a) : a.localeCompare(b)));
  return keys.map((k) => ({
    key: k,
    label: mode === "date" ? formatDate(k) : k,
    entries: map.get(k)!.sort(byTimeDesc),
  }));
}

export default function CrewPage() {
  const { userEmail } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [active, setActive] = useState<ActiveEntry[]>([]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<Tab>("live");

  // Time Logs state
  const today = new Date();
  const twoWeeksAgo = new Date(today.getTime() - 13 * 86_400_000);
  const [start, setStart] = useState(localDateStr(twoWeeksAgo));
  const [end, setEnd] = useState(localDateStr(today));
  const [personFilter, setPersonFilter] = useState("all");
  const [unapprovedOnly, setUnapprovedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>("incoming");
  const [logs, setLogs] = useState<TimeEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logErr, setLogErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Load settings to get team members + role check
    const { data: settings } = await axiom
      .from("settings")
      .select("team_members")
      .limit(1)
      .single();

    if (!settings) return;
    const team: TeamMember[] = settings.team_members || [];
    setMembers(team);

    // Check if current user is admin or manager
    const me = team.find(
      (m) => m.email?.toLowerCase() === userEmail.toLowerCase()
    );
    if (!me || (me.role !== "admin" && me.role !== "manager" && me.role !== "superadmin")) {
      setAuthorized(false);
      return;
    }
    setAuthorized(true);

    // Fetch all open time entries (clock_out is null = currently clocked in)
    const { data: entries } = await axiom
      .from("time_entries")
      .select("id, member_name, project_name, custom_work_id, clock_in, tasks, notes")
      .is("clock_out", null)
      .order("clock_in", { ascending: true });

    setActive((entries as ActiveEntry[]) || []);
  }, [userEmail]);

  useEffect(() => {
    load();
  }, [load]);

  // Tick the elapsed timers every 30s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Time Logs: fetch completed entries in the chosen window ──────────────
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogErr(null);
    // Local day bounds → ISO. End is inclusive through 23:59:59 local.
    const startIso = new Date(`${start}T00:00:00`).toISOString();
    const endIso = new Date(`${end}T23:59:59.999`).toISOString();
    const { data, error } = await axiom
      .from("time_entries")
      .select("*")
      .not("clock_out", "is", null)
      .gte("clock_in", startIso)
      .lte("clock_in", endIso)
      .order("clock_in", { ascending: false });
    if (error) setLogErr(error.message);
    setLogs((data as TimeEntry[]) || []);
    setLogsLoading(false);
  }, [start, end]);

  useEffect(() => {
    if (tab === "logs" && authorized) loadLogs();
  }, [tab, authorized, loadLogs]);

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center h-64 text-muted">
        Loading…
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted text-sm">
          You must be an Admin or Manager to view this page.
        </p>
      </div>
    );
  }

  // Build a lookup for member colors
  const colorMap: Record<string, string> = {};
  members.forEach((m) => {
    if (m.color) colorMap[m.name] = m.color;
  });
  void now; // elapsed() re-reads Date.now() on each 30s tick

  // Who's NOT clocked in
  const clockedInNames = new Set(active.map((e) => e.member_name));
  const offClock = members.filter((m) => !clockedInNames.has(m.name));

  // ── Group logs by person → date ──────────────────────────────────────────
  const filtered = logs
    .filter((e) => personFilter === "all" || e.member_name === personFilter)
    .filter((e) => !unapprovedOnly || !e.approved);

  const pending = filtered.filter((e) => !e.approved);
  const approvedList = filtered.filter((e) => e.approved);

  async function handleApprove(entry: TimeEntry, approved: boolean) {
    setBusyId(entry.id);
    setLogErr(null);
    try {
      await setEntryApproval(entry, approved, userEmail);
      setLogs((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, approved, approved_by: approved ? userEmail : undefined, approved_at: approved ? new Date().toISOString() : undefined }
            : e
        )
      );
    } catch (e) {
      setLogErr(e instanceof Error ? e.message : "Could not update approval.");
    } finally {
      setBusyId(null);
    }
  }

  async function approveMany(entries: TimeEntry[]) {
    for (const entry of entries) {
      if (entry.approved) continue;
      // Sequential so a mid-batch error leaves a clean state.
      // eslint-disable-next-line no-await-in-loop
      await handleApprove(entry, true);
    }
  }

  async function handleDelete(entry: TimeEntry) {
    if (!confirm(`Delete ${entry.member_name}'s entry on ${formatDate(entry.clock_in)} (${hhmm(entry.clock_in)}–${hhmm(entry.clock_out)})? This removes it from the project labor log too.`))
      return;
    setBusyId(entry.id);
    setLogErr(null);
    try {
      await deleteTimeEntry(entry);
      setLogs((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (e) {
      setLogErr(e instanceof Error ? e.message : "Could not delete entry.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-wide">Crew</h1>
          <p className="text-muted text-sm mt-1">
            {tab === "live" ? "Real-time view of who's on the clock" : "Review, correct, and approve logged hours"}
          </p>
        </div>
        <button
          onClick={() => (tab === "live" ? load() : loadLogs())}
          className="flex items-center gap-2 text-xs text-muted hover:text-accent transition-colors border border-border rounded px-3 py-2"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {([
          { key: "live" as Tab, label: `On the Clock (${active.length})` },
          { key: "logs" as Tab, label: "Time Logs" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
              (tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "live" && (
        <>
          {/* Clocked In */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h2 className="text-sm font-medium uppercase tracking-widest text-green-400">
                On the Clock ({active.length})
              </h2>
            </div>

            {active.length === 0 ? (
              <div className="bg-card border border-border rounded p-6 text-center text-muted text-sm">
                Nobody is clocked in right now.
              </div>
            ) : (
              <div className="grid gap-3">
                {active.map((entry) => {
                  const color = colorMap[entry.member_name] || "#5b642e";
                  return (
                    <div
                      key={entry.id}
                      className="bg-card border border-border rounded-lg p-4 flex items-start gap-4"
                    >
                      {/* Avatar circle */}
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                        style={{
                          background: `${color}22`,
                          color,
                          border: `2px solid ${color}`,
                        }}
                      >
                        {entry.member_name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">
                          {entry.member_name}
                        </p>

                        {/* Project */}
                        <div className="flex items-center gap-1.5 mt-1">
                          <Hammer size={12} className="text-accent shrink-0" />
                          <span className="text-sm text-muted truncate">
                            {entry.project_name || "No project"}
                          </span>
                        </div>

                        {/* Tasks */}
                        {entry.tasks && entry.tasks.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {entry.tasks.map((t) => (
                              <span
                                key={t}
                                className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Elapsed time */}
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1.5 text-green-400">
                          <Clock size={13} />
                          <span className="font-mono text-sm font-medium">
                            {elapsed(entry.clock_in)}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted mt-1">
                          since {hhmm(entry.clock_in)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Off Clock */}
          <div>
            <h2 className="text-sm font-medium uppercase tracking-widest text-muted/60 mb-3">
              Off the Clock ({offClock.length})
            </h2>
            {offClock.length === 0 ? (
              <p className="text-muted text-sm">Everyone is clocked in!</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {offClock.map((m) => (
                  <div
                    key={m.name}
                    className="flex items-center gap-2 bg-card border border-border rounded px-3 py-2"
                  >
                    <User size={14} className="text-muted/40" />
                    <span className="text-sm text-muted">{m.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "logs" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 mb-5">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted/60">From</span>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted/60">To</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted/60">Person</span>
              <select
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
              >
                <option value="all">Everyone</option>
                {members.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted/60">Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortMode)}
                className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
              >
                {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
                  <option key={k} value={k}>{SORT_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer py-1.5">
              <input
                type="checkbox"
                checked={unapprovedOnly}
                onChange={(e) => setUnapprovedOnly(e.target.checked)}
                className="accent-accent"
              />
              Needs approval only
            </label>
          </div>

          {logErr && (
            <div className="mb-4 text-xs text-red-400 border border-red-500/30 bg-red-500/5 rounded px-3 py-2">
              {logErr}
            </div>
          )}

          {logsLoading ? (
            <div className="text-muted text-sm py-10 text-center">Loading logs…</div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-border rounded p-6 text-center text-muted text-sm">
              No clocked entries in this range.
            </div>
          ) : (
            <div className="space-y-8">
              {/* Needs approval — the actionable set, on top */}
              {pending.length > 0 && (
                <LogSection
                  title="Needs approval"
                  dotClass="bg-amber-400"
                  entries={pending}
                  sortBy={sortBy}
                  colorMap={colorMap}
                  busyId={busyId}
                  showApproveAll
                  onApproveMany={approveMany}
                  onToggleApprove={(e) => handleApprove(e, !e.approved)}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                />
              )}

              {/* Approved — tucked below the line */}
              {approvedList.length > 0 && (
                <LogSection
                  title="Approved"
                  dotClass="bg-green-500"
                  entries={approvedList}
                  sortBy={sortBy}
                  colorMap={colorMap}
                  busyId={busyId}
                  onToggleApprove={(e) => handleApprove(e, !e.approved)}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                />
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <EditEntryModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setLogs((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// A labeled block of entries (e.g. "Needs approval" / "Approved"), grouped
// inside per the active sort. "As they come in" renders one flat, header-less
// list; the other sorts add group headers with sub-totals.
function LogSection({
  title,
  dotClass,
  entries,
  sortBy,
  colorMap,
  busyId,
  showApproveAll,
  onApproveMany,
  onToggleApprove,
  onEdit,
  onDelete,
}: {
  title: string;
  dotClass: string;
  entries: TimeEntry[];
  sortBy: SortMode;
  colorMap: Record<string, string>;
  busyId: string | null;
  showApproveAll?: boolean;
  onApproveMany?: (entries: TimeEntry[]) => void;
  onToggleApprove: (e: TimeEntry) => void;
  onEdit: (e: TimeEntry) => void;
  onDelete: (e: TimeEntry) => void;
}) {
  const groups = buildGroups(entries, sortBy);
  const totalHours = entries.reduce((s, e) => s + (e.hours || 0), 0);
  const totalCost = entries.reduce((s, e) => s + (e.hours || 0) * (e.hourly_rate || 0), 0);

  return (
    <div>
      {/* Section line */}
      <div className="flex items-center gap-2.5 border-b border-border pb-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <h2 className="text-sm font-medium uppercase tracking-widest text-foreground">
          {title} ({entries.length})
        </h2>
        <span className="text-[11px] text-muted">
          {totalHours.toFixed(2)} h · {money(totalCost)}
        </span>
        {showApproveAll && onApproveMany && (
          <button
            onClick={() => onApproveMany(entries)}
            className="ml-auto flex items-center gap-1.5 text-[11px] text-accent hover:text-accent/80 border border-accent/30 rounded px-2.5 py-1.5"
          >
            <CheckCircle2 size={13} />
            Approve all ({entries.length})
          </button>
        )}
      </div>

      <div className="space-y-4">
        {groups.map((g) => {
          const gHours = g.entries.reduce((s, e) => s + (e.hours || 0), 0);
          const gCost = g.entries.reduce((s, e) => s + (e.hours || 0) * (e.hourly_rate || 0), 0);
          const dotColor = sortBy === "name" ? colorMap[g.key] || "#5b642e" : null;
          return (
            <div key={g.key}>
              {g.label && (
                <div className="flex items-center gap-2 mb-2">
                  {dotColor && (
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor }} />
                  )}
                  <span className="text-xs font-medium text-foreground">{g.label}</span>
                  <span className="text-[11px] text-muted font-mono">
                    {gHours.toFixed(2)} h · {money(gCost)}
                  </span>
                  {showApproveAll && onApproveMany && (
                    <button
                      onClick={() => onApproveMany(g.entries)}
                      className="ml-auto text-[11px] text-accent/80 hover:text-accent"
                    >
                      Approve all
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {g.entries.map((e) => (
                  <LogRow
                    key={e.id}
                    entry={e}
                    busy={busyId === e.id}
                    onToggleApprove={() => onToggleApprove(e)}
                    onEdit={() => onEdit(e)}
                    onDelete={() => onDelete(e)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogRow({
  entry: e,
  busy,
  onToggleApprove,
  onEdit,
  onDelete,
}: {
  entry: TimeEntry;
  busy: boolean;
  onToggleApprove: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cost = (e.hours || 0) * (e.hourly_rate || 0);
  return (
    <div className="flex items-start gap-3 rounded border border-border/60 bg-card px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted/80">{formatDate(e.clock_in)}</span>
          <span className="font-mono text-xs text-foreground">
            {hhmm(e.clock_in)} – {hhmm(e.clock_out)}
          </span>
          <span className="font-mono text-xs font-semibold text-accent">
            {(e.hours || 0).toFixed(2)} h
          </span>
          <span className="text-[11px] text-muted">
            {money(cost)} <span className="text-muted/50">@ {money(e.hourly_rate || 0)}/h</span>
          </span>
        </div>
        <p className="text-xs text-muted truncate mt-0.5">
          <span className="text-muted/80">{e.member_name}</span>
          {" · "}
          {e.project_name || "No project"}
        </p>
        {e.tasks && e.tasks.length > 0 && (
          <p className="text-[11px] text-muted/70 truncate">{e.tasks.join(", ")}</p>
        )}
        {e.notes && <p className="text-[11px] text-muted/70 italic truncate">{e.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onToggleApprove}
          disabled={busy}
          title={e.approved ? "Un-approve" : "Approve"}
          className={
            "p-1.5 rounded hover:bg-background disabled:opacity-40 " +
            (e.approved ? "text-green-400" : "text-muted hover:text-green-400")
          }
        >
          {e.approved ? <CheckCircle2 size={15} /> : <Circle size={15} />}
        </button>
        <button
          onClick={onEdit}
          disabled={busy}
          title="Edit"
          className="p-1.5 rounded text-muted hover:text-accent hover:bg-background disabled:opacity-40"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          title="Delete"
          className="p-1.5 rounded text-muted hover:text-red-400 hover:bg-background disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function EditEntryModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimeEntry;
  onClose: () => void;
  onSaved: (updated: TimeEntry) => void;
}) {
  const [clockIn, setClockIn] = useState<DTParts>(isoToParts(entry.clock_in));
  const [clockOut, setClockOut] = useState<DTParts>(isoToParts(entry.clock_out));
  const [tasks, setTasks] = useState((entry.tasks || []).join(", "));
  const [notes, setNotes] = useState(entry.notes || "");
  const [projectId, setProjectId] = useState<string>(entry.custom_work_id || "");
  const [projects, setProjects] = useState<{ id: string; project_name: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Projects the entry can be moved to — the same active set the clock-in
  // picker offers. The entry's current project is folded in even if it has
  // since closed, so it still shows as the selected option.
  useEffect(() => {
    let alive = true;
    axiom
      .from("custom_work")
      .select("id, project_name")
      .in("status", ["new", "in_review", "quoted", "accepted", "in_progress"])
      .order("project_name")
      .then(({ data }) => {
        if (!alive) return;
        const list = (data as { id: string; project_name: string | null }[]) || [];
        if (entry.custom_work_id && !list.some((p) => p.id === entry.custom_work_id)) {
          list.unshift({ id: entry.custom_work_id, project_name: entry.project_name || "Current project" });
        }
        setProjects(list);
      });
    return () => {
      alive = false;
    };
  }, [entry.custom_work_id, entry.project_name]);

  const inDate = partsToDate(clockIn);
  const outDate = partsToDate(clockOut);
  const previewHours =
    inDate && outDate && outDate.getTime() > inDate.getTime()
      ? Math.round(((outDate.getTime() - inDate.getTime()) / 3_600_000) * 100) / 100
      : null;

  async function save() {
    if (!inDate || !outDate) return;
    setSaving(true);
    setErr(null);
    try {
      // Only send the project fields when the admin actually changed it, so
      // untouched entries (including catalog-product ones) are left alone.
      const projectChanged = projectId !== (entry.custom_work_id || "");
      const projectPatch = projectChanged
        ? {
            custom_work_id: projectId || null,
            project_name: projectId
              ? projects.find((p) => p.id === projectId)?.project_name ?? null
              : null,
          }
        : {};
      const updated = await editTimeEntry(entry, {
        clock_in: inDate.toISOString(),
        clock_out: outDate.toISOString(),
        tasks: tasks.split(",").map((t) => t.trim()).filter(Boolean),
        notes: notes.trim(),
        ...projectPatch,
      });
      onSaved(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-foreground">Edit entry</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted mb-4">
          {entry.member_name} · {entry.project_name || "No project"}
        </p>

        <label className="flex flex-col gap-1 mb-3">
          <span className="text-[10px] uppercase tracking-widest text-muted/60">Project</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_name || "Untitled project"}</option>
            ))}
          </select>
          {projectId !== (entry.custom_work_id || "") && (
            <span className="text-[10px] text-amber-400/80">Moves this time (and its cost) to the selected project.</span>
          )}
        </label>

        <div className="space-y-3 mb-3">
          <DateTimeFields label="Clock in" value={clockIn} onChange={setClockIn} />
          <DateTimeFields label="Clock out" value={clockOut} onChange={setClockOut} />
        </div>

        <label className="flex flex-col gap-1 mb-3">
          <span className="text-[10px] uppercase tracking-widest text-muted/60">Tasks (comma-separated)</span>
          <input
            value={tasks}
            onChange={(e) => setTasks(e.target.value)}
            className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1 mb-3">
          <span className="text-[10px] uppercase tracking-widest text-muted/60">Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
          />
        </label>

        <div className="flex items-center justify-between text-xs text-muted mb-4">
          <span>
            {previewHours != null ? (
              <>New total: <span className="font-mono font-semibold text-accent">{previewHours.toFixed(2)} h</span></>
            ) : (
              <span className="text-red-400">Clock-out must be after clock-in</span>
            )}
          </span>
          {entry.approved && <span className="text-amber-400/80">Saving clears approval</span>}
        </div>

        {err && <div className="text-xs text-red-400 mb-3">{err}</div>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 text-sm text-muted border border-border rounded px-4 py-2 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || previewHours == null}
            className="flex-1 text-sm font-medium text-background bg-accent rounded px-4 py-2 hover:bg-accent/90 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Month / Day / Year  +  Hour : Minute AM/PM — six boxes instead of a native
// datetime picker. Invalid parts bubble up via partsToDate() returning null.
function DateTimeFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DTParts;
  onChange: (p: DTParts) => void;
}) {
  const box = "bg-background border border-border px-2 py-1.5 text-sm text-foreground text-center tabular-nums focus:outline-none focus:border-accent";
  const set = (patch: Partial<DTParts>) => onChange({ ...value, ...patch });
  const num = (v: string) => v.replace(/\D/g, "");
  const valid = partsToDate(value) !== null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-muted/60">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Date */}
        <input aria-label={`${label} month`} inputMode="numeric" maxLength={2} placeholder="MM"
          value={value.mo} onChange={(e) => set({ mo: num(e.target.value).slice(0, 2) })}
          className={box + " w-12"} />
        <span className="text-muted">/</span>
        <input aria-label={`${label} day`} inputMode="numeric" maxLength={2} placeholder="DD"
          value={value.d} onChange={(e) => set({ d: num(e.target.value).slice(0, 2) })}
          className={box + " w-12"} />
        <span className="text-muted">/</span>
        <input aria-label={`${label} year`} inputMode="numeric" maxLength={4} placeholder="YYYY"
          value={value.y} onChange={(e) => set({ y: num(e.target.value).slice(0, 4) })}
          className={box + " w-16"} />

        <span className="w-2" />

        {/* Time */}
        <input aria-label={`${label} hour`} inputMode="numeric" maxLength={2} placeholder="HH"
          value={value.h} onChange={(e) => set({ h: num(e.target.value).slice(0, 2) })}
          className={box + " w-12"} />
        <span className="text-muted">:</span>
        <input aria-label={`${label} minute`} inputMode="numeric" maxLength={2} placeholder="MM"
          value={value.mi} onChange={(e) => set({ mi: num(e.target.value).slice(0, 2) })}
          className={box + " w-12"} />
        <select aria-label={`${label} AM/PM`} value={value.ap}
          onChange={(e) => set({ ap: e.target.value as "AM" | "PM" })}
          className={box + " w-16"}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      {!valid && (value.mo || value.d || value.y) && (
        <span className="text-[10px] text-red-400">Check this date/time</span>
      )}
    </div>
  );
}
