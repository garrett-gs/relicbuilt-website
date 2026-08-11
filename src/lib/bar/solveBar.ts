// Bar designer engine. Takes a shape + overall size + your standard
// construction params and produces: a plan-view outline, a panelized
// front-body cut list, a counter/top blank list, and an itemized
// materials + labor price. Faceted construction is the default; round /
// oval / radius-corner bars can be upgraded to true curved fronts per
// bar (curvedFronts), which changes labor + material, not the footprint.
//
// All geometry is computed in INCHES. Overall length/width come in as
// feet from the UI and are converted at the boundary.

import { fmt } from "../partSvg";

export type BarShape = "rect" | "radius" | "hex" | "round" | "oval";

export const BAR_SHAPES: { value: BarShape; label: string }[] = [
  { value: "rect", label: "Square / rect" },
  { value: "radius", label: "Curved corners" },
  { value: "hex", label: "Hexagon" },
  { value: "round", label: "Round" },
  { value: "oval", label: "Oval" },
];

export interface BarSpec {
  shape: BarShape;
  lengthFt: number; // overall length (round: diameter)
  widthFt: number; // overall depth (oval: cap diameter; round: ignored)
  cornerRadiusIn: number; // radius shape only
  barHeightIn: number; // finished height, floor to top of counter
  topThicknessIn: number;
  topOverhangIn: number; // counter overhang past the face (patron side)
  topDepthIn: number; // front-to-back width of the counter band
  maxPanelIn: number; // max face panel width before it splits
  curvedFronts: boolean; // true curved build for arced runs
  // editable rates
  sheetPrice: number; // $ per 4x8 sheet good
  topPricePerSqft: number; // $ per sqft of finished top
  laborRate: number; // $ per hour
}

export const BAR_DEFAULTS: BarSpec = {
  shape: "rect",
  lengthFt: 8,
  widthFt: 4,
  cornerRadiusIn: 6,
  barHeightIn: 42,
  topThicknessIn: 1.5,
  topOverhangIn: 1.5,
  topDepthIn: 16,
  maxPanelIn: 48,
  curvedFronts: false,
  sheetPrice: 65,
  topPricePerSqft: 22,
  laborRate: 65,
};

// --- construction / pricing constants -----------------------------------
const WASTE = 0.15; // sheet-good waste factor
const SHEET_SQFT = 32; // usable 4x8
const FRAMING_PER_FT = 4; // $ framing lumber per linear ft of perimeter
const HARDWARE_FLAT = 60;
const HARDWARE_PER_FT = 6;
const HOURS_BASE = 6;
const HOURS_PER_PANEL = 1.25;
const HOURS_PER_FT_TOP = 0.35;
const CURVED_LABOR_MULT = 1.7; // extra fab time on curved panels
const CURVED_MATERIAL_PER_PANEL = 25; // cooper/kerf stock per curved panel

const round16 = (v: number): number => Math.round(v * 16) / 16;

interface Run {
  kind: "straight" | "arc";
  len: number; // straight length OR arc length
  r?: number;
  angle?: number; // radians (arc)
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
  outline: string; // SVG path (plan)
  bboxW: number;
  bboxH: number;
  perimeterIn: number;
  perimeterFt: number;
  bodyHeightIn: number;
  panelCount: number;
  facetCount: number;
  panels: CutItem[]; // grouped face panels
  tops: CutItem[]; // grouped top blanks
  panelRects: { w: number; h: number }[]; // ungrouped, for DXF nesting
  faceAreaSqft: number;
  topAreaSqft: number;
  sheetsFace: number;
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

function shapeGeometry(spec: BarSpec): {
  outline: string;
  bboxW: number;
  bboxH: number;
  runs: Run[];
  notes: string[];
} | { error: string } {
  const L = spec.lengthFt * 12;
  const W = spec.widthFt * 12;
  const notes: string[] = [];

  switch (spec.shape) {
    case "rect": {
      const outline = `M 0 0 L ${fmt(L)} 0 L ${fmt(L)} ${fmt(W)} L 0 ${fmt(W)} Z`;
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
        notes,
      };
    }
    case "hex": {
      const e = Math.min(W / 2, L / 3); // end taper
      const A: [number, number] = [e, 0];
      const B: [number, number] = [L - e, 0];
      const C: [number, number] = [L, W / 2];
      const D: [number, number] = [L - e, W];
      const E: [number, number] = [e, W];
      const F: [number, number] = [0, W / 2];
      const outline =
        `M ${fmt(A[0])} ${fmt(A[1])} L ${fmt(B[0])} ${fmt(B[1])} ` +
        `L ${fmt(C[0])} ${fmt(C[1])} L ${fmt(D[0])} ${fmt(D[1])} ` +
        `L ${fmt(E[0])} ${fmt(E[1])} L ${fmt(F[0])} ${fmt(F[1])} Z`;
      const diag = Math.sqrt(e * e + (W / 2) * (W / 2));
      return {
        outline,
        bboxW: L,
        bboxH: W,
        runs: [
          { kind: "straight", len: L - 2 * e }, // top
          { kind: "straight", len: diag },
          { kind: "straight", len: diag },
          { kind: "straight", len: L - 2 * e }, // bottom
          { kind: "straight", len: diag },
          { kind: "straight", len: diag },
        ],
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
        notes,
      };
    }
  }
}

interface RawPanel {
  w: number;
  h: number;
  kind: "straight" | "facet" | "curved";
}

function panelize(runs: Run[], spec: BarSpec, bodyH: number): RawPanel[] {
  const panels: RawPanel[] = [];
  const isRound = spec.shape === "round";
  for (const run of runs) {
    if (run.kind === "straight") {
      const n = Math.max(1, Math.ceil(run.len / spec.maxPanelIn));
      const w = run.len / n;
      for (let i = 0; i < n; i++) panels.push({ w, h: bodyH, kind: "straight" });
    } else {
      const r = run.r ?? 0;
      const angle = run.angle ?? 0;
      const minFacets = isRound ? 8 : 3;
      let n = Math.max(minFacets, Math.ceil(run.len / spec.maxPanelIn));
      n = Math.min(n, 60);
      if (spec.curvedFronts) {
        // developed length along the curve per segment
        const w = run.len / n;
        for (let i = 0; i < n; i++) panels.push({ w, h: bodyH, kind: "curved" });
      } else {
        // flat chord facets
        const w = 2 * r * Math.sin(angle / (2 * n));
        for (let i = 0; i < n; i++) panels.push({ w, h: bodyH, kind: "facet" });
      }
    }
  }
  return panels;
}

function group(items: RawPanel[], prefix: string): { grouped: CutItem[] } {
  const map = new Map<string, CutItem>();
  const order: string[] = [];
  for (const p of items) {
    const w = round16(p.w);
    const h = round16(p.h);
    const key = `${p.kind}|${w}|${h}`;
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
        note:
          p.kind === "facet"
            ? "Bevel both vertical edges"
            : p.kind === "curved"
              ? "Curved / coopered face"
              : undefined,
      });
      order.push(key);
    }
  }
  const grouped = order.map((k, i) => {
    const it = map.get(k)!;
    it.label = `${prefix}${i + 1}`;
    return it;
  });
  return { grouped };
}

export function solveBar(spec: BarSpec): BarSolve {
  const geo = shapeGeometry(spec);
  const bodyHeightIn = Math.max(1, spec.barHeightIn - spec.topThicknessIn);

  if ("error" in geo) {
    return {
      outline: "",
      bboxW: 0,
      bboxH: 0,
      perimeterIn: 0,
      perimeterFt: 0,
      bodyHeightIn,
      panelCount: 0,
      facetCount: 0,
      panels: [],
      tops: [],
      panelRects: [],
      faceAreaSqft: 0,
      topAreaSqft: 0,
      sheetsFace: 0,
      price: {
        lines: [],
        materials: 0,
        labor: 0,
        laborHours: 0,
        total: 0,
        perFt: 0,
      },
      notes: [],
      error: geo.error,
    };
  }

  const perimeterIn = geo.runs.reduce((s, r) => s + r.len, 0);
  const perimeterFt = perimeterIn / 12;

  const raw = panelize(geo.runs, spec, bodyHeightIn);
  const panelCount = raw.length;
  const facetCount = raw.filter((p) => p.kind !== "straight").length;

  // Top blanks: one over each face panel, width = panel + joint, depth =
  // top band. Overhang is carried in the band depth for material purposes.
  const topRaw: RawPanel[] = raw.map((p) => ({
    w: p.w,
    h: spec.topDepthIn,
    kind: "straight",
  }));

  const { grouped: panels } = group(raw, "P");
  const { grouped: tops } = group(topRaw, "T");

  const faceAreaSqft =
    raw.reduce((s, p) => s + p.w * p.h, 0) / 144;
  const topAreaSqft = (perimeterIn * spec.topDepthIn) / 144;
  const sheetsFace = Math.ceil((faceAreaSqft * (1 + WASTE)) / SHEET_SQFT);

  // --- pricing ----------------------------------------------------------
  const curvedCount = raw.filter((p) => p.kind === "curved").length;
  const shapeExtraHours =
    spec.shape === "round" || spec.shape === "oval"
      ? 4
      : spec.shape === "hex" || spec.shape === "radius"
        ? 2
        : 0;

  const sheetCost = sheetsFace * spec.sheetPrice;
  const framingCost = perimeterFt * FRAMING_PER_FT;
  const topCost = topAreaSqft * spec.topPricePerSqft;
  const curvedMaterialCost = curvedCount * CURVED_MATERIAL_PER_PANEL;
  const hardwareCost = HARDWARE_FLAT + perimeterFt * HARDWARE_PER_FT;

  const straightPanels = panelCount - curvedCount;
  const laborHours =
    HOURS_BASE +
    straightPanels * HOURS_PER_PANEL +
    curvedCount * HOURS_PER_PANEL * CURVED_LABOR_MULT +
    perimeterFt * HOURS_PER_FT_TOP +
    shapeExtraHours;
  const laborCost = laborHours * spec.laborRate;

  const lines: PriceLine[] = [
    {
      label: "Carcass / face sheet goods",
      detail: `${sheetsFace} sheet${sheetsFace === 1 ? "" : "s"} @ $${spec.sheetPrice} (${faceAreaSqft.toFixed(1)} sqft +${Math.round(WASTE * 100)}% waste)`,
      amount: sheetCost,
    },
    {
      label: "Framing lumber",
      detail: `${perimeterFt.toFixed(1)} lf @ $${FRAMING_PER_FT}/lf`,
      amount: framingCost,
    },
    {
      label: "Counter / top material",
      detail: `${topAreaSqft.toFixed(1)} sqft @ $${spec.topPricePerSqft}/sqft`,
      amount: topCost,
    },
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
      detail: `$${HARDWARE_FLAT} + ${perimeterFt.toFixed(1)} lf @ $${HARDWARE_PER_FT}/lf`,
      amount: hardwareCost,
    },
    {
      label: "Labor",
      detail: `${laborHours.toFixed(1)} hrs @ $${spec.laborRate}/hr`,
      amount: laborCost,
    },
  ];

  const materials =
    sheetCost + framingCost + topCost + curvedMaterialCost + hardwareCost;
  const labor = laborCost;
  const total = materials + labor;

  return {
    outline: geo.outline,
    bboxW: geo.bboxW,
    bboxH: geo.bboxH,
    perimeterIn,
    perimeterFt,
    bodyHeightIn,
    panelCount,
    facetCount,
    panels,
    tops,
    panelRects: raw.map((p) => ({ w: round16(p.w), h: round16(p.h) })),
    faceAreaSqft,
    topAreaSqft,
    sheetsFace,
    price: {
      lines,
      materials,
      labor,
      laborHours,
      total,
      perFt: perimeterFt > 0 ? total / perimeterFt : 0,
    },
    notes: geo.notes,
  };
}

// Lay every unique face panel out in a row as rectangles for a single
// cut-sheet DXF/SVG. Uses grouped panels (one rect per unique size, with
// the qty in its label).
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
