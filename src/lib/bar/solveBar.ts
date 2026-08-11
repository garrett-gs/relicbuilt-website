// Bar designer engine. Takes a shape + overall size + your standard
// construction and produces: a plan-view outline, a panelized front-body
// cut list, counter/top blanks, and an itemized materials + labor price.
//
// The standard section is a TWO-TIER bar:
//   - Patron / service side: 42" service-rail height. The front face
//     panels (the "die") are built to this height.
//   - Bartender side: 30" working surface, stepped down ~12" behind the
//     service rail.
//   - Service rail top: wood countertop, 1-1/2" thick, overhanging the
//     patron side 10" with a 1-1/2" nosing/lip. A light rail tucks up
//     under the top behind the nosing, so the face is set down 1" for
//     clearance. The top can be coated (none / paint / epoxy / concrete).
//   - Faces: 3/4" birch ply (11/16" actual). Framing: poplar.
//   - 36" bartender access opening in the back run.
//
// Geometry is in INCHES. Overall length/width come in as feet.

import { fmt } from "../partSvg";

export type BarShape = "rect" | "radius" | "hex" | "round" | "oval";
export type Coating = "none" | "paint" | "epoxy" | "concrete";

export const BAR_SHAPES: { value: BarShape; label: string }[] = [
  { value: "rect", label: "Square / rect" },
  { value: "radius", label: "Curved corners" },
  { value: "hex", label: "Hexagon" },
  { value: "round", label: "Round" },
  { value: "oval", label: "Oval" },
];

export const COATINGS: { value: Coating; label: string; perSqft: number }[] = [
  { value: "none", label: "Bare wood", perSqft: 0 },
  { value: "paint", label: "Paint", perSqft: 3 },
  { value: "epoxy", label: "Epoxy", perSqft: 12 },
  { value: "concrete", label: "Concrete", perSqft: 18 },
];

export interface BarSpec {
  shape: BarShape;
  lengthFt: number; // overall length (round: diameter)
  widthFt: number; // overall footprint depth (oval: cap dia; round: ignored)
  cornerRadiusIn: number; // radius shape only
  serviceHeightIn: number; // patron-side service rail height (drives face)
  workingHeightIn: number; // bartender-side working surface height
  topThicknessIn: number; // wood countertop thickness
  nosingIn: number; // front lip / nosing drop
  overhangIn: number; // service-rail overhang toward the patron
  topDepthIn: number; // countertop depth over the die (behind the overhang)
  workingTopDepthIn: number; // bartender work-counter depth
  coating: Coating;
  maxPanelIn: number; // max face panel width before it splits
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
  widthFt: 2, // 24" standard footprint depth
  cornerRadiusIn: 6,
  serviceHeightIn: 42,
  workingHeightIn: 30,
  topThicknessIn: 1.5,
  nosingIn: 1.5,
  overhangIn: 10,
  topDepthIn: 14,
  workingTopDepthIn: 12,
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
const HOURS_BASE = 8; // two-tier build base
const HOURS_PER_PANEL = 1.25;
const HOURS_PER_FT_TOP = 0.35; // service rail top
const HOURS_PER_FT_WORKING = 0.4; // stepped work counter
const CURVED_LABOR_MULT = 1.7;
const CURVED_MATERIAL_PER_PANEL = 25;

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
  bboxW: number;
  bboxH: number;
  perimeterIn: number;
  perimeterFt: number;
  builtFaceIn: number;
  builtFaceFt: number;
  faceHeightIn: number; // front die face panel height
  stepDownIn: number; // service height - working height
  panelCount: number;
  facetCount: number;
  panels: CutItem[];
  tops: CutItem[];
  faceAreaSqft: number;
  serviceTopSqft: number;
  workingTopSqft: number;
  sheetsFace: number;
  gap: { active: boolean; widthIn: number; cx: number; cy: number };
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
}

function panelizeStraight(len: number, maxPanel: number, bodyH: number, out: RawPanel[]) {
  if (len < 0.5) return;
  const n = Math.max(1, Math.ceil(len / maxPanel));
  const w = len / n;
  for (let i = 0; i < n; i++) out.push({ w, h: bodyH, kind: "straight" });
}

function panelizeArc(
  r: number,
  angle: number,
  len: number,
  spec: BarSpec,
  bodyH: number,
  minFacets: number,
  out: RawPanel[]
) {
  if (len < 0.5 || angle <= 0) return;
  let n = Math.max(minFacets, Math.ceil(len / spec.maxPanelIn));
  n = Math.min(n, 60);
  if (spec.curvedFronts) {
    const w = len / n;
    for (let i = 0; i < n; i++) out.push({ w, h: bodyH, kind: "curved" });
  } else {
    const w = 2 * r * Math.sin(angle / (2 * n));
    for (let i = 0; i < n; i++) out.push({ w, h: bodyH, kind: "facet" });
  }
}

function panelize(
  runs: Run[],
  accessRunIndex: number,
  spec: BarSpec,
  bodyH: number
): { panels: RawPanel[]; gapApplied: boolean; gapNote?: string } {
  const panels: RawPanel[] = [];
  const isRound = spec.shape === "round";
  const gapW = spec.accessGap ? spec.accessGapIn : 0;
  let gapApplied = false;
  let gapNote: string | undefined;

  runs.forEach((run, i) => {
    const isAccess = spec.accessGap && i === accessRunIndex && gapW > 0;
    if (run.kind === "straight") {
      if (isAccess) {
        if (run.len > gapW + 6) {
          const half = (run.len - gapW) / 2;
          panelizeStraight(half, spec.maxPanelIn, bodyH, panels);
          panelizeStraight(half, spec.maxPanelIn, bodyH, panels);
          gapApplied = true;
        } else {
          gapApplied = true;
          gapNote = "Access opening spans the entire back run.";
        }
      } else {
        panelizeStraight(run.len, spec.maxPanelIn, bodyH, panels);
      }
    } else {
      const r = run.r ?? 0;
      const angle = run.angle ?? 0;
      const minFacets = isRound ? 8 : 3;
      if (isAccess && r > 0) {
        const gapAngle = 2 * Math.asin(Math.min(0.999, gapW / (2 * r)));
        const remain = Math.max(0, angle - gapAngle);
        panelizeArc(r, remain, r * remain, spec, bodyH, minFacets, panels);
        gapApplied = true;
      } else {
        panelizeArc(r, angle, run.len, spec, bodyH, minFacets, panels);
      }
    }
  });

  return { panels, gapApplied, gapNote };
}

function group(items: RawPanel[], prefix: string): CutItem[] {
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
  return order.map((k, i) => {
    const it = map.get(k)!;
    it.label = `${prefix}${i + 1}`;
    return it;
  });
}

const emptySolve = (error: string, faceHeightIn: number): BarSolve => ({
  outline: "",
  bboxW: 0,
  bboxH: 0,
  perimeterIn: 0,
  perimeterFt: 0,
  builtFaceIn: 0,
  builtFaceFt: 0,
  faceHeightIn,
  stepDownIn: 0,
  panelCount: 0,
  facetCount: 0,
  panels: [],
  tops: [],
  faceAreaSqft: 0,
  serviceTopSqft: 0,
  workingTopSqft: 0,
  sheetsFace: 0,
  gap: { active: false, widthIn: 0, cx: 0, cy: 0 },
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
  const stepDownIn = Math.max(0, spec.serviceHeightIn - spec.workingHeightIn);

  const geo = shapeGeometry(spec);
  if ("error" in geo) return emptySolve(geo.error, faceHeightIn);

  const perimeterIn = geo.runs.reduce((s, r) => s + r.len, 0);
  const perimeterFt = perimeterIn / 12;

  const { panels: raw, gapApplied, gapNote } = panelize(
    geo.runs,
    geo.accessRunIndex,
    spec,
    faceHeightIn
  );
  const panelCount = raw.length;
  const facetCount = raw.filter((p) => p.kind !== "straight").length;

  const builtFaceIn = raw.reduce((s, p) => s + p.w, 0);
  const builtFaceFt = builtFaceIn / 12;

  // Service-rail top segments: one blank over each face panel, depth =
  // countertop over the die + patron overhang.
  const serviceTopWidthIn = spec.topDepthIn + spec.overhangIn;
  const topRaw: RawPanel[] = raw.map((p) => ({
    w: p.w,
    h: serviceTopWidthIn,
    kind: "straight",
  }));

  const panels = group(raw, "P");
  const tops = group(topRaw, "T");

  const faceAreaSqft = raw.reduce((s, p) => s + p.w * p.h, 0) / 144;
  const serviceTopSqft = (builtFaceIn * serviceTopWidthIn) / 144;
  const workingTopSqft = (builtFaceIn * spec.workingTopDepthIn) / 144;
  const totalTopSqft = serviceTopSqft + workingTopSqft;
  const sheetsFace = Math.ceil((faceAreaSqft * (1 + WASTE)) / SHEET_SQFT);

  // --- pricing ----------------------------------------------------------
  const curvedCount = raw.filter((p) => p.kind === "curved").length;
  const straightPanels = panelCount - curvedCount;
  const shapeExtraHours =
    spec.shape === "round" || spec.shape === "oval"
      ? 4
      : spec.shape === "hex" || spec.shape === "radius"
        ? 2
        : 0;

  const coating = COATINGS.find((c) => c.value === spec.coating) ?? COATINGS[0];

  const sheetCost = sheetsFace * spec.sheetPrice;
  const framingCost = builtFaceFt * FRAMING_PER_FT;
  const topCost = totalTopSqft * spec.topPricePerSqft;
  const coatingCost = totalTopSqft * coating.perSqft;
  const nosingCost = builtFaceFt * NOSING_PER_FT;
  const lightRailCost = spec.lightRail ? builtFaceFt * LIGHT_RAIL_PER_FT : 0;
  const curvedMaterialCost = curvedCount * CURVED_MATERIAL_PER_PANEL;
  const hardwareCost = HARDWARE_FLAT + builtFaceFt * HARDWARE_PER_FT;

  const laborHours =
    HOURS_BASE +
    straightPanels * HOURS_PER_PANEL +
    curvedCount * HOURS_PER_PANEL * CURVED_LABOR_MULT +
    builtFaceFt * HOURS_PER_FT_TOP +
    builtFaceFt * HOURS_PER_FT_WORKING +
    shapeExtraHours;
  const laborCost = laborHours * spec.laborRate;

  const lines: PriceLine[] = [
    {
      label: "Birch ply faces",
      detail: `${sheetsFace} sheet${sheetsFace === 1 ? "" : "s"} @ $${spec.sheetPrice} (${faceAreaSqft.toFixed(1)} sqft +${Math.round(WASTE * 100)}% waste)`,
      amount: sheetCost,
    },
    {
      label: "Poplar framing",
      detail: `${builtFaceFt.toFixed(1)} lf @ $${FRAMING_PER_FT}/lf`,
      amount: framingCost,
    },
    {
      label: "Wood countertop",
      detail: `${totalTopSqft.toFixed(1)} sqft (service ${serviceTopSqft.toFixed(1)} + working ${workingTopSqft.toFixed(1)}) @ $${spec.topPricePerSqft}/sqft`,
      amount: topCost,
    },
    ...(coatingCost > 0
      ? [
          {
            label: `Top finish — ${coating.label.toLowerCase()}`,
            detail: `${totalTopSqft.toFixed(1)} sqft @ $${coating.perSqft}/sqft`,
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
    `Two-tier: ${spec.serviceHeightIn}″ service rail over ${spec.workingHeightIn}″ working surface (${stepDownIn}″ step-down).`
  );
  notes.push(
    `Faces: ${PANEL_MATERIAL} @ ${faceHeightIn.toFixed(1)}″ tall. Framing: ${FRAMING_MATERIAL}. Footprint depth ${spec.widthFt * 12}″.`
  );
  notes.push(
    `Service rail: ${spec.overhangIn}″ overhang, ${spec.nosingIn}″ nosing/lip, ${spec.topThicknessIn}″ ${coating.label.toLowerCase()} wood top.`
  );
  if (spec.lightRail)
    notes.push(
      `Light rail tucked under the lip — face set down ${spec.lightRailClearanceIn}″ for clearance.`
    );
  if (gapApplied)
    notes.push(gapNote ?? `${spec.accessGapIn}″ bartender access opening in the back run.`);

  return {
    outline: geo.outline,
    bboxW: geo.bboxW,
    bboxH: geo.bboxH,
    perimeterIn,
    perimeterFt,
    builtFaceIn,
    builtFaceFt,
    faceHeightIn,
    stepDownIn,
    panelCount,
    facetCount,
    panels,
    tops,
    faceAreaSqft,
    serviceTopSqft,
    workingTopSqft,
    sheetsFace,
    gap: {
      active: gapApplied && spec.accessGap,
      widthIn: spec.accessGapIn,
      cx: geo.bboxW / 2,
      cy: geo.bboxH,
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
