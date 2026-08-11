// Bar designer engine for lightweight, sectional event-rental bars.
//
// A bar is a COUNTER-DEPTH cabinet that follows the path of a shape
// (round, hexagon, oval, rect...). It is broken into modular SECTIONS for
// storage and transport, and built light — poplar frame + birch ply skin,
// not solid boxes. Each section has an internal shelf and a 4" toe kick.
//
// The standard section is a TWO-TIER bar:
//   - Patron / service side: 42" service-rail height (drives the front
//     face skin height).
//   - Bartender side: 30" working surface, stepped down behind the rail.
//   - Service rail top: wood countertop overhanging the patron side with a
//     nosing/lip. A light rail tucks under, so the skin is set down for
//     clearance. Top can be coated (none / paint / epoxy / concrete).
//   - Faces/shelves/toe kick: 3/4" birch ply (11/16" actual). Frame: poplar.
//   - 36" bartender access opening in the back run.
//
// The engine reports an itemized price AND an estimated weight (total and
// per section) — weight is a first-class number for a rental that gets
// moved constantly.
//
// Geometry is in INCHES. Overall length/width come in as feet.

import { fmt, parsePath, arcCenter } from "../partSvg";

export interface SeamPt {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export type BarShape = "rect" | "radius" | "hex" | "round" | "oval";
export type Coating = "none" | "paint" | "epoxy" | "concrete";
// How a hard corner (square / hex vertex) is built. miter/butt keep the
// sharp corner; radius/chamfer reshape the outline; column drops a post at
// the corner (bars can share a common column and reconfigure).
export type CornerStyle = "miter" | "butt" | "radius" | "chamfer" | "column";

export const CORNER_STYLES: { value: CornerStyle; label: string }[] = [
  { value: "miter", label: "Mitered" },
  { value: "butt", label: "Butt joint" },
  { value: "radius", label: "Rounded" },
  { value: "chamfer", label: "Chamfer" },
  { value: "column", label: "Column" },
];

export const BAR_SHAPES: { value: BarShape; label: string }[] = [
  { value: "rect", label: "Square / rect" },
  { value: "radius", label: "Curved corners" },
  { value: "hex", label: "Hexagon" },
  { value: "round", label: "Round" },
  { value: "oval", label: "Oval" },
];

export const COATINGS: {
  value: Coating;
  label: string;
  perSqft: number;
  lbPerSqft: number;
}[] = [
  { value: "none", label: "Bare wood", perSqft: 0, lbPerSqft: 0 },
  { value: "paint", label: "Paint", perSqft: 3, lbPerSqft: 0.1 },
  { value: "epoxy", label: "Epoxy", perSqft: 12, lbPerSqft: 0.4 },
  { value: "concrete", label: "Concrete", perSqft: 18, lbPerSqft: 6 },
];

export interface BarSpec {
  shape: BarShape;
  lengthFt: number; // overall length (round: diameter)
  widthFt: number; // overall footprint depth (oval: cap dia; round: ignored)
  cornerRadiusIn: number; // radius shape only
  counterDepthIn: number; // depth of the cabinet band (front-to-back)
  serviceHeightIn: number; // patron-side service rail height (drives face)
  workingHeightIn: number; // bartender-side working surface height
  topThicknessIn: number; // wood countertop thickness
  nosingIn: number; // front lip / nosing drop
  overhangIn: number; // service-rail overhang toward the patron
  toeKickIn: number; // toe kick height
  shelfCount: number; // internal shelves per section
  cornerStyle: CornerStyle; // how hard corners are built
  cornerSizeIn: number; // radius / chamfer leg / column size
  coating: Coating;
  maxPanelIn: number; // max section width before it splits (for transport)
  curvedFronts: boolean; // true curved build for arced runs
  accessGap: boolean;
  accessGapIn: number;
  lightRail: boolean;
  lightRailClearanceIn: number;
  // editable rates
  sheetPrice: number; // $ per 4x8 birch ply sheet
  topPricePerSqft: number; // $ per sqft of countertop material
  laborRate: number; // $ per hour
}

export const BAR_DEFAULTS: BarSpec = {
  shape: "rect",
  lengthFt: 8,
  widthFt: 2,
  cornerRadiusIn: 6,
  counterDepthIn: 24, // standard counter depth
  serviceHeightIn: 42,
  workingHeightIn: 30,
  topThicknessIn: 1.5,
  nosingIn: 1.5,
  overhangIn: 10,
  toeKickIn: 4,
  shelfCount: 1,
  cornerStyle: "miter",
  cornerSizeIn: 6,
  coating: "none",
  maxPanelIn: 48,
  curvedFronts: false,
  accessGap: true,
  accessGapIn: 36,
  lightRail: true,
  lightRailClearanceIn: 1,
  sheetPrice: 75,
  topPricePerSqft: 22,
  laborRate: 65,
};

export const PANEL_MATERIAL = '3/4" birch plywood (11/16" actual)';
export const FRAMING_MATERIAL = "Poplar";
export const PANEL_THICKNESS_IN = 0.6875;

// --- construction / pricing constants -----------------------------------
const WASTE = 0.15;
const SHEET_SQFT = 32;
const FRAMING_PER_FT = 4; // poplar framing $/lf of built face
const HARDWARE_FLAT = 60;
const HARDWARE_PER_FT = 6;
const LIGHT_RAIL_PER_FT = 9; // LED + channel $/lf
const NOSING_PER_FT = 3.5; // solid nosing stock $/lf
const HOURS_BASE = 8;
const HOURS_PER_SECTION = 1.5; // frame + skin + shelf + toe kick
const HOURS_PER_FT_TOP = 0.35;
const HOURS_PER_FT_WORKING = 0.4;
const CURVED_LABOR_MULT = 1.7;
const CURVED_MATERIAL_PER_PANEL = 25;

// --- weight constants (lb) ----------------------------------------------
const BIRCH_PLY_LB_PER_SQFT = 2.0; // 3/4" birch ply
const FRAMING_LB_PER_FT = 0.45; // poplar 1x2-ish
const FRAMING_LF_PER_FACE_FT = 4; // rails + studs + shelf cleats per lf
const TOP_LB_PER_SQFT = 4.5; // 1.5" hardwood top

const round16 = (v: number): number => Math.round(v * 16) / 16;

interface Run {
  kind: "straight" | "arc";
  len: number;
  r?: number;
  angle?: number;
}

export interface CutItem {
  label: string;
  qty: number;
  widthIn: number;
  heightIn: number;
  kind: string;
  note?: string;
}

export interface PriceLine {
  label: string;
  detail: string;
  amount: number;
}

export interface BarSolve {
  outline: string;
  innerOutline: string | null; // hollow standing space (perimeter inset by counter depth)
  innerInsetIn: number;
  bboxW: number;
  bboxH: number;
  perimeterIn: number;
  perimeterFt: number;
  builtFaceIn: number;
  builtFaceFt: number;
  sections: number;
  faceHeightIn: number; // to top of service rail structure
  frontSkinHeightIn: number; // visible front skin (above the toe kick)
  stepDownIn: number;
  railClearanceIn: number; // under service-rail top to working surface (bottle storage)
  panelCount: number;
  facetCount: number;
  panels: CutItem[]; // front skins
  shelves: CutItem[];
  toeKicks: CutItem[];
  tops: CutItem[];
  plyAreaSqft: number;
  topAreaSqft: number;
  sheetsFace: number;
  weightLb: number;
  weightPerSectionLb: number;
  seams: SeamPt[]; // interior subdivision joints on the plan
  corners: SeamPt[]; // shape corners / straight-to-curve joints
  cornerPosts: { x: number; y: number }[]; // column posts (column style)
  cornerSizeIn: number;
  entrance: { ax: number; ay: number; bx: number; by: number } | null;
  dims: { outerW: number; outerH: number; innerW: number; innerH: number };
  gap: { active: boolean; widthIn: number };
  price: {
    lines: PriceLine[];
    materials: number;
    labor: number;
    laborHours: number;
    total: number;
    perFt: number;
  };
  notes: string[];
  error?: string;
}

// ------------------------------------------------------------------------

type V = [number, number];
const vsub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const vlen = (a: V): number => Math.hypot(a[0], a[1]);
const vunit = (a: V): V => {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l];
};
const vadd = (a: V, d: V, s: number): V => [a[0] + d[0] * s, a[1] + d[1] * s];

// Build a closed outline from convex polygon vertices (given clockwise in
// SVG's y-down space), applying a corner treatment at every vertex.
// `sharp` styles (miter/butt/column) keep the vertex; radius fillets it;
// chamfer clips it flat. Trim is clamped so it never eats a whole edge.
function polygonOutline(verts: V[], style: CornerStyle, size: number): string {
  const nV = verts.length;
  const treat = style === "radius" || style === "chamfer";
  const nodes = verts.map((Vv, i) => {
    const P = verts[(i - 1 + nV) % nV];
    const N = verts[(i + 1) % nV];
    const din = vunit(vsub(Vv, P));
    const dout = vunit(vsub(N, Vv));
    if (!treat || size <= 0) return { A: Vv, B: Vv, arc: 0 };
    let d = size;
    if (style === "radius") {
      // fillet tangent length = r / tan(interiorAngle/2)
      const cosT = Math.max(-1, Math.min(1, -din[0] * dout[0] - din[1] * dout[1]));
      const theta = Math.acos(cosT);
      d = size / Math.tan(theta / 2);
    }
    d = Math.min(d, vlen(vsub(Vv, P)) * 0.49, vlen(vsub(N, Vv)) * 0.49);
    return { A: vadd(Vv, din, -d), B: vadd(Vv, dout, d), arc: style === "radius" ? size : 0 };
  });

  let path = `M ${fmt(nodes[0].B[0])} ${fmt(nodes[0].B[1])}`;
  for (let i = 0; i < nV; i++) {
    const next = nodes[(i + 1) % nV];
    path += ` L ${fmt(next.A[0])} ${fmt(next.A[1])}`;
    if (next.arc > 0) {
      path += ` A ${fmt(next.arc)} ${fmt(next.arc)} 0 0 1 ${fmt(next.B[0])} ${fmt(next.B[1])}`;
    } else if (treat) {
      path += ` L ${fmt(next.B[0])} ${fmt(next.B[1])}`;
    }
  }
  return path + " Z";
}

function shapeGeometry(spec: BarSpec):
  | {
      outline: string;
      bboxW: number;
      bboxH: number;
      runs: Run[];
      accessRunIndex: number;
      notes: string[];
    }
  | { error: string } {
  const L = spec.lengthFt * 12;
  const W = spec.widthFt * 12;
  const notes: string[] = [];

  switch (spec.shape) {
    case "rect": {
      const outline = polygonOutline(
        [
          [0, 0],
          [L, 0],
          [L, W],
          [0, W],
        ],
        spec.cornerStyle,
        spec.cornerSizeIn
      );
      return {
        outline,
        bboxW: L,
        bboxH: W,
        runs: [
          { kind: "straight", len: L },
          { kind: "straight", len: W },
          { kind: "straight", len: L },
          { kind: "straight", len: W },
        ],
        accessRunIndex: 2,
        notes,
      };
    }
    case "radius": {
      const r = Math.min(spec.cornerRadiusIn, L / 2, W / 2);
      if (r < 0.5) return { error: "Corner radius too small — use Square / rect." };
      const outline = [
        `M ${fmt(r)} 0`,
        `L ${fmt(L - r)} 0`,
        `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(L)} ${fmt(r)}`,
        `L ${fmt(L)} ${fmt(W - r)}`,
        `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(L - r)} ${fmt(W)}`,
        `L ${fmt(r)} ${fmt(W)}`,
        `A ${fmt(r)} ${fmt(r)} 0 0 1 0 ${fmt(W - r)}`,
        `L 0 ${fmt(r)}`,
        `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} 0`,
        "Z",
      ].join(" ");
      const quarter = (Math.PI / 2) * r;
      return {
        outline,
        bboxW: L,
        bboxH: W,
        runs: [
          { kind: "straight", len: L - 2 * r },
          { kind: "arc", len: quarter, r, angle: Math.PI / 2 },
          { kind: "straight", len: W - 2 * r },
          { kind: "arc", len: quarter, r, angle: Math.PI / 2 },
          { kind: "straight", len: L - 2 * r },
          { kind: "arc", len: quarter, r, angle: Math.PI / 2 },
          { kind: "straight", len: W - 2 * r },
          { kind: "arc", len: quarter, r, angle: Math.PI / 2 },
        ],
        accessRunIndex: 4,
        notes,
      };
    }
    case "hex": {
      const e = Math.min(W / 2, L / 3);
      const outline = polygonOutline(
        [
          [e, 0],
          [L - e, 0],
          [L, W / 2],
          [L - e, W],
          [e, W],
          [0, W / 2],
        ],
        spec.cornerStyle,
        spec.cornerSizeIn
      );
      const diag = Math.sqrt(e * e + (W / 2) * (W / 2));
      return {
        outline,
        bboxW: L,
        bboxH: W,
        runs: [
          { kind: "straight", len: L - 2 * e },
          { kind: "straight", len: diag },
          { kind: "straight", len: diag },
          { kind: "straight", len: L - 2 * e },
          { kind: "straight", len: diag },
          { kind: "straight", len: diag },
        ],
        accessRunIndex: 3,
        notes,
      };
    }
    case "round": {
      const D = L;
      const R = D / 2;
      if (R < 6) return { error: "Diameter too small for a bar." };
      const outline =
        `M 0 ${fmt(R)} A ${fmt(R)} ${fmt(R)} 0 0 1 ${fmt(D)} ${fmt(R)} ` +
        `A ${fmt(R)} ${fmt(R)} 0 0 1 0 ${fmt(R)} Z`;
      notes.push("Round bar uses the Length field as the diameter.");
      return {
        outline,
        bboxW: D,
        bboxH: D,
        runs: [{ kind: "arc", len: 2 * Math.PI * R, r: R, angle: 2 * Math.PI }],
        accessRunIndex: 0,
        notes,
      };
    }
    case "oval": {
      if (W >= L) return { error: "Oval length must be greater than its width." };
      const r = W / 2;
      const straight = L - W;
      const outline = [
        `M ${fmt(r)} 0`,
        `L ${fmt(L - r)} 0`,
        `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(L - r)} ${fmt(W)}`,
        `L ${fmt(r)} ${fmt(W)}`,
        `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} 0`,
        "Z",
      ].join(" ");
      return {
        outline,
        bboxW: L,
        bboxH: W,
        runs: [
          { kind: "straight", len: straight },
          { kind: "arc", len: Math.PI * r, r, angle: Math.PI },
          { kind: "straight", len: straight },
          { kind: "arc", len: Math.PI * r, r, angle: Math.PI },
        ],
        accessRunIndex: 2,
        notes,
      };
    }
  }
}

interface RawPanel {
  w: number;
  h: number;
  kind: "straight" | "facet" | "curved";
  leftCut?: number; // miter angle (deg) on the start-side vertical edge
  rightCut?: number; // miter angle (deg) on the end-side vertical edge
}

// Miter angle for the panels meeting at a hard (line-to-line) corner. Half
// the exterior turn angle: a 90° square corner returns 45°. Null when a
// segment isn't straight-to-straight (curves handle their own bevels).
function miterDeg(prev: PSeg, cur: PSeg): number | null {
  if (prev.type !== "line" || cur.type !== "line") return null;
  const a = cur.at(0);
  const b = prev.at(1);
  const dot = Math.max(-1, Math.min(1, a.nx * b.nx + a.ny * b.ny));
  const theta = Math.acos(dot);
  const deg = (theta / 2) * (180 / Math.PI);
  return deg < 0.5 ? null : Math.round(deg * 10) / 10;
}

// --- perimeter walker ---------------------------------------------------
// Every path segment (a straight run between corners, or one arc) is a
// unit that sections subdivide — a section never crosses a corner.
interface PSeg {
  type: "line" | "arc";
  len: number;
  r: number;
  at: (t: number) => SeamPt; // t in [0,1] along the segment; nx,ny = outward normal
}

function buildSegs(outline: string): PSeg[] {
  return parsePath(outline).map((s): PSeg => {
    if (s.type === "line") {
      const dx = s.to[0] - s.from[0];
      const dy = s.to[1] - s.from[1];
      const len = Math.hypot(dx, dy) || 0;
      const nl = len || 1;
      return {
        type: "line",
        len,
        r: 0,
        at: (t) => ({
          x: s.from[0] + dx * t,
          y: s.from[1] + dy * t,
          nx: dy / nl,
          ny: -dx / nl,
        }),
      };
    }
    const c = arcCenter(s);
    let sweep = c.t2 - c.t1;
    if (s.sweep === 1 && sweep < 0) sweep += 2 * Math.PI;
    if (s.sweep === 0 && sweep > 0) sweep -= 2 * Math.PI;
    const len = Math.abs(sweep * c.r);
    return {
      type: "arc",
      len,
      r: c.r,
      at: (t) => {
        const a = c.t1 + sweep * t;
        return {
          x: c.cx + c.r * Math.cos(a),
          y: c.cy + c.r * Math.sin(a),
          nx: Math.cos(a),
          ny: Math.sin(a),
        };
      },
    };
  });
}

// Full sections from the entrance outward; small remainder pushed to the
// far (corner) end so it never borders the entrance. Returns arc-lengths
// ordered start->end of the sub-run; `remAtStart` puts the remainder at
// the start instead (used for the half whose entrance edge is at its end).
function sizeRun(len: number, max: number, remAtStart: boolean): number[] {
  const MIN = 8;
  if (len <= max + 0.01) return [len];
  const n = Math.floor(len / max);
  const rem = len - n * max;
  let widths: number[];
  if (rem < MIN) {
    const m = Math.ceil(len / max);
    widths = Array(m).fill(len / m);
  } else {
    widths = Array(n).fill(max);
    widths.push(rem); // remainder at the far end
  }
  if (remAtStart) widths.reverse();
  return widths;
}

// Even sections (used for non-entrance runs, so mirrored runs match).
function sizeEven(len: number, max: number): number[] {
  const n = Math.max(1, Math.ceil(len / max));
  return Array(n).fill(len / n);
}

interface Layout {
  panels: RawPanel[];
  seams: SeamPt[]; // interior subdivision joints
  corners: SeamPt[]; // shape corners / straight-to-curve joints
  entrance: { ax: number; ay: number; bx: number; by: number } | null;
  gapApplied: boolean;
  gapNote?: string;
}

function layoutSections(
  outline: string,
  spec: BarSpec,
  skinH: number,
  anchorX: number,
  anchorY: number
): Layout {
  const segs = buildSegs(outline);
  const gapW = spec.accessGap ? spec.accessGapIn : 0;

  // Which segment carries the entrance (the one containing bottom-center).
  let entSeg = -1;
  let entT = 0.5;
  if (gapW > 0) {
    let best = Infinity;
    segs.forEach((seg, i) => {
      const N = 48;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const p = seg.at(t);
        const d = (p.x - anchorX) ** 2 + (p.y - anchorY) ** 2;
        if (d < best) {
          best = d;
          entSeg = i;
          entT = t;
        }
      }
    });
  }

  const panels: RawPanel[] = [];
  const seams: SeamPt[] = [];
  let entrance: Layout["entrance"] = null;
  let gapApplied = false;
  let gapNote: string | undefined;

  // Corners = junctions between segments, unless it's a smooth arc-to-arc
  // continuation (a round bar has no corners). Straight-to-curve joints on
  // radius/oval bars DO count — they're real section joints.
  const corners: SeamPt[] = [];
  const n = segs.length;
  for (let i = 0; i < n; i++) {
    const cur = segs[i];
    const prev = segs[(i - 1 + n) % n];
    if (cur.len < 0.5 || prev.len < 0.5) continue;
    const a = cur.at(0);
    const b = prev.at(1);
    const smooth =
      cur.type === "arc" && prev.type === "arc" && a.nx * b.nx + a.ny * b.ny > 0.999;
    if (smooth) continue;
    let nx = a.nx + b.nx;
    let ny = a.ny + b.ny;
    const l = Math.hypot(nx, ny) || 1;
    corners.push({ x: a.x, y: a.y, nx: nx / l, ny: ny / l });
  }

  const miter = spec.cornerStyle === "miter";
  // Push a contiguous set of sections; returns [firstIdx, lastIdx] so the
  // caller can tag the corner-adjacent panels' end cuts.
  const pushRun = (seg: PSeg, startLen: number, widths: number[]): [number, number] => {
    const first = panels.length;
    let pos = startLen;
    for (const w of widths) {
      if (pos > startLen + 0.01) seams.push(seg.at(pos / seg.len));
      if (seg.type === "line") {
        panels.push({ w, h: skinH, kind: "straight" });
      } else {
        const ang = w / seg.r;
        panels.push({
          w: spec.curvedFronts ? w : 2 * seg.r * Math.sin(ang / 2),
          h: skinH,
          kind: spec.curvedFronts ? "curved" : "facet",
        });
      }
      pos += w;
    }
    return [first, panels.length - 1];
  };

  segs.forEach((seg, i) => {
    if (seg.len < 0.5) return;
    const startMiter = miter ? miterDeg(segs[(i - 1 + n) % n], seg) : null;
    const endMiter = miter ? miterDeg(seg, segs[(i + 1) % n]) : null;

    if (i === entSeg && gapW > 0) {
      const center = entT * seg.len;
      const a = center - gapW / 2;
      const b = center + gapW / 2;
      if (a <= 0.5 || b >= seg.len - 0.5) {
        // entrance eats the whole run — leave it fully open
        const s0 = seg.at(0);
        const s1 = seg.at(1);
        entrance = { ax: s0.x, ay: s0.y, bx: s1.x, by: s1.y };
        gapApplied = true;
        gapNote = "Access opening spans the entire back run.";
        return;
      }
      // left part: start -> a (entrance at its END, remainder at start/corner)
      const [lf] = pushRun(seg, 0, sizeRun(a, spec.maxPanelIn, true));
      if (startMiter != null && panels[lf]) panels[lf].leftCut = startMiter;
      const aPt = seg.at(a / seg.len);
      const bPt = seg.at(b / seg.len);
      entrance = { ax: aPt.x, ay: aPt.y, bx: bPt.x, by: bPt.y };
      gapApplied = true;
      // right part: b -> end (entrance at its START, remainder at end/corner)
      const [, rl] = pushRun(seg, b, sizeRun(seg.len - b, spec.maxPanelIn, false));
      if (endMiter != null && panels[rl]) panels[rl].rightCut = endMiter;
    } else {
      const [f, l] = pushRun(seg, 0, sizeEven(seg.len, spec.maxPanelIn));
      if (startMiter != null && panels[f]) panels[f].leftCut = startMiter;
      if (endMiter != null && panels[l]) panels[l].rightCut = endMiter;
    }
  });

  return { panels, seams, corners, entrance, gapApplied, gapNote };
}

function faceNote(p: RawPanel): string | undefined {
  if (p.kind === "curved") return "Curved / coopered face";
  if (p.kind === "facet") return "Bevel both vertical edges";
  const parts: string[] = [];
  if (p.leftCut) parts.push(`L miter ${p.leftCut}°`);
  if (p.rightCut) parts.push(`R miter ${p.rightCut}°`);
  return parts.length ? parts.join(" · ") : undefined;
}

function group(items: RawPanel[], prefix: string, noteFor?: (p: RawPanel) => string | undefined): CutItem[] {
  const map = new Map<string, CutItem>();
  const order: string[] = [];
  for (const p of items) {
    const w = round16(p.w);
    const h = round16(p.h);
    const key = `${p.kind}|${w}|${h}|${p.leftCut ?? 0}|${p.rightCut ?? 0}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty += 1;
    } else {
      map.set(key, {
        label: "",
        qty: 1,
        widthIn: w,
        heightIn: h,
        kind: p.kind,
        note: noteFor ? noteFor(p) : faceNote(p),
      });
      order.push(key);
    }
  }
  return order.map((k, i) => {
    const it = map.get(k)!;
    it.label = `${prefix}${i + 1}`;
    return it;
  });
}

// Inner opening = the shape inset by the counter depth on all sides. Built
// by re-running the shape at reduced dimensions; returns null when the
// bar is too small to leave a standing space (a solid bar).
function innerOutline(spec: BarSpec, d: number): string | null {
  const L = spec.lengthFt * 12;
  const W = spec.widthFt * 12;
  if (spec.shape === "round") {
    if (L - 2 * d < 12) return null;
  } else if (L - 2 * d < 6 || W - 2 * d < 6) {
    return null;
  }
  const inner = shapeGeometry({
    ...spec,
    lengthFt: (L - 2 * d) / 12,
    widthFt: (W - 2 * d) / 12,
    cornerRadiusIn: Math.max(0, spec.cornerRadiusIn - d),
    // inner corner treatment shrinks with the offset
    cornerSizeIn:
      spec.cornerStyle === "radius" || spec.cornerStyle === "chamfer"
        ? Math.max(0, spec.cornerSizeIn - d)
        : spec.cornerSizeIn,
  });
  return "error" in inner ? null : inner.outline;
}

const emptySolve = (error: string): BarSolve => ({
  outline: "",
  innerOutline: null,
  innerInsetIn: 0,
  bboxW: 0,
  bboxH: 0,
  perimeterIn: 0,
  perimeterFt: 0,
  builtFaceIn: 0,
  builtFaceFt: 0,
  sections: 0,
  faceHeightIn: 0,
  frontSkinHeightIn: 0,
  stepDownIn: 0,
  railClearanceIn: 0,
  panelCount: 0,
  facetCount: 0,
  panels: [],
  shelves: [],
  toeKicks: [],
  tops: [],
  plyAreaSqft: 0,
  topAreaSqft: 0,
  sheetsFace: 0,
  weightLb: 0,
  weightPerSectionLb: 0,
  seams: [],
  corners: [],
  cornerPosts: [],
  cornerSizeIn: 0,
  entrance: null,
  dims: { outerW: 0, outerH: 0, innerW: 0, innerH: 0 },
  gap: { active: false, widthIn: 0 },
  price: { lines: [], materials: 0, labor: 0, laborHours: 0, total: 0, perFt: 0 },
  notes: [],
  error,
});

export function solveBar(spec: BarSpec): BarSolve {
  const faceHeightIn = Math.max(
    1,
    spec.serviceHeightIn -
      spec.topThicknessIn -
      (spec.lightRail ? spec.lightRailClearanceIn : 0)
  );
  const frontSkinHeightIn = Math.max(1, faceHeightIn - spec.toeKickIn);
  const stepDownIn = Math.max(0, spec.serviceHeightIn - spec.workingHeightIn);
  // Clear space under the service-rail top down to the working surface —
  // the bottle-storage shelf zone.
  const railClearanceIn = Math.max(
    0,
    spec.serviceHeightIn - spec.topThicknessIn - spec.workingHeightIn
  );

  const geo = shapeGeometry(spec);
  if ("error" in geo) return emptySolve(geo.error);

  const {
    panels: rawFaces,
    seams,
    corners,
    entrance,
    gapApplied,
    gapNote,
  } = layoutSections(geo.outline, spec, frontSkinHeightIn, geo.bboxW / 2, geo.bboxH);
  const panelCount = rawFaces.length;
  const facetCount = rawFaces.filter((p) => p.kind !== "straight").length;

  const builtFaceIn = rawFaces.reduce((s, p) => s + p.w, 0);
  const builtFaceFt = builtFaceIn / 12;

  // Full footprint perimeter = built face + the access opening.
  const perimeterIn = builtFaceIn + (entrance ? spec.accessGapIn : 0);
  const perimeterFt = perimeterIn / 12;

  // Derive the other per-section components from the same section widths so
  // gap removal and facet widths carry through consistently.
  const serviceTopWidthIn = spec.counterDepthIn + spec.overhangIn;
  const shelfDepthIn = Math.max(6, spec.counterDepthIn - 2);

  const rawShelves: RawPanel[] = [];
  const rawToe: RawPanel[] = [];
  const rawTops: RawPanel[] = [];
  for (const p of rawFaces) {
    for (let s = 0; s < spec.shelfCount; s++)
      rawShelves.push({ w: p.w, h: shelfDepthIn, kind: "straight" });
    rawToe.push({ w: p.w, h: spec.toeKickIn, kind: "straight" });
    rawTops.push({ w: p.w, h: serviceTopWidthIn, kind: "straight" });
  }

  const panels = group(rawFaces, "P");
  const shelves = group(rawShelves, "S", () => "Shelf");
  const toeKicks = group(rawToe, "K", () => "Recessed toe kick");
  const tops = group(rawTops, "T", () => undefined);

  const faceAreaSqft = rawFaces.reduce((s, p) => s + p.w * p.h, 0) / 144;
  const shelfAreaSqft = rawShelves.reduce((s, p) => s + p.w * p.h, 0) / 144;
  const toeAreaSqft = rawToe.reduce((s, p) => s + p.w * p.h, 0) / 144;
  const plyAreaSqft = faceAreaSqft + shelfAreaSqft + toeAreaSqft;
  const topAreaSqft = (builtFaceIn * serviceTopWidthIn) / 144;
  const sheetsFace = Math.ceil((plyAreaSqft * (1 + WASTE)) / SHEET_SQFT);

  // --- weight -----------------------------------------------------------
  const coating = COATINGS.find((c) => c.value === spec.coating) ?? COATINGS[0];
  const framingLf = builtFaceFt * FRAMING_LF_PER_FACE_FT;
  const plyWeight = plyAreaSqft * BIRCH_PLY_LB_PER_SQFT;
  const framingWeight = framingLf * FRAMING_LB_PER_FT;
  const topWeight = topAreaSqft * (TOP_LB_PER_SQFT + coating.lbPerSqft);
  const weightLb = plyWeight + framingWeight + topWeight;
  const weightPerSectionLb = panelCount > 0 ? weightLb / panelCount : 0;

  // --- pricing ----------------------------------------------------------
  const curvedCount = rawFaces.filter((p) => p.kind === "curved").length;
  const straightSections = panelCount - curvedCount;
  const shapeExtraHours =
    spec.shape === "round" || spec.shape === "oval"
      ? 4
      : spec.shape === "hex" || spec.shape === "radius"
        ? 2
        : 0;

  const sheetCost = sheetsFace * spec.sheetPrice;
  const framingCost = builtFaceFt * FRAMING_PER_FT;
  const topCost = topAreaSqft * spec.topPricePerSqft;
  const coatingCost = topAreaSqft * coating.perSqft;
  const nosingCost = builtFaceFt * NOSING_PER_FT;
  const lightRailCost = spec.lightRail ? builtFaceFt * LIGHT_RAIL_PER_FT : 0;
  const curvedMaterialCost = curvedCount * CURVED_MATERIAL_PER_PANEL;
  const hardwareCost = HARDWARE_FLAT + builtFaceFt * HARDWARE_PER_FT;

  const laborHours =
    HOURS_BASE +
    straightSections * HOURS_PER_SECTION +
    curvedCount * HOURS_PER_SECTION * CURVED_LABOR_MULT +
    builtFaceFt * HOURS_PER_FT_TOP +
    builtFaceFt * HOURS_PER_FT_WORKING +
    shapeExtraHours;
  const laborCost = laborHours * spec.laborRate;

  const lines: PriceLine[] = [
    {
      label: "Birch ply (faces, shelves, toe kick)",
      detail: `${sheetsFace} sheet${sheetsFace === 1 ? "" : "s"} @ $${spec.sheetPrice} (${plyAreaSqft.toFixed(1)} sqft +${Math.round(WASTE * 100)}% waste)`,
      amount: sheetCost,
    },
    {
      label: "Poplar framing",
      detail: `${builtFaceFt.toFixed(1)} lf @ $${FRAMING_PER_FT}/lf`,
      amount: framingCost,
    },
    {
      label: "Wood countertop",
      detail: `${topAreaSqft.toFixed(1)} sqft @ $${spec.topPricePerSqft}/sqft`,
      amount: topCost,
    },
    ...(coatingCost > 0
      ? [
          {
            label: `Top finish — ${coating.label.toLowerCase()}`,
            detail: `${topAreaSqft.toFixed(1)} sqft @ $${coating.perSqft}/sqft`,
            amount: coatingCost,
          },
        ]
      : []),
    {
      label: "Nosing / lip stock",
      detail: `${builtFaceFt.toFixed(1)} lf @ $${NOSING_PER_FT}/lf`,
      amount: nosingCost,
    },
    ...(lightRailCost > 0
      ? [
          {
            label: "Light rail (LED + channel)",
            detail: `${builtFaceFt.toFixed(1)} lf @ $${LIGHT_RAIL_PER_FT}/lf`,
            amount: lightRailCost,
          },
        ]
      : []),
    ...(curvedMaterialCost > 0
      ? [
          {
            label: "Curved-front stock",
            detail: `${curvedCount} curved panels @ $${CURVED_MATERIAL_PER_PANEL}`,
            amount: curvedMaterialCost,
          },
        ]
      : []),
    {
      label: "Hardware & consumables",
      detail: `$${HARDWARE_FLAT} + ${builtFaceFt.toFixed(1)} lf @ $${HARDWARE_PER_FT}/lf`,
      amount: hardwareCost,
    },
    {
      label: "Labor",
      detail: `${laborHours.toFixed(1)} hrs @ $${spec.laborRate}/hr`,
      amount: laborCost,
    },
  ];

  const materials =
    sheetCost +
    framingCost +
    topCost +
    coatingCost +
    nosingCost +
    lightRailCost +
    curvedMaterialCost +
    hardwareCost;
  const labor = laborCost;
  const total = materials + labor;

  const notes = [...geo.notes];
  notes.push(
    `${panelCount} transport sections · ${spec.counterDepthIn}″ counter depth · two-tier ${spec.serviceHeightIn}″ service / ${spec.workingHeightIn}″ working (${stepDownIn}″ step-down).`
  );
  notes.push(
    `Each section: poplar frame + ${PANEL_MATERIAL} skin, ${spec.shelfCount} shelf${spec.shelfCount === 1 ? "" : "s"}, ${spec.toeKickIn}″ recessed toe kick. Front skin ${frontSkinHeightIn.toFixed(1)}″ tall.`
  );
  notes.push(
    `Service rail: ${spec.overhangIn}″ overhang, ${spec.nosingIn}″ nosing/lip, ${spec.topThicknessIn}″ ${coating.label.toLowerCase()} wood top.`
  );
  const hardCorners = spec.shape === "rect" || spec.shape === "hex";
  if (hardCorners) {
    const cs = spec.cornerStyle;
    const desc =
      cs === "miter"
        ? "mitered — cut angles in the Front skins list"
        : cs === "butt"
          ? "butt joints"
          : cs === "radius"
            ? `rounded, ${spec.cornerSizeIn}″ radius (curved corner sections)`
            : cs === "chamfer"
              ? `chamfered, ${spec.cornerSizeIn}″ (flat clipped corner sections)`
              : `${spec.cornerSizeIn}″ corner columns — bars can share a column and reconfigure`;
    notes.push(`Corners: ${desc}.`);
  }
  notes.push(
    `Under-rail storage: ${railClearanceIn.toFixed(1)}″ clear between the service-rail underside and the working surface (target 12″).`
  );
  if (spec.lightRail)
    notes.push(
      `Light rail tucked under the lip — skin set down ${spec.lightRailClearanceIn}″ for clearance.`
    );
  if (gapApplied)
    notes.push(gapNote ?? `${spec.accessGapIn}″ bartender access opening in the back run.`);
  if (weightPerSectionLb > 65)
    notes.push(
      `⚠ ~${Math.round(weightPerSectionLb)} lb per section — heavy for a rental. Consider a smaller max section width or a lighter top finish.`
    );

  const inner = innerOutline(spec, spec.counterDepthIn);

  return {
    outline: geo.outline,
    innerOutline: inner,
    innerInsetIn: spec.counterDepthIn,
    bboxW: geo.bboxW,
    bboxH: geo.bboxH,
    perimeterIn,
    perimeterFt,
    builtFaceIn,
    builtFaceFt,
    sections: panelCount,
    faceHeightIn,
    frontSkinHeightIn,
    stepDownIn,
    railClearanceIn,
    panelCount,
    facetCount,
    panels,
    shelves,
    toeKicks,
    tops,
    plyAreaSqft,
    topAreaSqft,
    sheetsFace,
    weightLb,
    weightPerSectionLb,
    seams,
    corners,
    cornerPosts:
      hardCorners && spec.cornerStyle === "column"
        ? corners.map((c) => ({ x: c.x, y: c.y }))
        : [],
    cornerSizeIn: spec.cornerSizeIn,
    entrance,
    dims: {
      outerW: geo.bboxW,
      outerH: geo.bboxH,
      innerW: inner ? geo.bboxW - 2 * spec.counterDepthIn : 0,
      innerH: inner ? geo.bboxH - 2 * spec.counterDepthIn : 0,
    },
    gap: {
      active: gapApplied && spec.accessGap,
      widthIn: spec.accessGapIn,
    },
    price: {
      lines,
      materials,
      labor,
      laborHours,
      total,
      perFt: builtFaceFt > 0 ? total / builtFaceFt : 0,
    },
    notes,
  };
}

// Lay every unique face panel out in a row as rectangles for a single
// cut-sheet DXF/SVG.
export function panelSheetGeometry(panels: CutItem[]): {
  paths: { d: string; role: string }[];
  width: number;
  height: number;
} {
  const gap = 2;
  let x = 0;
  let maxH = 0;
  const paths: { d: string; role: string }[] = [];
  for (const p of panels) {
    const w = p.widthIn;
    const h = p.heightIn;
    paths.push({
      d: `M ${fmt(x)} 0 L ${fmt(x + w)} 0 L ${fmt(x + w)} ${fmt(h)} L ${fmt(x)} ${fmt(h)} Z`,
      role: "panel",
    });
    x += w + gap;
    if (h > maxH) maxH = h;
  }
  return { paths, width: Math.max(0, x - gap), height: maxH };
}
