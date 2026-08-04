"use client";

import { useState } from "react";
import PartStudio from "@/components/axiom/PartStudio";
import { GENERATORS } from "@/lib/parts";
import { Ruler } from "lucide-react";

const inp =
  "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";

export default function PartsToolPage() {
  const [id, setId] = useState<string>(GENERATORS[0].id);
  const generator = GENERATORS.find((g) => g.id === id) ?? GENERATORS[0];

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex items-center gap-2">
        <Ruler size={22} className="text-accent" />
        <h1 className="text-2xl font-heading font-bold">Part Generator</h1>
      </div>
      <p className="mb-5 text-sm text-muted">
        Set the dimensions, export a cut file. DXF for Fusion and CAM,
        SVG for artwork.
      </p>

      <div className="mb-6">
        <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">
          Part type
        </label>
        <select
          value={id}
          onChange={(e) => setId(e.target.value)}
          className={inp}
        >
          {GENERATORS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <PartStudio
        key={id}
        generator={generator}
        context={{ bitDiameter: 0.25 }}
      />
    </div>
  );
}
