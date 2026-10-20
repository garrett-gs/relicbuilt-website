"use client";

import { useState, useEffect, useCallback } from "react";
import { byId } from "@/lib/parts";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useEntity } from "@/components/axiom/EntityProvider";
import type { CustomWorkPart } from "@/types/axiom";
import { Ruler, Trash2, Library } from "lucide-react";

type PartsLibraryRow = {
  id: string;
  generator_id: string;
  generator_version: number;
  spec: Record<string, string | number>;
  label?: string;
};

interface ProjectPartsSectionProps {
  customWorkId: string;
  userEmail: string;
}

// Parts on a project. Parts are drawn in the Parts Studio and saved to the
// shared Parts Library; here you pull those saved parts onto the project. No
// in-project builder — build in Parts Studio, then add from the library.
export default function ProjectPartsSection({
  customWorkId,
  userEmail,
}: ProjectPartsSectionProps) {
  const [savedParts, setSavedParts] = useState<CustomWorkPart[]>([]);
  const { entity } = useEntity();
  const [library, setLibrary] = useState<PartsLibraryRow[]>([]);

  const loadLibrary = useCallback(async () => {
    const { data } = await axiom
      .from("parts_library")
      .select("id, generator_id, generator_version, spec, label")
      .eq("entity", entity)
      .order("label");
    if (data) setLibrary(data as PartsLibraryRow[]);
  }, [entity]);
  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  const loadParts = useCallback(async () => {
    const { data } = await axiom
      .from("custom_work_parts")
      .select("*")
      .eq("custom_work_id", customWorkId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setSavedParts(data as CustomWorkPart[]);
  }, [customWorkId]);

  useEffect(() => {
    loadParts();
  }, [loadParts]);

  async function deletePart(id: string) {
    await axiom.from("custom_work_parts").delete().eq("id", id);
    loadParts();
  }

  // Pull a saved library part onto this project (copies the spec — editing it
  // in Parts Studio later won't touch what's on this project).
  async function addFromLibrary(lib: PartsLibraryRow) {
    await axiom.from("custom_work_parts").insert({
      custom_work_id: customWorkId,
      generator_id: lib.generator_id,
      generator_version: lib.generator_version,
      spec: lib.spec,
      label: lib.label ?? lib.generator_id,
      position: savedParts.length,
    });
    await logActivity({ action: "created", entity: "project", entity_id: customWorkId, label: `Added part from library: ${lib.label ?? lib.generator_id}`, user_name: userEmail });
    loadParts();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Ruler size={16} className="text-accent" />
        <h3 className="text-sm uppercase tracking-wider text-muted">
          Parts ({savedParts.length})
        </h3>
      </div>

      {savedParts.length > 0 && (
        <div className="space-y-1.5">
          {savedParts.map((p) => {
            const gen = byId[p.generator_id];
            const stale = gen && gen.version !== p.generator_version;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 bg-card border border-border/60 px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {p.label ?? p.generator_id}
                  </p>
                  <p className="text-[11px] text-muted truncate">
                    {gen?.label ?? p.generator_id} · v{p.generator_version}
                    {stale && (
                      <span className="ml-1 text-amber-400">
                        (current v{gen?.version} — geometry may have changed)
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => deletePart(p.id)}
                  className="text-muted hover:text-red-500 p-1"
                  title="Remove from project"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add a saved part from the shared library onto this project */}
      {library.length > 0 ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted flex items-center gap-1"><Library size={13} /> Add from Library:</span>
          <select
            value=""
            onChange={(e) => { const lib = library.find((l) => l.id === e.target.value); if (lib) addFromLibrary(lib); }}
            className="bg-card border border-border px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
          >
            <option value="">Pick a saved part…</option>
            {library.map((l) => (
              <option key={l.id} value={l.id}>{l.label ?? l.generator_id}{byId[l.generator_id] ? ` · ${byId[l.generator_id].label}` : ""}</option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-muted italic flex items-center gap-1">
          <Library size={13} /> No saved parts yet. Build parts in Parts Studio and save them to the library, then add them here.
        </p>
      )}
    </div>
  );
}
