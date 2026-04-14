"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Clock, User, Hammer, RefreshCw } from "lucide-react";

interface TeamMember {
  name: string;
  email: string;
  role: "admin" | "manager" | "staff";
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

export default function CrewPage() {
  const { userEmail } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [active, setActive] = useState<ActiveEntry[]>([]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [now, setNow] = useState(Date.now());

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
    if (!me || (me.role !== "admin" && me.role !== "manager")) {
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

  // Who's NOT clocked in
  const clockedInNames = new Set(active.map((e) => e.member_name));
  const offClock = members.filter((m) => !clockedInNames.has(m.name));

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-wide">
            Crew Status
          </h1>
          <p className="text-muted text-sm mt-1">
            Real-time view of who&apos;s on the clock
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-xs text-muted hover:text-accent transition-colors border border-border rounded px-3 py-2"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

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
              const color = colorMap[entry.member_name] || "#c4a24d";
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
                      since{" "}
                      {new Date(entry.clock_in).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
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
    </div>
  );
}
