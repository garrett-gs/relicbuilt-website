import { fmt } from "../partSvg";
import type { PartGenerator, PathEntry } from "./types";

// Sheet-with-pill-opening. You pick the outer sheet size and the space
// on each side; the pill opening is what's left in the middle. Emits
// two paths on two DXF layers so CNC assigns outside-cut on SHEET and
// inside-cut on OPENING — no sorting parts out by hand.
//
// Pill orientation is automatic: whichever axis is longer becomes the
// straight sides, the shorter axis becomes the caps. Cap radius is
// half of the shorter dimension.
const pillOpening: PartGenerator = {
  id: "pill-opening",
  version: 1,
  category: "Openings",
  label: "Pill opening in sheet",
  blurb:
    "Rectangular sheet with a pill-shaped opening centered by your chosen margins. Emits the outer sheet and the inner opening on separate CNC layers.",
  defaults: {
    sheetWidth: 96,
    sheetHeight: 48,
    marginTop: 6,
    marginBottom: 6,
    marginLeft: 12,
    marginRight: 12,
  },
  fields: [
    { key: "sheetWidth", label: "Sheet width", min: 6, max: 120, step: 0.125 },
    { key: "sheetHeight", label: "Sheet height", min: 6, max: 120, step: 0.125 },
    { key: "marginTop", label: "Space at top", min: 0, max: 60, step: 0.125 },
    { key: "marginBottom", label: "Space at bottom", min: 0, max: 60, step: 0.125 },
    { key: "marginLeft", label: "Space at left end", min: 0, max: 60, step: 0.125 },
    { key: "marginRight", label: "Space at right end", min: 0, max: 60, step: 0.125 },
  ],

  solve(spec) {
    const sheetWidth = spec.sheetWidth as number;
    const sheetHeight = spec.sheetHeight as number;
    const marginTop = spec.marginTop as number;
    const marginBottom = spec.marginBottom as number;
    const marginLeft = spec.marginLeft as number;
    const marginRight = spec.marginRight as number;

    const pillWidth = sheetWidth - marginLeft - marginRight;
    const pillHeight = sheetHeight - marginTop - marginBottom;

    if (pillWidth <= 0.5)
      return {
        error: `Left + right margins (${(marginLeft + marginRight).toFixed(
          3
        )}") consume the sheet width (${sheetWidth}"). Reduce a margin or widen the sheet.`,
      };
    if (pillHeight <= 0.5)
      return {
        error: `Top + bottom margins (${(marginTop + marginBottom).toFixed(
          3
        )}") consume the sheet height (${sheetHeight}"). Reduce a margin or raise the sheet.`,
      };

    // Sheet outline — plain rectangle, on the SHEET layer.
    const sheet =
      `M 0 0 ` +
      `L ${fmt(sheetWidth)} 0 ` +
      `L ${fmt(sheetWidth)} ${fmt(sheetHeight)} ` +
      `L 0 ${fmt(sheetHeight)} ` +
      `Z`;

    // Pill outline — orientation picked automatically. Whichever axis is
    // longer gets the straight sides; the shorter axis is the cap
    // diameter.
    const horizontal = pillWidth >= pillHeight;
    const r = (horizontal ? pillHeight : pillWidth) / 2;
    const left = marginLeft;
    const top = marginTop;
    const right = marginLeft + pillWidth;
    const bottom = marginTop + pillHeight;

    let opening: string;
    if (horizontal) {
      // Caps on left and right, straights on top and bottom.
      opening = [
        `M ${fmt(left + r)} ${fmt(top)}`,
        `L ${fmt(right - r)} ${fmt(top)}`,
        `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(right - r)} ${fmt(bottom)}`,
        `L ${fmt(left + r)} ${fmt(bottom)}`,
        `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(left + r)} ${fmt(top)}`,
        "Z",
      ].join(" ");
    } else {
      // Caps on top and bottom, straights on left and right.
      opening = [
        `M ${fmt(left)} ${fmt(top + r)}`,
        `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(right)} ${fmt(top + r)}`,
        `L ${fmt(right)} ${fmt(bottom - r)}`,
        `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(left)} ${fmt(bottom - r)}`,
        `L ${fmt(left)} ${fmt(top + r)}`,
        "Z",
      ].join(" ");
    }

    const paths: PathEntry[] = [
      { d: sheet, role: "sheet" },
      { d: opening, role: "opening" },
    ];

    const straightRun = horizontal ? pillWidth - pillHeight : pillHeight - pillWidth;
    const notes: string[] = [
      `Sheet on layer SHEET (outside cut). Opening on layer OPENING (inside cut).`,
    ];
    if (straightRun < 0.0625)
      notes.push(
        "Pill width equals height — the opening is a full circle. If that's intentional, fine; if not, adjust the margins."
      );
    if (Math.abs(marginLeft - marginRight) > 0.001)
      notes.push(
        `Pill is offset ${((marginRight - marginLeft) / 2).toFixed(
          3
        )}" from the horizontal center. Even the end margins if you want it centered.`
      );
    if (Math.abs(marginTop - marginBottom) > 0.001)
      notes.push(
        `Pill is offset ${((marginBottom - marginTop) / 2).toFixed(
          3
        )}" from the vertical center. Even the top/bottom margins if you want it centered.`
      );

    return {
      paths,
      width: sheetWidth,
      height: sheetHeight,
      filename: `pill-opening-${sheetWidth}x${sheetHeight}-${pillWidth.toFixed(2)}x${pillHeight.toFixed(2)}`,
      stats: [
        { label: "Sheet", value: `${sheetWidth}" × ${sheetHeight}"` },
        { label: "Opening", value: `${pillWidth.toFixed(3)}" × ${pillHeight.toFixed(3)}"` },
        { label: "Cap radius", value: `${r.toFixed(4)}"` },
        { label: "Orientation", value: horizontal ? "Horizontal" : "Vertical" },
      ],
      notes,
    };
  },
};

export default pillOpening;
