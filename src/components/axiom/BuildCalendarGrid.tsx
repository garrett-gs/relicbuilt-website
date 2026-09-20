"use client";

import { useMemo, useState } from "react";
import { CustomWork } from "@/types/axiom";
import { TentativeItem } from "@/lib/calendar-data";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, isWeekday, suggestStartDate } from "@/lib/utils";

export const statusColors: Record<string, string> = {
  new: "#4d9fff", in_review: "#f59e0b", quoted: "#a78bfa", in_progress: "#3b82f6", complete: "#22c55e",
};

// Tentative (unapproved) work shown on the calendar in a neutral, dashed style.
export const TENTATIVE_COLOR = "#94a3b8"; // slate — clearly "not confirmed yet"

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Prefers a saved start_date; else falls back to the same suggestion the
// project panel uses (spanning back from the due date by the labor estimate).
function buildRange(
  p: { id: string; start_date?: string; due_date?: string },
  hoursById: Record<string, number>
): { start: string; end: string } | null {
  if (p.start_date && p.due_date) return { start: p.start_date, end: p.due_date };
  if (p.due_date) {
    const hours = hoursById[p.id] || 0;
    const suggested = suggestStartDate(p.due_date, hours);
    if (suggested) return { start: suggested, end: p.due_date };
    return { start: p.due_date, end: p.due_date };
  }
  if (p.start_date) return { start: p.start_date, end: p.start_date };
  return null;
}

/** The month grid + legend. Data-only; both the internal (entity-scoped) and
 *  the public shared-link views feed it the same shape. */
export default function BuildCalendarGrid({
  projects,
  estimateHoursById,
  tentatives,
  tentativeHours,
}: {
  projects: CustomWork[];
  estimateHoursById: Record<string, number>;
  tentatives: TentativeItem[];
  tentativeHours: Record<string, number>;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const ranges = useMemo(() => {
    const m = new Map<string, { start: string; end: string }>();
    for (const p of projects) { const r = buildRange(p, estimateHoursById); if (r) m.set(p.id, r); }
    return m;
  }, [projects, estimateHoursById]);

  const tentativeRanges = useMemo(() => {
    const m = new Map<string, { start: string; end: string }>();
    for (const t of tentatives) { const r = buildRange(t, tentativeHours); if (r) m.set(t.id, r); }
    return m;
  }, [tentatives, tentativeHours]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  function prev() { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }
  function next() { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }

  function dayKey(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function getProjectsForDay(day: number) {
    const d = dayKey(day);
    if (!isWeekday(parseDate(d))) return [];
    return projects.filter((p) => { const r = ranges.get(p.id); return r && d >= r.start && d <= r.end; });
  }
  function getTentativesForDay(day: number) {
    const d = dayKey(day);
    if (!isWeekday(parseDate(d))) return [];
    return tentatives.filter((t) => { const r = tentativeRanges.get(t.id); return r && d >= r.start && d <= r.end; });
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-4 mb-4">
        <button onClick={prev} className="text-muted hover:text-foreground"><ChevronLeft size={20} /></button>
        <span className="text-lg font-heading font-bold">{monthNames[month]} {year}</span>
        <button onClick={next} className="text-muted hover:text-foreground"><ChevronRight size={20} /></button>
      </div>

      <div className="bg-card border border-border">
        <div className="grid grid-cols-7 border-b border-border">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-2 text-xs uppercase tracking-wider text-muted text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border/50" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            return (
              <div key={day} className="min-h-[100px] border-b border-r border-border/50 p-1">
                <span className={cn("text-xs inline-block w-6 h-6 text-center leading-6 rounded-full mb-1", isToday && "bg-accent text-background font-bold")}>{day}</span>
                <div className="space-y-0.5">
                  {getProjectsForDay(day).map((p) => (
                    <div key={p.id} className="text-[10px] px-1 py-0.5 rounded truncate"
                      style={{ background: statusColors[p.status] + "20", color: statusColors[p.status] }}>
                      {p.project_name}
                    </div>
                  ))}
                  {getTentativesForDay(day).map((t) => (
                    <div key={t.id} className="text-[10px] px-1 py-0.5 rounded truncate border border-dashed italic"
                      style={{ background: TENTATIVE_COLOR + "12", color: TENTATIVE_COLOR, borderColor: TENTATIVE_COLOR + "80" }}
                      title="Tentative — not yet approved">
                      {t.project_name || t.client_name || "Untitled"}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mt-4">
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-xs text-muted capitalize">{status.replace("_", " ")}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm border border-dashed" style={{ borderColor: TENTATIVE_COLOR, background: TENTATIVE_COLOR + "12" }} />
          <span className="text-xs text-muted">Tentative (unapproved)</span>
        </div>
      </div>
    </div>
  );
}
