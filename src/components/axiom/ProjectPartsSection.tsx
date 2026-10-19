"use client";

import { useState, useEffect, useCallback } from "react";
import PartBuilder, { type PartBuilderExport, type PartSaveToLibrary } from "./PartBuilder";
import GeneratorPicker from "./GeneratorPicker";
import { GENERATORS, byId, type PartSpec } from "@/lib/parts";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useEntity } from "@/components/axiom/EntityProvider";
import type { CustomWorkPart } from "@/types/axiom";
import { Ruler, RotateCcw, Trash2, Library } from "lucide-react";

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

// Project tab equivalent of Parts Studio. Renders the same PartBuilder;
// the only difference is that this side wires `initial` + `onExport` so
// specs are stored on custom_work_parts and can be reopened for a change
// order without redrawing.
export default function ProjectPartsSection({
  customWorkId,
  userEmail,
}: ProjectPartsSectionProps) {
  const [generatorId, setGeneratorId] = useState<string>(GENERATORS[0].id);
  const [savedParts, setSavedParts] = useState<CustomWorkPart[]>([]);
  const [initialSpec, setInitialSpec] = useState<PartSpec | null>(null);
  const [builderKey, setBuilderKey] = useState(0);

  const generator = byId[generatorId] ?? GENERATORS[0];
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

  async function handleExport(payload: PartBuilderExport) {
    const position = savedParts.length;
    const label = payload.result.filename;
    await axiom.from("custom_work_parts").insert({
      custom_work_id: customWorkId,
      generator_id: payload.generatorId,
      generator_version: payload.generatorVersion,
      spec: payload.spec,
      label,
      position,
    });
    await logActivity({
      action: "created",
      entity: "project",
      entity_id: customWorkId,
      label: `Exported part: ${label} (${payload.format.toUpperCase()})`,
      user_name: userEmail,
    });
    loadParts();
  }

  function reopen(part: CustomWorkPart) {
    if (!byId[part.generator_id]) return;
    setGeneratorId(part.generator_id);
    setInitialSpec(part.spec as PartSpec);
    setBuilderKey((k) => k + 1);
  }

  async function deletePart(id: string) {
    await axiom.from("custom_work_parts").delete().eq("id", id);
    loadParts();
  }

  // Pull a saved library part onto this project (copies the spec — editing it
  // here won't touch the library original).
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

  // Save the part currently in the builder to the shared library for reuse.
  async function saveToLibrary(payload: PartSaveToLibrary) {
    const label = payload.result.filename || generator.label;
    const { data } = await axiom.from("parts_library").insert({
      entity,
      generator_id: payload.generatorId,
      generator_version: payload.generatorVersion,
      spec: payload.spec,
      label,
    }).select("id").single();
    if (data) await logActivity({ action: "created", entity: "part", entity_id: data.id, label: `Saved part to library: ${label}`, user_name: userEmail });
    loadLibrary();
  }

  function pickGenerator(id: string) {
    setGeneratorId(id);
    setInitialSpec(null);
    setBuilderKey((k) => k + 1);
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
                  onClick={() => reopen(p)}
                  className="text-xs text-muted hover:text-accent flex items-center gap-1 px-2 py-1"
                  title="Reopen this part"
                >
                  <RotateCcw size={12} /> Reopen
                </button>
                <button
                  onClick={() => deletePart(p.id)}
                  className="text-muted hover:text-red-500 p-1"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pull a saved part from the shared library onto this project */}
      {library.length > 0 && (
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
      )}

      <div className="bg-card border border-border p-4 space-y-4">
        <GeneratorPicker
          label="Part type"
          value={generatorId}
          onChange={pickGenerator}
        />
        <PartBuilder
          key={builderKey}
          generator={generator}
          initial={initialSpec ?? undefined}
          context={{ bitDiameter: 0.25 }}
          onExport={handleExport}
          onSaveToLibrary={saveToLibrary}
        />
      </div>
    </div>
  );
}
