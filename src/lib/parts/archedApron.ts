import { fmt, sagitta } from "../partSvg";
import type { PartGenerator } from "./types";

const archedApron: PartGenerator = {
  id: "arched-apron",
  label: "Arched apron",
  blurb: "Single sprung arc between two flat ears.",
  defaults: { width: 48, height: 6, ear: 3, rise: 1.75 },
  fields: [
    { key: "width", label: "Apron width", min: 6, max: 120, step: 0.25 },
    { key: "height", label: "Apron height", min: 1, max: 24, step: 0.25 },
    { key: "ear", label: "Flat ear, each end", min: 0, max: 24, step: 0.25 },
    { key: "rise", label: "Arch rise", min: 0.125, max: 12, step: 0.125 },
  ],

  solve(spec) {
    const width = spec.width as number;
    const height = spec.height as number;
    const ear = spec.ear as number;
    const rise = spec.rise as number;
    const span = width - 2 * ear;
    if (span <= 0.5)
      return { error: "Ears consume the whole apron. Reduce ear length." };
    if (rise >= height - 0.5)
      return { error: "Rise leaves no rail. Reduce rise or raise the apron." };

    const radius = sagitta(span, rise);
    const sweep = (4 * Math.atan((2 * rise) / span) * 180) / Math.PI;
    const largeArc = rise > span / 2 ? 1 : 0;

    const path = [
      "M 0 0",
      `L ${fmt(width)} 0`,
      `L ${fmt(width)} ${fmt(height)}`,
      `L ${fmt(width - ear)} ${fmt(height)}`,
      `A ${fmt(radius)} ${fmt(radius)} 0 ${largeArc} 0 ${fmt(ear)} ${fmt(height)}`,
      `L 0 ${fmt(height)}`,
      "Z",
    ].join(" ");

    return {
      path,
      width,
      height,
      filename: `arched-apron-${width}x${height}`,
      stats: [
        { label: "Span", value: `${span.toFixed(3)}"` },
        { label: "Arc radius", value: `${radius.toFixed(4)}"` },
        { label: "Sweep", value: `${Math.round(sweep)}°` },
        { label: "Rail left", value: `${(height - rise).toFixed(3)}"` },
      ],
      notes: [],
    };
  },
};

export default archedApron;
