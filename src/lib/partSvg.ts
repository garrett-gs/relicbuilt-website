// Geometry writers for the part generator. The math here is verified —
// don't touch arcCenter, the Y-flip in buildDxf, or the 9-decimal DXF
// precision without running lib/partSvg.test.ts and getting 12 passes.
//
// SVG lives in a Y-down coordinate system; DXF lives Y-up. The flip in
// buildDxf plus the sweep swap on `sweep === 1` arcs is the subtle part.

export type Point = [number, number];

export interface LineSeg {
  type: "line";
  from: Point;
  to: Point;
}

export interface ArcSeg {
  type: "arc";
  from: Point;
  to: Point;
  r: number;
  largeArc: 0 | 1;
  sweep: 0 | 1;
}

export type PathSeg = LineSeg | ArcSeg;

export interface PartGeometry {
  path: string;
  width: number;
  height: number;
}

export const fmt = (v: number, p = 5): string =>
  Number(v.toFixed(p)).toString();

export function sagitta(chord: number, depth: number): number {
  return (chord * chord + 4 * depth * depth) / (8 * depth);
}

export function buildSvg({ path, width, height }: PartGeometry): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${fmt(
    width
  )}in" height="${fmt(height)}in" viewBox="0 0 ${fmt(width)} ${fmt(height)}">
<g id="cut" fill="none" stroke="#000000" stroke-width="0.01">
<path d="${path}"/>
</g>
</svg>
`;
}

export function parsePath(d: string): PathSeg[] {
  const tok = d.trim().split(/[\s,]+/);
  const segs: PathSeg[] = [];
  let i = 0;
  let cur: Point = [0, 0];
  let start: Point = [0, 0];
  const num = (): number => parseFloat(tok[i++]);
  while (i < tok.length) {
    const cmd = tok[i++];
    if (cmd === "M") {
      cur = [num(), num()];
      start = cur;
    } else if (cmd === "L") {
      const p: Point = [num(), num()];
      segs.push({ type: "line", from: cur, to: p });
      cur = p;
    } else if (cmd === "A") {
      const rx = num();
      num();
      num();
      const largeArc = num() as 0 | 1;
      const sweep = num() as 0 | 1;
      const p: Point = [num(), num()];
      segs.push({ type: "arc", from: cur, to: p, r: rx, largeArc, sweep });
      cur = p;
    } else if (cmd === "Z" || cmd === "z") {
      if (cur[0] !== start[0] || cur[1] !== start[1])
        segs.push({ type: "line", from: cur, to: start });
      cur = start;
    } else {
      throw new Error(`parsePath: unsupported command "${cmd}"`);
    }
  }
  return segs;
}

export interface ArcCenterResult {
  cx: number;
  cy: number;
  r: number;
  t1: number;
  t2: number;
}

// SVG endpoint-arc to center parameterization. Verified — see tests.
export function arcCenter({ from, to, r, largeArc, sweep }: ArcSeg): ArcCenterResult {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const hx = (x1 - x2) / 2;
  const hy = (y1 - y2) / 2;
  const D = hx * hx + hy * hy;
  let rr = r;
  if (D > rr * rr) rr = Math.sqrt(D);
  let coef = Math.sqrt(Math.max(0, (rr * rr - D) / D));
  if (largeArc === sweep) coef = -coef;
  const cx = coef * hy + (x1 + x2) / 2;
  const cy = -coef * hx + (y1 + y2) / 2;
  return {
    cx,
    cy,
    r: rr,
    t1: Math.atan2(y1 - cy, x1 - cx),
    t2: Math.atan2(y2 - cy, x2 - cx),
  };
}

const deg = (rad: number): number => {
  const d = (rad * 180) / Math.PI;
  return ((d % 360) + 360) % 360;
};
const pair = (code: number, value: string | number): string => `${code}\n${value}\n`;

export function buildDxf({ path, width, height }: PartGeometry, layer = "CUT"): string {
  // SVG is Y-down, DXF is Y-up. Flip Y and reverse sweep-1 arc endpoints
  // to keep the geometry identical after the coordinate flip.
  const flip = (y: number): number => height - y;
  let body = "";
  for (const s of parsePath(path)) {
    if (s.type === "line") {
      body +=
        pair(0, "LINE") +
        pair(8, layer) +
        pair(10, fmt(s.from[0], 9)) +
        pair(20, fmt(flip(s.from[1]), 9)) +
        pair(30, "0.0") +
        pair(11, fmt(s.to[0], 9)) +
        pair(21, fmt(flip(s.to[1]), 9)) +
        pair(31, "0.0");
    } else {
      const { cx, cy, r, t1, t2 } = arcCenter(s);
      const p1 = deg(-t1);
      const p2 = deg(-t2);
      const [a, b] = s.sweep === 1 ? [p2, p1] : [p1, p2];
      body +=
        pair(0, "ARC") +
        pair(8, layer) +
        pair(10, fmt(cx, 9)) +
        pair(20, fmt(flip(cy), 9)) +
        pair(30, "0.0") +
        pair(40, fmt(r, 9)) +
        pair(50, fmt(a, 9)) +
        pair(51, fmt(b, 9));
    }
  }
  // Section order (HEADER → TABLES → BLOCKS → ENTITIES), $ACADVER, and
  // the CONTINUOUS LTYPE definition are all required by strict readers
  // like Illustrator and ezdxf. Lenient readers (Fusion, most CAM) fill
  // them in silently, which is how the earlier tests missed the defect.
  return (
    pair(0, "SECTION") +
    pair(2, "HEADER") +
    pair(9, "$ACADVER") +
    pair(1, "AC1009") +
    pair(9, "$INSUNITS") +
    pair(70, "1") +
    pair(9, "$MEASUREMENT") +
    pair(70, "0") +
    pair(9, "$EXTMIN") +
    pair(10, "0.0") +
    pair(20, "0.0") +
    pair(30, "0.0") +
    pair(9, "$EXTMAX") +
    pair(10, fmt(width, 9)) +
    pair(20, fmt(height, 9)) +
    pair(30, "0.0") +
    pair(0, "ENDSEC") +
    pair(0, "SECTION") +
    pair(2, "TABLES") +
    pair(0, "TABLE") +
    pair(2, "LTYPE") +
    pair(70, "1") +
    pair(0, "LTYPE") +
    pair(2, "CONTINUOUS") +
    pair(70, "0") +
    pair(3, "Solid line") +
    pair(72, "65") +
    pair(73, "0") +
    pair(40, "0.0") +
    pair(0, "ENDTAB") +
    pair(0, "TABLE") +
    pair(2, "LAYER") +
    pair(70, "1") +
    pair(0, "LAYER") +
    pair(2, layer) +
    pair(70, "0") +
    pair(62, "7") +
    pair(6, "CONTINUOUS") +
    pair(0, "ENDTAB") +
    pair(0, "ENDSEC") +
    pair(0, "SECTION") +
    pair(2, "BLOCKS") +
    pair(0, "ENDSEC") +
    pair(0, "SECTION") +
    pair(2, "ENTITIES") +
    body +
    pair(0, "ENDSEC") +
    pair(0, "EOF")
  );
}

export function downloadFile(text: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const downloadSvg = (svg: string, name: string): void =>
  downloadFile(svg, `${name.replace(/\.svg$/, "")}.svg`, "image/svg+xml");

export const downloadDxf = (dxf: string, name: string): void =>
  downloadFile(dxf, `${name.replace(/\.dxf$/, "")}.dxf`, "image/vnd.dxf");
