import type { PartGeometry, PathEntry } from "../partSvg";
import { singleLineText, type SingleLineOptions, type SingleLineResult } from "./singleLineText";

// Bridge from Relic Blueprint single-line text to the part geometry exporters.
// An engraved label is emitted on its own role, "ENGRAVE", so buildSvg groups
// it as a fill:none path and buildDxf drops it on an ENGRAVE layer — the CAM
// software can then assign a V-bit / engrave toolpath to that layer only.

export const ENGRAVE_ROLE = "ENGRAVE";

// Path data in the repo's exporter dialect: whitespace-separated tokens so
// buildDxf's parsePath reads it ("M 0 0 L 3 6"), which also renders in SVG.
// (The library's toSvgPath glues "M" to the first number, which browsers
// accept but parsePath does not.)
function toGeometryPath(polylines: SingleLineResult["polylines"]): string {
  return polylines
    .map((pl) => "M " + pl.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(" L "))
    .join(" ");
}

/**
 * A single-line label as a geometry path entry on the ENGRAVE layer. Part
 * geometry is Y-down (SVG) and the DXF writer flips it, so yDown defaults true.
 */
export function engraveLabelEntry(label: string, o: SingleLineOptions): PathEntry {
  const { polylines } = singleLineText(label, { yDown: true, ...o });
  return { role: ENGRAVE_ROLE, d: toGeometryPath(polylines) };
}

export interface EngraveLabelOptions {
  labelHeight?: number;                        // cap height, output units (default 0.5")
  x?: number;                                  // baseline anchor; defaults to centered
  y?: number;                                  // baseline; defaults near the bottom edge
  align?: "left" | "center" | "right";         // default "center"
}

/**
 * Append an engraved label to a part's geometry. Returns new geometry with the
 * label added as an ENGRAVE-role path, ready for the SVG/DXF exporters. No-op
 * for an empty label.
 */
export function appendEngravedLabel(
  geometry: PartGeometry,
  label: string,
  opts: EngraveLabelOptions = {},
): PartGeometry {
  if (!label.trim()) return geometry;
  const capHeight = opts.labelHeight ?? 0.5;
  const align = opts.align ?? "center";
  const x = opts.x ?? geometry.width / 2;
  const y = opts.y ?? Math.max(geometry.height - 0.1, capHeight); // just inside the bottom edge
  const entry = engraveLabelEntry(label, { capHeight, x, y, align, yDown: true });
  const base: PathEntry[] = geometry.paths?.length
    ? [...geometry.paths]
    : geometry.path
      ? [{ d: geometry.path, role: "cut" }]
      : [];
  return { ...geometry, paths: [...base, entry] };
}
