// Geometry safety net. Run with:
//   node --test src/lib/partSvg.test.ts
// Node 22.6+ strips TS types natively; no compile step or runner needed.
//
// Checks the DXF output against the source SVG path across five geometry
// cases: standard scallop, wave, deep (largeArc kicks in), shallow, and
// single-arc. Also confirms arcs stay as ARC entities (not polylines /
// splines) and that unsupported path commands throw.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePath, buildDxf, sagitta, fmt } from "./partSvg.ts";

type Spec = {
  width: number;
  height: number;
  ear: number;
  target: number;
  depth: number;
  mode?: "scallop" | "wave";
};

function scallop({ width, height, ear, target, depth, mode = "scallop" }: Spec) {
  const span = width - 2 * ear;
  const count = Math.max(1, Math.round(span / target));
  const s = span / count;
  const r = sagitta(s, depth);
  const la = depth > s / 2 ? 1 : 0;
  const seg: string[] = [
    "M 0 0",
    `L ${fmt(width)} 0`,
    `L ${fmt(width)} ${fmt(height)}`,
    `L ${fmt(width - ear)} ${fmt(height)}`,
  ];
  for (let i = 0; i < count; i++) {
    const flag = mode === "wave" && i % 2 === 1 ? 1 : 0;
    seg.push(
      `A ${fmt(r)} ${fmt(r)} 0 ${la} ${flag} ${fmt(
        width - ear - (i + 1) * s
      )} ${fmt(height)}`
    );
  }
  seg.push(`L 0 ${fmt(height)}`, "Z");
  return {
    path: seg.join(" "),
    width,
    height: height + (mode === "wave" ? depth : 0),
  };
}

type Entity =
  | { kind: "LINE"; start: [number, number]; end: [number, number] }
  | {
      kind: "ARC";
      center: [number, number];
      radius: number;
      start: [number, number];
      end: [number, number];
    };

function readDxfEntities(dxf: string): Entity[] {
  const lines = dxf.split("\n");
  const out: Entity[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "0") continue;
    const kind = lines[i + 1]?.trim();
    if (kind !== "LINE" && kind !== "ARC") continue;
    const g: Record<string, string> = {};
    for (let j = i + 2; j < lines.length; j += 2) {
      const code = lines[j].trim();
      if (code === "0") break;
      g[code] = lines[j + 1].trim();
    }
    if (kind === "LINE") {
      out.push({
        kind,
        start: [+g["10"], +g["20"]],
        end: [+g["11"], +g["21"]],
      });
    } else {
      const c: [number, number] = [+g["10"], +g["20"]];
      const r = +g["40"];
      const a = (+g["50"] * Math.PI) / 180;
      const b = (+g["51"] * Math.PI) / 180;
      out.push({
        kind,
        center: c,
        radius: r,
        start: [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)],
        end: [c[0] + r * Math.cos(b), c[1] + r * Math.sin(b)],
      });
    }
  }
  return out;
}

const dist = (p: [number, number], q: [number, number]) =>
  Math.hypot(p[0] - q[0], p[1] - q[1]);
const TOL = 1e-7;

const CASES: [string, Spec][] = [
  ["standard", { width: 48, height: 6, ear: 2, target: 5, depth: 1.5 }],
  ["wave", { width: 48, height: 6, ear: 2, target: 5, depth: 1.5, mode: "wave" }],
  ["deep", { width: 30, height: 8, ear: 1, target: 4, depth: 3 }],
  ["shallow", { width: 60, height: 4, ear: 2.5, target: 7, depth: 0.5 }],
  ["single", { width: 20, height: 5, ear: 2, target: 16, depth: 1 }],
];

for (const [name, spec] of CASES) {
  test(`${name}: dxf endpoints match svg path`, () => {
    const part = scallop(spec);
    const segs = parsePath(part.path);
    const ents = readDxfEntities(buildDxf(part));

    assert.equal(ents.length, segs.length, "entity count");

    segs.forEach((s, i) => {
      const e = ents[i];
      const A: [number, number] = [s.from[0], part.height - s.from[1]];
      const B: [number, number] = [s.to[0], part.height - s.to[1]];
      const forward = dist(e.start, A) + dist(e.end, B);
      const reverse = dist(e.start, B) + dist(e.end, A);
      assert.ok(
        Math.min(forward, reverse) < TOL,
        `segment ${i} (${s.type}) endpoints drifted`
      );
    });
  });

  test(`${name}: dxf chain is closed`, () => {
    const part = scallop(spec);
    const ents = readDxfEntities(buildDxf(part));
    const pts = ents.flatMap((e) => [e.start, e.end]);

    const loose = pts.filter(
      (p) => pts.filter((q) => dist(p, q) < TOL).length !== 2
    );
    assert.equal(
      loose.length,
      0,
      `open vertex at ${loose[0]?.map((n) => n.toFixed(6)).join(", ")}`
    );
  });
}

test("arcs survive as ARC entities, not polylines", () => {
  const dxf = buildDxf(scallop(CASES[0][1]));
  const arcs = readDxfEntities(dxf).filter((e) => e.kind === "ARC");
  assert.equal(arcs.length, 9, "expected 9 scallop arcs");
  assert.ok(!dxf.includes("POLYLINE"), "must not emit polylines");
  assert.ok(!dxf.includes("SPLINE"), "must not emit splines");
});

test("unsupported path commands throw rather than corrupt", () => {
  assert.throws(() => parsePath("M 0 0 C 1 1 2 2 3 3"), /unsupported command/);
});
