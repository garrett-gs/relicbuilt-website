"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { ActivityEntry } from "@/types/axiom";
import { cn } from "@/lib/utils";

const actionIcons: Record<string, { icon: string; color: string }> = {
  created: { icon: "+", color: "#22c55e" },
  updated: { icon: "~", color: "#4d9fff" },
  deleted: { icon: "x", color: "#ef4444" },
  sent: { icon: "->", color: "#a78bfa" },
  approved: { icon: "ok", color: "#22c55e" },
  rejected: { icon: "no", color: "#ef4444" },
  completed: { icon: "v", color: "#22c55e" },
  signed: { icon: "s", color: "#22c55e" },
  converted: { icon: ">", color: "#f59e0b" },
};

const ENTITIES = ["all", "project", "task", "invoice", "purchase_order", "expense", "customer", "company", "settings"];

export default function ActivityLogPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [entityFilter, setEntityFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    let query = axiom.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200);
    if (entityFilter !== "all") query = query.eq("entity", entityFilter);
    const { data } = await query;
    if (data) setEntries(data);
  }, [entityFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter((e) =>
    !search || e.label?.toLowerCase().includes(search.toLowerCase()) || e.user_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold">Activity Log</h1>
        <p className="text-muted text-sm mt-1">{entries.length} entries</p>
      </div>

      <div className="flex gap-3 mb-6">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activity..." className="flex-1 max-w-sm bg-card border border-border px-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent">
          {ENTITIES.map((e) => <option key={e} value={e}>{e === "all" ? "All Entities" : e.replace("_", " ")}</option>)}
        </select>
      </div>

      <div className="space-y-1">
        {filtered.map((entry) => {
          const ai = actionIcons[entry.action] || { icon: "?", color: "#6b7280" };
          return (
            <div key={entry.id} className="flex items-start gap-3 bg-card border border-border px-4 py-3">
              <span
                className="text-[10px] font-mono w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: ai.color + "20", color: ai.color }}
              >
                {ai.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{entry.label}</p>
                <div className="flex gap-3 mt-0.5">
                  <span className="text-xs text-muted">{entry.entity}</span>
                  {entry.user_name && <span className="text-xs text-muted">{entry.user_name}</span>}
                </div>
              </div>
              <span className="text-xs text-muted whitespace-nowrap flex-shrink-0">
                {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" "}
                {new Date(entry.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center py-8 text-muted text-sm">No activity found</p>}
      </div>
    </div>
  );
}
