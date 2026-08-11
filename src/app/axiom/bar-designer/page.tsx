"use client";

import BarDesigner from "@/components/axiom/BarDesigner";
import { Martini } from "lucide-react";

// Standalone Bar Designer. Pick a shape and size, the tool applies the
// standard construction, breaks the perimeter into panels, and prices it.
export default function BarDesignerPage() {
  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-center gap-2">
        <Martini size={22} className="text-accent" />
        <h1 className="text-2xl font-heading font-bold">Bar Designer</h1>
      </div>
      <p className="mb-5 text-sm text-muted">
        Design, detail, and price a bar. Pick a shape and overall size — the
        tool applies the standard construction, breaks the front into panels,
        lists the counter blanks, and produces an itemized materials + labor
        estimate. Faceted is the default; round, oval, and curved-corner bars
        can be upgraded to true curved fronts per bar.
      </p>

      <BarDesigner />
    </div>
  );
}
