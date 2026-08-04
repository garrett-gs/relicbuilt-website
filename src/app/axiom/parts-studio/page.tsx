"use client";

import { useState } from "react";
import PartBuilder from "@/components/axiom/PartBuilder";
import GeneratorPicker from "@/components/axiom/GeneratorPicker";
import { GENERATORS, byId } from "@/lib/parts";
import { Ruler } from "lucide-react";

// Standalone Parts Studio. Cold open, tweak, download — no project
// attached. The project tab (project detail panel) renders the same
// PartBuilder but wires initial + onExport into custom_work_parts.
export default function PartsStudioPage() {
  const [generatorId, setGeneratorId] = useState<string>(GENERATORS[0].id);
  const generator = byId[generatorId] ?? GENERATORS[0];

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex items-center gap-2">
        <Ruler size={22} className="text-accent" />
        <h1 className="text-2xl font-heading font-bold">Parts Studio</h1>
      </div>
      <p className="mb-5 text-sm text-muted">
        Parametric 2D profiles. Set the dimensions, download a cut file — DXF
        for Fusion and CAM, SVG for artwork. To save the spec against a
        project, open the project and use its Parts section.
      </p>

      <div className="mb-6">
        <GeneratorPicker
          label="Part type"
          value={generatorId}
          onChange={setGeneratorId}
        />
      </div>

      <PartBuilder
        key={generatorId}
        generator={generator}
        context={{ bitDiameter: 0.25 }}
      />
    </div>
  );
}
