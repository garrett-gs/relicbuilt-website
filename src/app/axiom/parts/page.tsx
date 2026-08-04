"use client";

import { useState, useEffect, useCallback } from "react";
import PartStudio, { type PartStudioExport } from "@/components/axiom/PartStudio";
import { GENERATORS, byId, type PartSpec } from "@/lib/parts";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import type { CustomWork, CustomWorkPart } from "@/types/axiom";
import { Ruler, Trash2, RotateCcw } from "lucide-react";

const inp =
  "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";

type ProjectRow = Pick<CustomWork, "id" | "project_name" | "client_name" | "status">;

export default function PartsToolPage() {
  const { userEmail } = useAuth();
  const [generatorId, setGeneratorId] = useState<string>(GENERATORS[0].id);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [savedParts, setSavedParts] = useState<CustomWorkPart[]>([]);
  const [initialSpec, setInitialSpec] = useState<PartSpec | null>(null);
  // Bumps whenever we swap generators or reopen a saved part, so
  // PartStudio re-mounts with fresh initial state.
  const [studioKey, setStudioKey] = useState(0);

  const generator = byId[generatorId] ?? GENERATORS[0];

  useEffect(() => {
    axiom
      .from("custom_work")
      .select("id, project_name, client_name, status")
      .not("status", "in", "(complete)")
      .order("project_name")
      .then(({ data }) => {
        if (data) setProjects(data as ProjectRow[]);
      });
  }, []);

  const loadParts = useCallback(async (pid: string) => {
    if (!pid) {
      setSavedParts([]);
      return;
    }
    const { data } = await axiom
      .from("custom_work_parts")
      .select("*")
      .eq("custom_work_id", pid)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setSavedParts(data as CustomWorkPart[]);
  }, []);

  useEffect(() => {
    loadParts(projectId);
  }, [projectId, loadParts]);

  async function handleExport(payload: PartStudioExport) {
    if (!projectId) return; // no project selected — download-only
    const position = savedParts.length;
    const label =
      typeof payload.spec.width === "number" && typeof payload.spec.height === "number"
        ? `${payload.result.filename}`
        : payload.result.filename;
    await axiom.from("custom_work_parts").insert({
      custom_work_id: projectId,
      generator_id: payload.generatorId,
      generator_version: payload.generatorVersion,
      spec: payload.spec,
      label,
      position,
    });
    await logActivity({
      action: "created",
      entity: "project",
      entity_id: projectId,
      label: `Exported part: ${label} (${payload.format.toUpperCase()})`,
      user_name: userEmail,
    });
    loadParts(projectId);
  }

  function reopen(part: CustomWorkPart) {
    if (!byId[part.generator_id]) return;
    setGeneratorId(part.generator_id);
    setInitialSpec(part.spec as PartSpec);
    setStudioKey((k) => k + 1);
  }

  async function deletePart(id: string) {
    await axiom.from("custom_work_parts").delete().eq("id", id);
    loadParts(projectId);
  }

  function pickGenerator(id: string) {
    setGeneratorId(id);
    setInitialSpec(null);
    setStudioKey((k) => k + 1);
  }

  const selectedProject = projects.find((p) => p.id === projectId);

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex items-center gap-2">
        <Ruler size={22} className="text-accent" />
        <h1 className="text-2xl font-heading font-bold">Part Generator</h1>
      </div>
      <p className="mb-5 text-sm text-muted">
        Set the dimensions, export a cut file. DXF for Fusion and CAM, SVG for
        artwork. Attach a project to save the spec — a later change order becomes
        editing a value, not redrawing.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 mb-5">
        <div>
          <label className={lbl}>Part type</label>
          <select
            value={generatorId}
            onChange={(e) => pickGenerator(e.target.value)}
            className={inp}
          >
            {GENERATORS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl}>Attach to project (optional)</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inp}
          >
            <option value="">— None — download only —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_name}
                {p.client_name ? ` · ${p.client_name}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedProject && savedParts.length > 0 && (
        <div className="mb-6 bg-card border border-border p-4">
          <p className={lbl}>
            Saved parts on {selectedProject.project_name} ({savedParts.length})
          </p>
          <div className="space-y-1.5">
            {savedParts.map((p) => {
              const gen = byId[p.generator_id];
              const stale = gen && gen.version !== p.generator_version;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 bg-background border border-border/60 px-3 py-2"
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
        </div>
      )}

      <PartStudio
        key={studioKey}
        generator={generator}
        initial={initialSpec ?? undefined}
        context={{ bitDiameter: 0.25 }}
        onExport={handleExport}
      />

      {!projectId && (
        <p className="mt-3 text-xs text-muted italic">
          Attach a project above to save this spec alongside the download.
        </p>
      )}
    </div>
  );
}
