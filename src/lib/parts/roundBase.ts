import { fmt } from "../partSvg";
import type { PartGenerator, PathEntry } from "./types";

const NEST = 1;
const TAU = Math.PI * 2;

// A closed circle drawn as two 180° arcs. Two arcs (rather than one big
// arc + one degenerate line) keeps the path portable to CAM importers
// that reject empty segments.
const circlePath = (cx: number, cy: number, r: number): string =>
  `M ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cx - r)} ${fmt(cy)} ` +
  `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cx + r)} ${fmt(cy)} Z`;

function facetGeom(apothem: number, n: number): { R: number; half: number } {
  return {
    R: apothem / Math.cos(Math.PI / n),
    half: apothem * Math.tan(Math.PI / n),
  };
}

type Notch = { w: number; d: number };

function polygonPts(apothem: number, n: number, notch: Notch | null): [number, number][] {
  const { half } = facetGeom(apothem, n);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const th = (i * TAU) / n - Math.PI / 2;
    const nx = Math.cos(th),
      ny = Math.sin(th);
    const tx = -ny,
      ty = nx;
    const C: [number, number] = [apothem * nx, apothem * ny];
    const at = (along: number, inward: number): [number, number] => [
      C[0] + along * tx - inward * nx,
      C[1] + along * ty - inward * ny,
    ];
    pts.push(at(-half, 0));
    if (notch) {
      pts.push(at(-notch.w / 2, 0));
      pts.push(at(-notch.w / 2, notch.d));
      pts.push(at(notch.w / 2, notch.d));
      pts.push(at(notch.w / 2, 0));
    }
    pts.push(at(half, 0));
  }
  return pts;
}

interface Bbox {
  minX: number;
  minY: number;
  w: number;
  h: number;
}

function bbox(pts: [number, number][]): Bbox {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

const toPath = (pts: [number, number][], dx: number, dy: number): string =>
  "M " + pts.map((p) => `${fmt(p[0] + dx)} ${fmt(p[1] + dy)}`).join(" L ") + " Z";

const roundBase: PartGenerator = {
  id: "round-base",
  // v1 shipped with an incorrect gap formula (missing cos(pi/n) factor on
  // part width). v2 fixes it — parts land on polygon facets, so the true
  // corner-to-corner clear distance is 2a*sin(pi/n) - w*cos(pi/n). Any
  // v1 rows carry a wrong gap figure and should be reviewed rather than
  // silently re-solved. Do not decrement without re-verifying.
  version: 2,
  category: "Round bases",
  label: "Round base with parts",
  blurb:
    "Vertical parts distributed around a straight or tapered base. Emits both rings with bores plus one part profile.",
  defaults: {
    bottomDia: 20,
    topDia: 10,
    baseHeight: 28,
    count: 5,
    partWidth: 2,
    partThickness: 0.75,
    ringWidth: 2.5,
    ringThickness: 0.75,
    dadoDepth: 0.25,
    mount: "outside",
  },
  fields: [
    { key: "bottomDia", label: "Bottom ring diameter", min: 2, max: 72, step: 0.25 },
    { key: "topDia", label: "Top ring diameter", min: 1, max: 72, step: 0.25 },
    { key: "baseHeight", label: "Base height, overall", min: 2, max: 60, step: 0.25 },
    { key: "count", label: "Number of parts", min: 2, max: 48, step: 1 },
    { key: "partWidth", label: "Part width", min: 0.125, max: 12, step: 0.0625 },
    { key: "partThickness", label: "Part thickness", min: 0.0625, max: 4, step: 0.0625 },
    { key: "ringWidth", label: "Ring width, radial", min: 0.25, max: 12, step: 0.125 },
    { key: "ringThickness", label: "Ring stock thickness", min: 0.125, max: 4, step: 0.0625 },
    { key: "dadoDepth", label: "Dado depth", min: 0, max: 3, step: 0.0625 },
    {
      key: "mount",
      label: "How parts meet the ring",
      type: "choice",
      options: [
        { value: "outside", label: "Outside" },
        { value: "under", label: "Under" },
        { value: "dado", label: "Dadoed" },
      ],
    },
  ],

  solve(spec) {
    const baseHeight = spec.baseHeight as number;
    const w = spec.partWidth as number;
    const partThickness = spec.partThickness as number;
    const ringWidth = spec.ringWidth as number;
    const ringThickness = spec.ringThickness as number;
    const mount = spec.mount as string;
    const bottomDia = spec.bottomDia as number;
    const topDia = Math.min(spec.topDia as number, bottomDia);
    const n = Math.max(2, Math.round(spec.count as number));
    const dado = mount === "dado" ? (spec.dadoDepth as number) : 0;

    const Rb = bottomDia / 2;
    const Rt = topDia / 2;
    const run = baseHeight - 2 * ringThickness;

    if (run <= 0)
      return {
        error:
          "Ring thickness consumes the whole base height. Raise the height or thin the rings.",
      };
    if (ringWidth >= Rt)
      return {
        error: `Ring width ${ringWidth}" is too wide for the ${topDia}" top ring. Maximum is ${(
          Rt - 0.0625
        ).toFixed(3)}".`,
      };
    if (mount === "dado" && dado >= ringWidth)
      return { error: "Dado depth must be less than the ring width." };

    const lean = Math.atan2(Rb - Rt, run);
    const leanDeg = (lean * 180) / Math.PI;
    const partLength = Math.hypot(run, Rb - Rt);

    // seat radius (where the part back sits) depends on how it mounts.
    const seat = (R: number): number =>
      mount === "outside"
        ? R
        : mount === "dado"
        ? R - dado
        : R - ringWidth / 2;
    const gapAt = (R: number): number =>
      2 * seat(R) * Math.sin(Math.PI / n) - w * Math.cos(Math.PI / n);

    const gapB = gapAt(Rb);
    const gapT = gapAt(Rt);
    const facetT = Rt * Math.tan(Math.PI / n) * 2;

    if (gapT < 0)
      return {
        error: `Parts collide at the top. Clear gap is ${gapT.toFixed(
          3
        )}". Reduce the count, narrow the part, or widen the top ring.`,
      };
    if (mount !== "under" && w > facetT)
      return {
        error: `Part is ${w}" wide but the top ring facet is only ${facetT.toFixed(
          3
        )}". Reduce the count or the part width.`,
      };

    const faceted = mount !== "under";
    const notch: Notch | null = mount === "dado" ? { w, d: dado } : null;

    const paths: PathEntry[] = [];
    let x = 0;
    let maxH = 0;

    for (const [R, tag] of [
      [Rb, "bottom"],
      [Rt, "top"],
    ] as [number, string][]) {
      const bore = R - ringWidth;
      if (faceted) {
        const pts = polygonPts(R, n, notch);
        const bb = bbox(pts);
        const dx = x - bb.minX;
        const dy = -bb.minY;
        paths.push({ d: toPath(pts, dx, dy), role: `ring-${tag}` });
        paths.push({ d: circlePath(dx, dy, bore), role: `ring-${tag}-bore` });
        x += bb.w + NEST;
        maxH = Math.max(maxH, bb.h);
      } else {
        paths.push({ d: circlePath(x + R, R, R), role: `ring-${tag}` });
        paths.push({ d: circlePath(x + R, R, bore), role: `ring-${tag}-bore` });
        x += 2 * R + NEST;
        maxH = Math.max(maxH, 2 * R);
      }
    }

    const wb = w;
    const wt = w;
    const cx = x + wb / 2;
    // Both ends bevel at the lean angle in the SAME direction — the part
    // is a parallelogram in side view, not a trapezoid.
    paths.push({
      d:
        `M ${fmt(cx - wt / 2)} 0 L ${fmt(cx + wt / 2)} 0 ` +
        `L ${fmt(cx + wb / 2)} ${fmt(partLength)} L ${fmt(cx - wb / 2)} ${fmt(
          partLength
        )} Z`,
      role: "part",
    });

    const finishedOD =
      mount === "outside"
        ? bottomDia + 2 * partThickness
        : mount === "dado"
        ? bottomDia + 2 * (partThickness - dado)
        : bottomDia;

    const notes: string[] = [
      `Cut ${n} parts from this profile, ${partLength.toFixed(3)}" long.`,
      `Both part ends bevel at ${leanDeg.toFixed(
        2
      )}°, same direction — the part is a parallelogram in side view, not a trapezoid.`,
    ];
    if (faceted && leanDeg > 0.05)
      notes.push(
        `Ring facets need the same ${leanDeg.toFixed(
          2
        )}° bevel so the part face sits flush.`
      );
    if (mount === "under")
      notes.push("Rings are plain circles — no facets needed for this mount.");
    if (mount === "dado")
      notes.push(
        `Dados are ${w}" wide by ${dado}" deep, cut into each facet. Add fit allowance yourself if you want a slip fit.`
      );
    if (gapT < 0.25)
      notes.push(
        `Only ${gapT.toFixed(3)}" of clearance at the top. Tight for glue-up.`
      );
    if (Math.abs(gapB - gapT) > 0.001)
      notes.push(
        `Gap opens ${(gapB - gapT).toFixed(
          3
        )}" wider at the bottom. Taper the part if you want them to match.`
      );
    notes.push(
      "Ring segmentation is not handled yet — these profiles are whole rings."
    );

    return {
      paths,
      width: x + wb,
      height: Math.max(maxH, partLength),
      filename: `round-base-${bottomDia}x${topDia}-${n}up-${mount}`,
      stats: [
        { label: "Index angle", value: `${(360 / n).toFixed(2)}°` },
        { label: "Lean angle", value: `${leanDeg.toFixed(2)}°` },
        { label: "Gap bottom", value: `${gapB.toFixed(3)}"` },
        { label: "Gap top", value: `${gapT.toFixed(3)}"` },
        { label: "Part run", value: `${run.toFixed(3)}"` },
        { label: "Part length", value: `${partLength.toFixed(3)}"` },
        { label: "Finished OD", value: `${finishedOD.toFixed(3)}"` },
        { label: "Ring bore", value: `${(2 * (Rb - ringWidth)).toFixed(3)}"` },
      ],
      notes,
    };
  },
};

export default roundBase;
