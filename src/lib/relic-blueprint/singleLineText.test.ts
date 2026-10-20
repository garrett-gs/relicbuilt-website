// Relic Blueprint single-line engraving text — the handoff's five cases,
// plus confirmation the label wires through the DXF exporter on an ENGRAVE
// layer. Run with `npm test`.

import { test, expect } from "vitest";
import { singleLineText } from "./singleLineText";
import { engraveLabelEntry, appendEngravedLabel, ENGRAVE_ROLE } from "./engrave";
import { buildDxf, type PartGeometry } from "../partSvg";

// 1) "A" → 2 polylines; first = [[0.65,0],[3.65,6],[6.65,0]]
test("single glyph A: two strokes, exact first polyline", () => {
  const { polylines } = singleLineText("A", { capHeight: 6 });
  expect(polylines).toHaveLength(2);
  const first = polylines[0];
  const expected = [[0.65, 0], [3.65, 6], [6.65, 0]];
  expect(first).toHaveLength(3);
  first.forEach((p, i) => {
    expect(p[0]).toBeCloseTo(expected[i][0], 6);
    expect(p[1]).toBeCloseTo(expected[i][1], 6);
  });
});

// 2) width of "AB" at capHeight 6 = (6 + 1.3) + (5 + 1.3) = 13.6
test("AB width is the sum of advance widths with side gaps", () => {
  const { width } = singleLineText("AB", { capHeight: 6 });
  expect(width).toBeCloseTo(13.6, 6);
});

// 3) lowercase input matches uppercase output
test("lowercase is uppercased", () => {
  expect(singleLineText("ab", { capHeight: 6 })).toEqual(singleLineText("AB", { capHeight: 6 }));
});

// 4) align center puts the midpoint of the width at x
test("center alignment centers ink on x", () => {
  const { polylines } = singleLineText("A", { capHeight: 6, x: 0, align: "center" });
  const xs = polylines.flat().map((p) => p[0]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  expect(mid).toBeCloseTo(0, 6);
});

// 5) yDown flips y: cap tops at y - capHeight (apex of A at -6 when y=0)
test("yDown flips y so cap tops sit above the baseline", () => {
  const { polylines } = singleLineText("A", { capHeight: 6, y: 0, yDown: true });
  const ys = polylines.flat().map((p) => p[1]);
  expect(Math.min(...ys)).toBeCloseTo(-6, 6);
});

// Exporter wiring: an engraved label is a PathEntry on the ENGRAVE role and
// lands on an ENGRAVE layer in the DXF.
test("engraveLabelEntry uses the ENGRAVE role with a parseable path", () => {
  const entry = engraveLabelEntry("P1", { capHeight: 0.5 });
  expect(entry.role).toBe(ENGRAVE_ROLE);
  expect(entry.d.startsWith("M ")).toBe(true);
});

test("appendEngravedLabel adds an ENGRAVE layer to the DXF", () => {
  const geom: PartGeometry = { paths: [{ d: "M 0 0 L 4 0 L 4 4 L 0 4 Z", role: "cut" }], width: 4, height: 4 };
  const withLabel = appendEngravedLabel(geom, "P1", { labelHeight: 0.5 });
  expect(withLabel.paths!.some((p) => p.role === ENGRAVE_ROLE)).toBe(true);
  const dxf = buildDxf(withLabel);
  expect(dxf).toContain("ENGRAVE");
  expect(dxf).toContain("CUT");
});

test("empty label is a no-op", () => {
  const geom: PartGeometry = { paths: [{ d: "M 0 0 L 4 0", role: "cut" }], width: 4, height: 4 };
  expect(appendEngravedLabel(geom, "   ")).toBe(geom);
});
