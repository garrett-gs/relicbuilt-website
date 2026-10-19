"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { useEntity } from "@/components/axiom/EntityProvider";
import { GENERATORS, byId, type PartSpec, type PartGenerator } from "@/lib/parts";
import { formatDate } from "@/lib/utils";
import { Library, Search, Trash2, Pencil, ExternalLink } from "lucide-react";

type PartsLibraryRow = {
  id: string;
  generator_id: string;
  generator_version: number;
  spec: Record<string, string | number>;
  label?: string;
  created_at: string;
};

export default function PartsLibraryPage() {
  const { userEmail } = useAuth();
  const { entity } = useEntity();
  const [parts, setParts] = useState<PartsLibraryRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await axiom.from("parts_library").select("*").eq("entity", entity).order("created_at", { ascending: false });
    setParts(data || []);
    setLoading(false);
  }, [entity]);
  useEffect(() => { load(); }, [load]);

  async function rename(id: string, label: string) {
    await axiom.from("parts_library").update({ label, updated_at: new Date().toISOString() }).eq("id", id);
    setParts((ps) => ps.map((p) => (p.id === id ? { ...p, label } : p)));
  }

  async function remove(id: string, label?: string) {
    if (!confirm(`Delete "${label || "this part"}" from the library? Projects already using it are unaffected.`)) return;
    await axiom.from("parts_library").delete().eq("id", id);
    setParts((ps) => ps.filter((p) => p.id !== id));
    await logActivity({ action: "deleted", entity: "part", entity_id: id, label: `Deleted library part: ${label || id}`, user_name: userEmail });
  }

  const q = search.trim().toLowerCase();
  const filtered = parts.filter((p) => !q || (p.label || "").toLowerCase().includes(q) || (byId[p.generator_id]?.label || p.generator_id).toLowerCase().includes(q));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Library size={22} className="text-accent" />
        <h1 className="text-2xl font-bold">Parts Library</h1>
      </div>
      <p className="text-sm text-muted mb-6">
        Reusable parametric parts. Save parts here from <Link href="/axiom/parts-studio" className="text-accent hover:underline">Parts Studio</Link> or any project, then pull them onto a project from its Parts section.
      </p>

      <div className="relative mb-5 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parts…"
          className="w-full bg-card border border-border pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="border border-border bg-card p-8 text-center">
          <Library size={28} className="text-muted mx-auto mb-3" />
          <p className="text-sm text-muted">
            No saved parts yet. Build one in <Link href="/axiom/parts-studio" className="text-accent hover:underline">Parts Studio</Link> and hit <span className="text-foreground font-medium">Save to Library</span>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <PartCard key={p.id} part={p} onRename={rename} onDelete={remove} />
          ))}
        </div>
      )}
    </div>
  );
}

function PartCard({ part, onRename, onDelete }: {
  part: PartsLibraryRow;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string, label?: string) => void;
}) {
  const gen = byId[part.generator_id] as PartGenerator | undefined;
  const stale = gen && gen.version !== part.generator_version;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(part.label || "");

  return (
    <div className="bg-card border border-border flex flex-col">
      <div className="aspect-[4/3] bg-background/40 border-b border-border flex items-center justify-center p-3">
        {gen ? <PartPreview generator={gen} spec={part.spec as PartSpec} /> : <span className="text-xs text-muted">Unknown part type</span>}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1">
        {editing ? (
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => { setEditing(false); if (name.trim() && name !== part.label) onRename(part.id, name.trim()); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setName(part.label || ""); setEditing(false); } }}
            className="bg-background border border-border px-2 py-1 text-sm text-foreground focus:outline-none focus:border-accent"
          />
        ) : (
          <div className="flex items-center gap-1.5 group">
            <p className="text-sm font-medium truncate flex-1">{part.label || part.generator_id}</p>
            <button onClick={() => { setName(part.label || ""); setEditing(true); }} className="text-muted hover:text-accent opacity-0 group-hover:opacity-100" title="Rename"><Pencil size={12} /></button>
          </div>
        )}
        <p className="text-[11px] text-muted truncate">
          {gen?.label ?? part.generator_id} · v{part.generator_version}
          {stale && <span className="ml-1 text-amber-400">(current v{gen?.version})</span>}
        </p>
        <p className="text-[11px] text-muted">{formatDate(part.created_at)}</p>
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/60">
          <Link href={`/axiom/parts-studio?lib=${part.id}`} className="text-xs text-accent hover:underline flex items-center gap-1">
            <ExternalLink size={12} /> Open in Studio
          </Link>
          <button onClick={() => onDelete(part.id, part.label)} className="text-muted hover:text-red-500 ml-auto" title="Delete"><Trash2 size={13} /></button>
        </div>
      </div>
    </div>
  );
}

function PartPreview({ generator, spec }: { generator: PartGenerator; spec: PartSpec }) {
  const result = generator.solve({ ...generator.defaults, ...spec }, { bitDiameter: 0.25 });
  if ("error" in result) return <span className="text-xs text-amber-400">preview unavailable</span>;
  const pad = 0.5;
  const entries = result.paths ?? (result.path ? [{ d: result.path, role: "cut" }] : []);
  const vbW = result.width + pad * 2;
  const vbH = result.height + pad * 2;
  return (
    <svg viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full" role="img" aria-label={`${generator.label} preview`}>
      {entries.map((p, i) => (
        <path key={i} d={p.d} fill="currentColor" className="text-muted/20" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {entries.map((p, i) => (
        <path key={`s-${i}`} d={p.d} fill="none" stroke="currentColor" className="text-accent" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
