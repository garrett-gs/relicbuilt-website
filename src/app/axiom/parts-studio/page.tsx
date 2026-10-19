"use client";

import { useState, useEffect } from "react";
import PartBuilder, { type PartSaveToLibrary } from "@/components/axiom/PartBuilder";
import GeneratorPicker from "@/components/axiom/GeneratorPicker";
import { GENERATORS, byId, type PartSpec } from "@/lib/parts";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { useEntity } from "@/components/axiom/EntityProvider";
import { Ruler } from "lucide-react";

// Standalone Parts Studio. Cold open, tweak, download — no project attached.
// "Save to Library" stores the spec in the shared parts_library so it can be
// pulled into any project. Opening ?lib=<id> loads a saved part back to edit.
export default function PartsStudioPage() {
  const { userEmail } = useAuth();
  const { entity } = useEntity();
  const [generatorId, setGeneratorId] = useState<string>(GENERATORS[0].id);
  const [initialSpec, setInitialSpec] = useState<PartSpec | null>(null);
  const [builderKey, setBuilderKey] = useState(0);
  const generator = byId[generatorId] ?? GENERATORS[0];

  // Open a saved library part to edit, via ?lib=<id>. Read from window so we
  // don't need a Suspense boundary around useSearchParams.
  useEffect(() => {
    const libId = new URLSearchParams(window.location.search).get("lib");
    if (!libId) return;
    axiom.from("parts_library").select("*").eq("id", libId).single().then(({ data }) => {
      if (data && byId[data.generator_id]) {
        setGeneratorId(data.generator_id);
        setInitialSpec(data.spec as PartSpec);
        setBuilderKey((k) => k + 1);
      }
    });
  }, []);

  function pickGenerator(id: string) {
    setGeneratorId(id);
    setInitialSpec(null);
    setBuilderKey((k) => k + 1);
  }

  async function saveToLibrary(payload: PartSaveToLibrary) {
    const label = payload.result.filename || generator.label;
    const { data } = await axiom.from("parts_library").insert({
      entity,
      generator_id: payload.generatorId,
      generator_version: payload.generatorVersion,
      spec: payload.spec,
      label,
    }).select("id").single();
    if (data) {
      await logActivity({ action: "created", entity: "part", entity_id: data.id, label: `Saved part to library: ${label}`, user_name: userEmail });
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex items-center gap-2">
        <Ruler size={22} className="text-accent" />
        <h1 className="text-2xl font-heading font-bold">Parts Studio</h1>
      </div>
      <p className="mb-5 text-sm text-muted">
        Parametric 2D profiles. Set the dimensions, then <strong>Save to Library</strong> to reuse the
        part on any project, or download a cut file — DXF for Fusion and CAM, SVG for artwork.
      </p>

      <div className="mb-6">
        <GeneratorPicker
          label="Part type"
          value={generatorId}
          onChange={pickGenerator}
        />
      </div>

      <PartBuilder
        key={`${generatorId}-${builderKey}`}
        generator={generator}
        initial={initialSpec ?? undefined}
        context={{ bitDiameter: 0.25 }}
        onSaveToLibrary={saveToLibrary}
      />
    </div>
  );
}
