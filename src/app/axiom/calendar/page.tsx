"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { CustomWork } from "@/types/axiom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  new: "#4d9fff", in_review: "#f59e0b", quoted: "#a78bfa", in_progress: "#3b82f6", complete: "#22c55e",
};

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function BuildCalendarPage() {
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const load = useCallback(async () => {
    const { data } = await axiom.from("custom_work").select("*").order("start_date");
    if (data) setProjects(data.filter((p: CustomWork) => p.start_date || p.due_date));
  }, []);

  useEffect(() => { load(); }, [load]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  function prev() { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }
  function next() { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }

  function getProjectsForDay(day: number) {
    const d = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return projects.filter((p) => {
      const start = p.start_date || "";
      const end = p.due_date || "";
      if (start && end) return d >= start && d <= end;
      if (start) return d === start;
      if (end) return d === end;
      return false;
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold">Build Calendar</h1>
        <div className="flex items-center gap-4">
          <button onClick={prev} className="text-muted hover:text-foreground"><ChevronLeft size={20} /></button>
          <span className="text-lg font-heading font-bold">{monthNames[month]} {year}</span>
          <button onClick={next} className="text-muted hover:text-foreground"><ChevronRight size={20} /></button>
        </div>
      </div>

      {/* Calendar grid */}
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
            const dayProjects = getProjectsForDay(day);
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            return (
              <div key={day} className="min-h-[100px] border-b border-r border-border/50 p-1">
                <span className={cn("text-xs inline-block w-6 h-6 text-center leading-6 rounded-full mb-1", isToday && "bg-accent text-background font-bold")}>{day}</span>
                <div className="space-y-0.5">
                  {dayProjects.map((p) => (
                    <div
                      key={p.id}
                      className="text-[10px] px-1 py-0.5 rounded truncate"
                      style={{ background: statusColors[p.status] + "20", color: statusColors[p.status] }}
                    >
                      {p.project_name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4">
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-xs text-muted capitalize">{status.replace("_", " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
