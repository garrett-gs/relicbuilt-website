"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronUp, LogOut } from "lucide-react";
import { axiom } from "@/lib/axiom-supabase";
import { useAuth } from "@/components/axiom/AuthProvider";
import type { TeamMember, TimeEntry } from "@/types/axiom";
import {
  CLOCK_CHANGED_EVENT,
  clockOutEntry,
  findMemberByEmail,
  getActiveEntry,
} from "@/lib/timeclock";

function elapsedStr(clockIn: string) {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(clockIn).getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}`;
}

// Short label for the collapsed pill — the part after the last em dash, so
// "Ryan Horn — Radiator Cover" shows as "Radiator Cover".
function shortProject(name?: string) {
  if (!name) return "";
  const parts = name.split("—");
  return (parts[parts.length - 1] || name).trim();
}

/**
 * Floating "on the clock" reminder, top-right on every Axiom page. Shows only
 * when the signed-in user has an open shift; collapses to a pill and expands to
 * show the project with a one-tap Clock Out. Stays clear of the Assistant,
 * which lives bottom-right.
 */
export default function ClockWidget() {
  const { userEmail } = useAuth();
  const pathname = usePathname();
  const [member, setMember] = useState<TeamMember | null>(null);
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const memberRef = useRef<TeamMember | null>(null);

  // Resolve the signed-in user to a team member.
  useEffect(() => {
    if (!userEmail) { setMember(null); return; }
    let active = true;
    axiom.from("settings").select("team_members").limit(1).single().then(({ data }) => {
      if (!active) return;
      const me = findMemberByEmail((data?.team_members as TeamMember[]) || [], userEmail);
      setMember(me);
      memberRef.current = me;
    });
    return () => { active = false; };
  }, [userEmail]);

  const refresh = useCallback(async () => {
    const me = memberRef.current;
    if (!me) { setEntry(null); return; }
    const open = await getActiveEntry(me.name);
    setEntry(open);
  }, []);

  // Poll for the open shift: on member change, every 30s, on focus, and on an
  // explicit clock-changed event (same tab clocks in/out on the Time Clock page).
  useEffect(() => {
    if (!member) { setEntry(null); return; }
    refresh();
    const poll = setInterval(refresh, 30000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(CLOCK_CHANGED_EVENT, refresh as EventListener);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(CLOCK_CHANGED_EVENT, refresh as EventListener);
    };
  }, [member, refresh]);

  // Live timer while clocked in.
  useEffect(() => {
    if (!entry) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [entry]);

  async function handleClockOut() {
    if (!entry || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await clockOutEntry(entry, { memberName: member?.name });
      setEntry(null);
      setExpanded(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not clock out. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Hidden: not clocked in, or on the Time Clock page itself (the page already
  // shows the live clock there).
  if (!entry || pathname === "/axiom/timeclock") return null;

  const time = elapsedStr(entry.clock_in);
  void tick; // re-render each second

  return (
    <div
      className="fixed right-4 z-30 max-w-[calc(100vw-2rem)]"
      style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}
    >
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          aria-label="On the clock — expand"
          className="flex items-center gap-2.5 rounded-xl border border-accent/40 bg-card/95 px-3 py-2 shadow-xl backdrop-blur hover:border-accent/70"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <span className="font-mono text-sm tabular-nums text-foreground">{time}</span>
          <span className="max-w-[130px] truncate text-xs text-muted">{shortProject(entry.project_name)}</span>
          <ChevronUp size={13} className="text-muted" />
        </button>
      ) : (
        <div className="w-72 rounded-xl border border-accent/40 bg-card/95 p-3.5 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-accent">On the clock</span>
            <button
              onClick={() => setExpanded(false)}
              aria-label="Collapse"
              className="ml-auto text-muted hover:text-foreground"
            >
              <ChevronUp size={15} className="rotate-180" />
            </button>
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">{entry.project_name || "Shop"}</div>
          <div className="text-xs text-muted">{member?.name}</div>
          <div className="mt-2.5 flex items-center gap-3">
            <span className="font-mono text-2xl tabular-nums text-foreground">{time}</span>
            <button
              onClick={handleClockOut}
              disabled={busy}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              <LogOut size={13} />
              {busy ? "Clocking out…" : "Clock Out"}
            </button>
          </div>
          {err && <div className="mt-2 text-[11px] text-red-400">{err}</div>}
        </div>
      )}
    </div>
  );
}
