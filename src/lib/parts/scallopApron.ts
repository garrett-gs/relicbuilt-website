import { fmt, sagitta } from "../partSvg";
import type { PartGenerator } from "./types";

const scallopApron: PartGenerator = {
  id: "scallop-apron",
  label: "Scalloped apron",
  blurb: "Evenly distributed scallop or wave along the bottom edge.",
  defaults: {
    width: 48,
    height: 6,
    ear: 2,
    target: 5,
    depth: 1.5,
    mode: "scallop",
  },
  fields: [
    { key: "width", label: "Apron width", min: 6, max: 120, step: 0.25 },
    { key: "height", label: "Apron height", min: 1, max: 24, step: 0.25 },
    { key: "ear", label: "Flat ear, each end", min: 0, max: 12, step: 0.25 },
    { key: "target", label: "Target scallop width", min: 1, max: 24, step: 0.25 },
    { key: "depth", label: "Scallop depth", min: 0.125, max: 12, step: 0.125 },
    {
      key: "mode",
      label: "Edge style",
      type: "choice",
      options: [
        { value: "scallop", label: "Scallop" },
        { value: "wave", label: "Wave" },
      ],
    },
  ],

  solve(spec, ctx = {}) {
    const width = spec.width as number;
    const height = spec.height as number;
    const ear = spec.ear as number;
    const target = spec.target as number;
    const depth = spec.depth as number;
    const mode = spec.mode as string;
    const bit = ctx.bitDiameter ?? 0.25;
    const span = width - 2 * ear;

    if (span <= 0.5)
      return { error: "Ears consume the whole apron. Reduce ear length." };
    if (depth <= 0) return { error: "Depth must be greater than zero." };

    const count = Math.max(1, Math.round(span / target));
    const scallop = span / count;
    const radius = sagitta(scallop, depth);
    const sweep = (4 * Math.atan((2 * depth) / scallop) * 180) / Math.PI;
    const largeArc = depth > scallop / 2 ? 1 : 0;
    const blankHeight = height + (mode === "wave" ? depth : 0);

    const seg: string[] = [
      "M 0 0",
      `L ${fmt(width)} 0`,
      `L ${fmt(width)} ${fmt(height)}`,
      `L ${fmt(width - ear)} ${fmt(height)}`,
    ];
    for (let i = 0; i < count; i++) {
      const x = width - ear - (i + 1) * scallop;
      const flag = mode === "wave" && i % 2 === 1 ? 1 : 0;
      seg.push(
        `A ${fmt(radius)} ${fmt(radius)} 0 ${largeArc} ${flag} ${fmt(x)} ${fmt(height)}`
      );
    }
    seg.push(`L 0 ${fmt(height)}`, "Z");

    const rail = height - (mode === "wave" ? 2 : 1) * depth;
    const notes: string[] = [];
    if (rail < 0.75)
      notes.push(
        `Only ${rail.toFixed(2)}" of solid rail above the cut. Reduce depth or raise the apron.`
      );
    if (mode === "scallop" && count > 1)
      notes.push(
        `${count - 1} inside cusps will carry a ${(bit / 2).toFixed(3)}" radius from a ${bit.toFixed(3)}" bit.`
      );

    return {
      path: seg.join(" "),
      width,
      height: blankHeight,
      filename: `scallop-apron-${width}x${height}`,
      stats: [
        { label: "Scallops", value: count },
        { label: "Each width", value: `${scallop.toFixed(4)}"` },
        { label: "Arc radius", value: `${radius.toFixed(4)}"` },
        { label: "Sweep", value: `${Math.round(sweep)}°` },
      ],
      notes,
    };
  },
};

export default scallopApron;
