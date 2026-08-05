import { fmt } from "../partSvg";
import type { PartGenerator } from "./types";

// Obround / stadium / pill: rectangle with a semicircular cap on each
// end. Cap radius is height / 2. If width == height it collapses to a
// full circle. If width < height the shape errors — a "pill" narrower
// than its caps isn't representable this way.
const pill: PartGenerator = {
  id: "pill",
  version: 1,
  category: "Edges & profiles",
  label: "Pill / obround",
  blurb:
    "Straight parallel sides with a semicircular cap on each end. Width is the total length; height is the diameter of the caps.",
  defaults: { width: 12, height: 4 },
  fields: [
    { key: "width", label: "Overall width", min: 0.5, max: 120, step: 0.125 },
    { key: "height", label: "Overall height", min: 0.5, max: 96, step: 0.125 },
  ],

  solve(spec) {
    const width = spec.width as number;
    const height = spec.height as number;

    if (width < height)
      return {
        error:
          "Pill width must be at least the height (caps are semicircles of diameter = height).",
      };

    const r = height / 2;
    const straight = width - height; // width of the flat middle section

    // Path: start at top of left cap, straight across the top to top of
    // right cap, semicircular right cap down to bottom, straight back
    // across the bottom to bottom of left cap, semicircular left cap up
    // to close.
    const path = [
      `M ${fmt(r)} 0`,
      `L ${fmt(r + straight)} 0`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r + straight)} ${fmt(height)}`,
      `L ${fmt(r)} ${fmt(height)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} 0`,
      "Z",
    ].join(" ");

    const notes: string[] = [];
    if (straight < 0.0625)
      notes.push(
        "Width equals height — the pill is a full circle. Consider using a circle explicitly if that's the intent."
      );

    return {
      path,
      width,
      height,
      filename: `pill-${width}x${height}`,
      stats: [
        { label: "Cap radius", value: `${r.toFixed(4)}"` },
        { label: "Straight run", value: `${straight.toFixed(4)}"` },
        { label: "Perimeter", value: `${(2 * straight + 2 * Math.PI * r).toFixed(3)}"` },
      ],
      notes,
    };
  },
};

export default pill;
