// Geometry safety net for the parts generator. Run with `npm test`.
//
// Checks the DXF output against the source SVG path across five geometry
// cases: standard scallop, wave, deep (largeArc kicks in), shallow, and
// single-arc. Also confirms:
// - the outline is a closed chain
// - arcs stay as ARC entities (not polylines / splines)
// - the DXF declares $ACADVER, LTYPE, and BLOCKS so strict readers
//   (Illustrator, ezdxf) accept it
// - unsupported path commands throw rather than corrupt

import { test, expect } from "vitest";
import { parsePath, buildDxf, sagitta, fmt } from "./partSvg";

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

// Parses group codes by line parity — DXF values can look like group
// codes, so a regex-based reader can misidentify them.
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

    expect(ents.length).toBe(segs.length);

    segs.forEach((s, i) => {
      const e = ents[i];
      const A: [number, number] = [s.from[0], part.height - s.from[1]];
      const B: [number, number] = [s.to[0], part.height - s.to[1]];
      const forward = dist(e.start, A) + dist(e.end, B);
      const reverse = dist(e.start, B) + dist(e.end, A);
      expect(
        Math.min(forward, reverse),
        `segment ${i} (${s.type}) endpoints drifted`
      ).toBeLessThan(TOL);
    });
  });

  test(`${name}: dxf chain is closed`, () => {
    const part = scallop(spec);
    const ents = readDxfEntities(buildDxf(part));
    const pts = ents.flatMap((e) => [e.start, e.end]);

    const loose = pts.filter(
      (p) => pts.filter((q) => dist(p, q) < TOL).length !== 2
    );
    expect(
      loose.length,
      `open vertex at ${loose[0]?.map((n) => n.toFixed(6)).join(", ")}`
    ).toBe(0);
  });
}

test("dxf declares required structure for strict readers", () => {
  const dxf = buildDxf(scallop(CASES[0][1]));

  expect(dxf, "must declare a version").toMatch(/\$ACADVER\n1\nAC1009/);
  expect(dxf, "must include a BLOCKS section").toMatch(/SECTION\n2\nBLOCKS/);
  expect(dxf, "must define a LTYPE table").toMatch(/TABLE\n2\nLTYPE/);

  const lines = dxf.split("\n");
  const referenced: string[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2)
    if (lines[i] === "6") referenced.push(lines[i + 1]);

  expect(referenced.length, "expected at least one linetype reference")
    .toBeGreaterThan(0);
  for (const lt of new Set(referenced))
    expect(
      dxf.includes(`LTYPE\n2\n${lt}`),
      `linetype ${lt} referenced but never defined`
    ).toBe(true);

  const order = ["HEADER", "TABLES", "BLOCKS", "ENTITIES"].map((s) =>
    dxf.indexOf(`SECTION\n2\n${s}`)
  );
  expect(
    order.every((v, i) => v > -1 && (i === 0 || v > order[i - 1])),
    "sections must appear in spec order"
  ).toBe(true);
});

test("arcs survive as ARC entities, not polylines", () => {
  const dxf = buildDxf(scallop(CASES[0][1]));
  const arcs = readDxfEntities(dxf).filter((e) => e.kind === "ARC");
  expect(arcs.length, "expected 9 scallop arcs").toBe(9);
  expect(dxf.includes("POLYLINE"), "must not emit polylines").toBe(false);
  expect(dxf.includes("SPLINE"), "must not emit splines").toBe(false);
});

test("unsupported path commands throw rather than corrupt", () => {
  expect(() => parsePath("M 0 0 C 1 1 2 2 3 3")).toThrow(/unsupported command/);
});
