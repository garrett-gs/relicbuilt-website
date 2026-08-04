"use client";

import { useState, useEffect, useCallback } from "react";
import PartBuilder, { type PartBuilderExport } from "./PartBuilder";
import GeneratorPicker from "./GeneratorPicker";
import { GENERATORS, byId, type PartSpec } from "@/lib/parts";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import type { CustomWorkPart } from "@/types/axiom";
import { Ruler, RotateCcw, Trash2 } from "lucide-react";

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
        />
      </div>
    </div>
  );
}
