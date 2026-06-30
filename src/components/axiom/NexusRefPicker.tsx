"use client";

import { useState } from "react";
import { Search, X, Paperclip } from "lucide-react";
import { axiom } from "@/lib/axiom-supabase";
import { NexusRef } from "@/types/axiom";
import { cn, formatDueDate } from "@/lib/utils";

type NexusSearchResult = {
  id: string;
  number: string;
  client_name: string;
  event_type: string;
  event_date: string;
  total: number;
};

/**
 * Picker that links a Wallflower RELIC Nexus order/quote to whatever's editing
 * it. Searches Nexus live (server-side, auth-gated) and reports the choice via
 * onChange. Used both when creating a work order and in its detail panel.
 */
export default function NexusRefPicker({
  value,
  onChange,
}: {
  value: NexusRef | null;
  onChange: (ref: NexusRef | null) => void;
}) {
  const [type, setType] = useState<"order" | "quote">("order");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NexusSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  async function search(t: "order" | "quote", q: string) {
    setSearching(true);
    setOpen(true);
    try {
      const { data: { session } } = await axiom.auth.getSession();
      const res = await fetch(`/api/axiom/nexus-search?type=${t}&q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json();
      setResults(res.ok ? (json.results || []) : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function pick(r: NexusSearchResult) {
    onChange({ type, id: r.id, number: r.number, client_name: r.client_name, event_date: r.event_date });
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="bg-card border border-border p-4">
      <p className="text-xs uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
        <Paperclip size={11} /> Nexus Reference
      </p>
      {value ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-accent font-mono">
              {value.type === "order" ? "Order" : "Quote"} {value.number}
            </p>
            <p className="text-xs text-muted truncate">
              {value.client_name || ""}{value.event_date ? ` · ${formatDueDate(value.event_date).text}` : ""}
            </p>
          </div>
          <button onClick={() => onChange(null)} className="text-xs text-muted hover:text-red-400 flex items-center gap-1 shrink-0">
            <X size={12} /> Remove
          </button>
        </div>
      ) : (
        <div>
          <div className="flex gap-2 mb-2">
            {(["order", "quote"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); search(t, query); }}
                className={cn("text-xs px-3 py-1 border transition-colors", type === t ? "border-accent text-accent" : "border-border text-muted hover:text-foreground")}
              >
                {t === "order" ? "Order" : "Quote"}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); search(type, e.target.value); }}
              onFocus={() => { if (!results.length) search(type, query); }}
              placeholder={`Search Nexus ${type}s by number or client…`}
              className="w-full bg-background border border-border pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
            />
          </div>
          {open && (
            <div className="mt-1 border border-border bg-background max-h-60 overflow-y-auto">
              {searching ? (
                <p className="px-3 py-2 text-xs text-muted">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted">No matching {type}s.</p>
              ) : results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pick(r)}
                  className="w-full text-left px-3 py-2 hover:bg-card border-b border-border/50 last:border-0"
                >
                  <p className="text-sm text-foreground font-mono">{r.number}</p>
                  <p className="text-xs text-muted truncate">
                    {r.client_name}{r.event_date ? ` · ${formatDueDate(r.event_date).text}` : ""}{r.event_type ? ` · ${r.event_type}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
