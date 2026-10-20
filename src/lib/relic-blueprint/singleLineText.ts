import data from "./relic-blueprint-strokes.json";

// Single-line (centerline) engraving text in the Relic Blueprint lettering.
// Turns a string into open polylines on the 6-unit drafting grid so DXF/SVG
// cut files can carry engraved labels, part numbers and dims as one-pass
// V-bit / engrave paths. Uppercase only — lowercase is uppercased, unknown
// characters render as a space. See RELIC-BLUEPRINT-AXIOM-HANDOFF.md.

type Pt = [number, number];
type Glyph = { w: number; s: Pt[][] };
const GLYPHS = data.glyphs as unknown as Record<string, Glyph>;
const SPACE_W = GLYPHS[" "]?.w ?? 2.6;

export interface SingleLineOptions {
  capHeight: number;               // cap height in output units (inches or mm)
  x?: number;                      // baseline start, output units
  y?: number;
  align?: "left" | "center" | "right";
  yDown?: boolean;                 // true for SVG coordinates (y grows downward)
}

export interface SingleLineResult {
  polylines: Pt[][];               // each = one engrave pass, open polyline
  width: number;                   // overall width, output units
}

/** Turn text into single-line centerline paths in Relic Blueprint lettering. */
export function singleLineText(text: string, o: SingleLineOptions): SingleLineResult {
  const k = o.capHeight / data.capHeight;
  const gap = data.sideGap;
  const chars = [...text.toUpperCase()];
  let total = 0;
  for (const ch of chars) total += (GLYPHS[ch]?.w ?? SPACE_W) + 2 * gap;
  const width = total * k;
  const x0 = (o.x ?? 0) - (o.align === "center" ? width / 2 : o.align === "right" ? width : 0);
  const y0 = o.y ?? 0;
  const sy = o.yDown ? -1 : 1;

  const polylines: Pt[][] = [];
  let cursor = 0;
  for (const ch of chars) {
    const g = GLYPHS[ch];
    const w = g?.w ?? SPACE_W;
    if (g) {
      for (const stroke of g.s) {
        polylines.push(stroke.map(([px, py]) => [x0 + (cursor + gap + px) * k, y0 + sy * py * k] as Pt));
      }
    }
    cursor += w + 2 * gap;
  }
  return { polylines, width };
}

/** SVG path data (no fill, stroke only). */
export const toSvgPath = (polylines: Pt[][]) =>
  polylines.map((pl) => "M" + pl.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(" L")).join(" ");
