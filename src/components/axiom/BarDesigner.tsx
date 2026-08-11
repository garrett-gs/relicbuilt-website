"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { buildSvg, buildDxf, downloadSvg, downloadDxf } from "@/lib/partSvg";
import {
  solveBar,
  panelSheetGeometry,
  BAR_SHAPES,
  BAR_DEFAULTS,
  COATINGS,
  type BarSpec,
  type BarShape,
  type Coating,
} from "@/lib/bar/solveBar";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Inches -> feet-inches label, e.g. 96 -> 8'-0", 34 -> 2'-10".
const ftIn = (v: number) => {
  const t = Math.round(v);
  const ft = Math.floor(t / 12);
  const inch = t - ft * 12;
  if (ft && inch) return `${ft}'-${inch}"`;
  if (ft) return `${ft}'-0"`;
  return `${inch}"`;
};

// Small labeled numeric field with its own text buffer so decimals type
// cleanly. `suffix` is display-only ("ft" / "in").
function NumField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max = 100000,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          className="h-9 w-full border border-border bg-card pl-3 pr-9 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseFloat(e.target.value);
            if (!Number.isNaN(n) && n >= min && n <= max) onChange(n);
          }}
          onBlur={() => {
            const n = parseFloat(text);
            if (Number.isNaN(n)) return setText(String(value));
            const c = Math.min(max, Math.max(min, n));
            setText(String(c));
            onChange(c);
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted">
          {suffix}
        </span>
      </div>
    </label>
  );
}

export default function BarDesigner() {
  const [spec, setSpec] = useState<BarSpec>(BAR_DEFAULTS);
  const [rotated, setRotated] = useState(false);
  const result = useMemo(() => solveBar(spec), [spec]);
  const set = <K extends keyof BarSpec>(key: K, value: BarSpec[K]) =>
    setSpec((s) => ({ ...s, [key]: value }));

  const arced =
    spec.shape === "round" || spec.shape === "oval" || spec.shape === "radius";
  const isRound = spec.shape === "round";

  const exportPanels = (format: "dxf" | "svg") => {
    if (result.error) return;
    const geo = panelSheetGeometry(result.panels);
    const text = format === "dxf" ? buildDxf(geo) : buildSvg(geo);
    (format === "dxf" ? downloadDxf : downloadSvg)(text, `bar-${spec.shape}-panels`);
  };
  const exportPlan = () => {
    if (result.error) return;
    const pad = 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${result.bboxW + pad * 2}in" height="${result.bboxH + pad * 2}in" viewBox="${-pad} ${-pad} ${result.bboxW + pad * 2} ${result.bboxH + pad * 2}"><path d="${result.outline}" fill="none" stroke="#000" stroke-width="0.05"/></svg>`;
    downloadSvg(svg, `bar-${spec.shape}-plan`);
  };

  const pad = (Math.max(result.bboxW, result.bboxH) || 60) * 0.14 + 10;
  const vbW = (rotated ? result.bboxH : result.bboxW) + pad * 2;
  const vbH = (rotated ? result.bboxW : result.bboxH) + pad * 2;
  const groupTransform = rotated
    ? `translate(${result.bboxH} 0) rotate(90)`
    : undefined;

  return (
    <div className="w-full">
      {/* Shape picker */}
      <div className="mb-5">
        <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted">
          Bar shape
        </span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {BAR_SHAPES.map((s) => {
            const active = spec.shape === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => set("shape", s.value as BarShape)}
                className={
                  active
                    ? "h-9 border border-accent bg-accent text-sm font-medium text-background"
                    : "h-9 border border-border bg-card text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dimensions */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <NumField
          label={isRound ? "Diameter" : "Length"}
          suffix="ft"
          value={spec.lengthFt}
          onChange={(v) => set("lengthFt", v)}
          min={2}
          max={40}
          step={0.5}
        />
        {!isRound && (
          <NumField
            label="Depth (std 2′)"
            suffix="ft"
            value={spec.widthFt}
            onChange={(v) => set("widthFt", v)}
            min={1}
            max={20}
            step={0.5}
          />
        )}
        {spec.shape === "radius" && (
          <NumField
            label="Corner radius"
            suffix="in"
            value={spec.cornerRadiusIn}
            onChange={(v) => set("cornerRadiusIn", v)}
            min={1}
            max={48}
            step={0.5}
          />
        )}
        <NumField
          label="Service height"
          suffix="in"
          value={spec.serviceHeightIn}
          onChange={(v) => set("serviceHeightIn", v)}
          min={34}
          max={48}
          step={0.5}
        />
        <NumField
          label="Working height"
          suffix="in"
          value={spec.workingHeightIn}
          onChange={(v) => set("workingHeightIn", v)}
          min={28}
          max={40}
          step={0.5}
        />
        <NumField
          label="Overhang"
          suffix="in"
          value={spec.overhangIn}
          onChange={(v) => set("overhangIn", v)}
          min={4}
          max={16}
          step={0.5}
        />
        <NumField
          label="Nosing / lip"
          suffix="in"
          value={spec.nosingIn}
          onChange={(v) => set("nosingIn", v)}
          min={0.5}
          max={4}
          step={0.25}
        />
        <NumField
          label="Counter depth"
          suffix="in"
          value={spec.counterDepthIn}
          onChange={(v) => set("counterDepthIn", v)}
          min={12}
          max={36}
          step={0.5}
        />
        <NumField
          label="Toe kick"
          suffix="in"
          value={spec.toeKickIn}
          onChange={(v) => set("toeKickIn", v)}
          min={0}
          max={8}
          step={0.25}
        />
        <NumField
          label="Shelves / section"
          suffix="ea"
          value={spec.shelfCount}
          onChange={(v) => set("shelfCount", Math.round(v))}
          min={0}
          max={4}
          step={1}
        />
        <NumField
          label="Max section width"
          suffix="in"
          value={spec.maxPanelIn}
          onChange={(v) => set("maxPanelIn", v)}
          min={12}
          max={96}
          step={1}
        />
      </div>

      {/* Top finish */}
      <div className="mb-6">
        <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted">
          Countertop finish
        </span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {COATINGS.map((c) => {
            const active = spec.coating === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => set("coating", c.value as Coating)}
                className={
                  active
                    ? "h-9 border border-accent bg-accent text-sm font-medium text-background"
                    : "h-9 border border-border bg-card text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Curved upgrade */}
      {arced && (
        <div className="mb-6">
          <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted">
            Curved run construction
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set("curvedFronts", false)}
              className={
                !spec.curvedFronts
                  ? "h-9 flex-1 border border-accent bg-accent text-sm font-medium text-background"
                  : "h-9 flex-1 border border-border bg-card text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
              }
            >
              Faceted (flat panels)
            </button>
            <button
              type="button"
              onClick={() => set("curvedFronts", true)}
              className={
                spec.curvedFronts
                  ? "h-9 flex-1 border border-accent bg-accent text-sm font-medium text-background"
                  : "h-9 flex-1 border border-border bg-card text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
              }
            >
              True curved (coopered)
            </button>
          </div>
        </div>
      )}

      {/* Access gap + light rail */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted">
            Bartender access
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set("accessGap", !spec.accessGap)}
              className={
                spec.accessGap
                  ? "h-9 flex-1 border border-accent bg-accent text-sm font-medium text-background"
                  : "h-9 flex-1 border border-border bg-card text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
              }
            >
              {spec.accessGap ? "Opening on" : "No opening"}
            </button>
            <div className="w-28">
              <NumField
                label="Width"
                suffix="in"
                value={spec.accessGapIn}
                onChange={(v) => set("accessGapIn", v)}
                min={18}
                max={60}
                step={1}
              />
            </div>
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted">
            Light rail under lip
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set("lightRail", !spec.lightRail)}
              className={
                spec.lightRail
                  ? "h-9 flex-1 border border-accent bg-accent text-sm font-medium text-background"
                  : "h-9 flex-1 border border-border bg-card text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
              }
            >
              {spec.lightRail ? "Light rail on" : "No light rail"}
            </button>
            <div className="w-28">
              <NumField
                label="Clearance"
                suffix="in"
                value={spec.lightRailClearanceIn}
                onChange={(v) => set("lightRailClearanceIn", v)}
                min={0.5}
                max={4}
                step={0.25}
              />
            </div>
          </div>
        </div>
      </div>

      {result.error ? (
        <p className="border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-400">
          {result.error}
        </p>
      ) : (
        <>
          {/* Plan view */}
          <div className="mb-5 border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="mr-auto text-[10px] uppercase tracking-wider text-muted">
                Plan view · {result.bboxW % 12 === 0 ? result.bboxW / 12 : (result.bboxW / 12).toFixed(1)}′ ×{" "}
                {(result.bboxH / 12).toFixed(1)}′
                {result.gap.active && (
                  <span className="text-amber-400"> · {result.gap.widthIn}″ access</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setRotated(false)}
                className={
                  !rotated
                    ? "border border-accent bg-accent px-2.5 py-1 text-[11px] font-medium text-background"
                    : "border border-border bg-card px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
                }
              >
                Landscape
              </button>
              <button
                type="button"
                onClick={() => setRotated(true)}
                className={
                  rotated
                    ? "border border-accent bg-accent px-2.5 py-1 text-[11px] font-medium text-background"
                    : "border border-border bg-card px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
                }
              >
                Portrait
              </button>
            </div>
            <svg
              viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`}
              preserveAspectRatio="xMidYMid meet"
              className="mx-auto block h-auto max-h-[55vh] w-full"
              role="img"
              aria-label="Bar plan view"
            >
              <g transform={groupTransform}>
                <path
                  d={result.outline}
                  fill="currentColor"
                  className="text-muted/10"
                  stroke="currentColor"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={result.outline}
                  fill="none"
                  stroke="currentColor"
                  className="text-accent"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
                {result.innerOutline && (
                  <g transform={`translate(${result.innerInsetIn} ${result.innerInsetIn})`}>
                    <path
                      d={result.innerOutline}
                      fill="currentColor"
                      className="text-background"
                    />
                    <path
                      d={result.innerOutline}
                      fill="none"
                      stroke="currentColor"
                      className="text-muted"
                      strokeWidth="1"
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                )}
                {/* section seams */}
                {(() => {
                  const t = Math.max(3, Math.min(result.bboxW, result.bboxH) * 0.06);
                  return result.seams.map((s, i) => (
                    <line
                      key={i}
                      x1={s.x - s.nx * t * 0.5}
                      y1={s.y - s.ny * t * 0.5}
                      x2={s.x + s.nx * t * 0.5}
                      y2={s.y + s.ny * t * 0.5}
                      stroke="currentColor"
                      className="text-accent"
                      strokeWidth="1.25"
                      vectorEffect="non-scaling-stroke"
                    />
                  ));
                })()}
                {/* corner joints */}
                {(() => {
                  const t = Math.max(4, Math.min(result.bboxW, result.bboxH) * 0.09);
                  return result.corners.map((s, i) => (
                    <line
                      key={i}
                      x1={s.x - s.nx * t * 0.5}
                      y1={s.y - s.ny * t * 0.5}
                      x2={s.x + s.nx * t * 0.5}
                      y2={s.y + s.ny * t * 0.5}
                      stroke="currentColor"
                      className="text-accent"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  ));
                })()}
                {/* bartender access opening (centered) */}
                {result.entrance &&
                  (() => {
                    const e = result.entrance;
                    const dx = e.bx - e.ax;
                    const dy = e.by - e.ay;
                    const L = Math.hypot(dx, dy) || 1;
                    const nx = -dy / L;
                    const ny = dx / L;
                    const t = Math.max(6, Math.min(result.bboxW, result.bboxH) * 0.12);
                    return (
                      <g stroke="currentColor" className="text-amber-400" strokeWidth="2" vectorEffect="non-scaling-stroke">
                        <line x1={e.ax} y1={e.ay} x2={e.bx} y2={e.by} strokeDasharray="5 3" />
                        <line x1={e.ax - nx * t * 0.5} y1={e.ay - ny * t * 0.5} x2={e.ax + nx * t * 0.5} y2={e.ay + ny * t * 0.5} />
                        <line x1={e.bx - nx * t * 0.5} y1={e.by - ny * t * 0.5} x2={e.bx + nx * t * 0.5} y2={e.by + ny * t * 0.5} />
                      </g>
                    );
                  })()}
                {/* dimensions */}
                {(() => {
                  const D = result.dims;
                  const fs = (Math.max(result.bboxW, result.bboxH) || 60) * 0.045;
                  const off = pad * 0.55;
                  const tik = fs * 0.5;
                  const isRound = spec.shape === "round";
                  return (
                    <g stroke="currentColor" className="text-muted" vectorEffect="non-scaling-stroke">
                      {/* outer width — above */}
                      <line x1={0} y1={-off} x2={result.bboxW} y2={-off} strokeWidth="1" />
                      <line x1={0} y1={-off - tik} x2={0} y2={-off + tik} strokeWidth="1" />
                      <line x1={result.bboxW} y1={-off - tik} x2={result.bboxW} y2={-off + tik} strokeWidth="1" />
                      <text x={result.bboxW / 2} y={-off - fs * 0.4} textAnchor="middle" fontSize={fs} stroke="none" className="fill-muted">
                        {(isRound ? "⌀ " : "") + ftIn(D.outerW)}
                      </text>
                      {/* outer depth — left (skip for round) */}
                      {!isRound && (
                        <>
                          <line x1={-off} y1={0} x2={-off} y2={result.bboxH} strokeWidth="1" />
                          <line x1={-off - tik} y1={0} x2={-off + tik} y2={0} strokeWidth="1" />
                          <line x1={-off - tik} y1={result.bboxH} x2={-off + tik} y2={result.bboxH} strokeWidth="1" />
                          <text
                            transform={`rotate(-90 ${-off - fs * 0.4} ${result.bboxH / 2})`}
                            x={-off - fs * 0.4}
                            y={result.bboxH / 2}
                            textAnchor="middle"
                            fontSize={fs}
                            stroke="none"
                            className="fill-muted"
                          >
                            {ftIn(D.outerH)}
                          </text>
                        </>
                      )}
                      {/* inner opening */}
                      {D.innerW > 0 && (
                        <text x={result.bboxW / 2} y={result.bboxH / 2} textAnchor="middle" fontSize={fs * 0.9} stroke="none" className="fill-muted">
                          <tspan x={result.bboxW / 2} dy={0}>
                            inside
                          </tspan>
                          <tspan x={result.bboxW / 2} dy={fs}>
                            {(isRound ? "⌀ " : "") + ftIn(D.innerW) + (isRound ? "" : ` × ${ftIn(D.innerH)}`)}
                          </tspan>
                        </text>
                      )}
                    </g>
                  );
                })()}
              </g>
            </svg>
          </div>

          {/* Section elevation */}
          <div className="mb-5 border border-border bg-card p-4">
            <span className="mb-3 block text-[10px] uppercase tracking-wider text-muted">
              Section — patron side at left
            </span>
            <Elevation spec={spec} faceHeightIn={result.faceHeightIn} />
          </div>

          {/* Summary stats */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Sections", value: String(result.sections) },
              { label: "Built face", value: `${result.builtFaceFt.toFixed(1)}′` },
              { label: "Skin height", value: `${result.frontSkinHeightIn.toFixed(1)}″` },
              { label: "Sheets", value: String(result.sheetsFace) },
              { label: "Weight", value: `${Math.round(result.weightLb)} lb` },
              {
                label: "Per section",
                value: `${Math.round(result.weightPerSectionLb)} lb`,
                warn: result.weightPerSectionLb > 65,
              },
            ].map((s) => (
              <div key={s.label} className="border border-border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted">{s.label}</p>
                <p
                  className={`mt-0.5 font-mono text-lg ${
                    "warn" in s && s.warn ? "text-amber-400" : "text-foreground"
                  }`}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Cut list */}
          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-heading font-bold text-foreground">
                Front skins <span className="font-normal text-muted">(per section)</span>
              </h3>
              <CutTable items={result.panels} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-heading font-bold text-foreground">
                Service-rail top blanks
              </h3>
              <CutTable items={result.tops} />
            </div>
            {result.shelves.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-heading font-bold text-foreground">
                  Shelves
                </h3>
                <CutTable items={result.shelves} />
              </div>
            )}
            {result.toeKicks.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-heading font-bold text-foreground">
                  Toe kick
                </h3>
                <CutTable items={result.toeKicks} />
              </div>
            )}
          </div>

          {/* Rates */}
          <div className="mb-5">
            <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted">
              Rates
            </span>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumField
                label="Sheet good"
                suffix="$/sht"
                value={spec.sheetPrice}
                onChange={(v) => set("sheetPrice", v)}
                min={0}
                max={1000}
                step={1}
              />
              <NumField
                label="Top material"
                suffix="$/sf"
                value={spec.topPricePerSqft}
                onChange={(v) => set("topPricePerSqft", v)}
                min={0}
                max={500}
                step={1}
              />
              <NumField
                label="Labor rate"
                suffix="$/hr"
                value={spec.laborRate}
                onChange={(v) => set("laborRate", v)}
                min={0}
                max={500}
                step={1}
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-5 border border-border bg-card">
            <div className="border-b border-border px-4 py-2">
              <h3 className="text-sm font-heading font-bold text-foreground">
                Itemized estimate
              </h3>
            </div>
            <div className="divide-y divide-border">
              {result.price.lines.map((l) => (
                <div key={l.label} className="flex items-baseline justify-between gap-4 px-4 py-2">
                  <div>
                    <p className="text-sm text-foreground">{l.label}</p>
                    <p className="text-[11px] text-muted">{l.detail}</p>
                  </div>
                  <p className="font-mono text-sm text-foreground">{usd(l.amount)}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 text-sm">
              <span className="text-muted">
                Materials {usd(result.price.materials)} · Labor {usd(result.price.labor)} ({result.price.laborHours.toFixed(1)} hrs)
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border bg-accent/10 px-4 py-3">
              <span className="font-heading font-bold text-foreground">Total</span>
              <div className="text-right">
                <p className="font-mono text-xl font-bold text-foreground">{usd(result.price.total)}</p>
                <p className="text-[11px] text-muted">≈ {usd(result.price.perFt)}/linear ft</p>
              </div>
            </div>
          </div>

          {result.notes.map((n, i) => (
            <p key={i} className="mb-2 border border-border bg-card p-3 text-sm text-muted">
              {n}
            </p>
          ))}

          {/* Exports */}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => exportPanels("dxf")} className="flex-1">
              Panels DXF
            </Button>
            <Button variant="outline" onClick={() => exportPanels("svg")} className="flex-1">
              Panels SVG
            </Button>
            <Button variant="outline" onClick={exportPlan} className="flex-1">
              Plan SVG
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Panels DXF is one cut sheet of every unique face panel (qty noted in the
            list). Plan SVG is the top-down outline. DXF for Fusion/CAM.
          </p>
        </>
      )}
    </div>
  );
}

// Schematic cross-section, patron side at left. Shows the two tiers
// (service rail over working surface), the overhang + nosing, the light
// rail tucked under the lip, and the recessed toe kick. Drawn in inches.
function Elevation({ spec, faceHeightIn }: { spec: BarSpec; faceHeightIn: number }) {
  const oh = spec.overhangIn;
  const d = spec.counterDepthIn;
  const sh = spec.serviceHeightIn;
  const wh = spec.workingHeightIn;
  const tt = spec.topThicknessIn;
  const nos = spec.nosingIn;
  const tk = spec.toeKickIn;
  const kickSetback = 3;
  const frontTier = Math.min(d * 0.45, 14); // service-rail tier depth (schematic)

  const pad = 8;
  const xMin = -oh;
  const xMax = d;
  const yMax = sh;
  const W = xMax - xMin + pad * 2;
  const H = yMax + pad * 2;
  const sx = (x: number) => x - xMin + pad;
  const sy = (y: number) => yMax - y + pad;
  // rect helper in world coords (x0<x1, y0<y1)
  const R = (x0: number, y0: number, x1: number, y1: number) => ({
    x: sx(x0),
    y: sy(y1),
    width: x1 - x0,
    height: y1 - y0,
  });

  const body = R(0, tk, d, wh - tt); // lower cabinet mass
  const frontRise = R(0, wh - tt, frontTier, sh - tt); // raised front die
  const kick = R(kickSetback, 0, d, tk); // recessed toe base
  const svcTop = R(-oh, sh - tt, frontTier, sh); // service rail slab (overhangs)
  const workTop = R(frontTier, wh - tt, d, wh); // working surface slab

  const legend: { swatch: string; text: string }[] = [
    { swatch: "bg-accent/40 border border-accent", text: `Service rail ${sh}″` },
    { swatch: "bg-accent/40 border border-accent", text: `Working surface ${wh}″` },
    { swatch: "bg-muted/20 border border-accent", text: `Cabinet · ${d}″ deep` },
    { swatch: "bg-accent/60", text: `${oh}″ overhang · ${nos}″ nosing` },
    ...(spec.lightRail ? [{ swatch: "bg-amber-400", text: "Light rail under lip" }] : []),
    { swatch: "bg-muted/20 border border-accent", text: `${tk}″ recessed toe kick` },
  ];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto block h-auto max-h-[42vh] w-auto max-w-full"
        role="img"
        aria-label="Bar section"
      >
        {/* ground line */}
        <line x1={sx(xMin)} y1={sy(0)} x2={sx(xMax)} y2={sy(0)} className="stroke-muted" strokeWidth="0.4" />
        {/* cabinet mass */}
        {[body, frontRise, kick].map((r, i) => (
          <rect key={i} {...r} className="fill-muted/15 stroke-accent" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        ))}
        {/* tops */}
        {[svcTop, workTop].map((r, i) => (
          <rect key={`t${i}`} {...r} className="fill-accent/40 stroke-accent" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        ))}
        {/* nosing lip */}
        <rect {...R(-oh, sh - tt - nos, -oh + 0.9, sh - tt)} className="fill-accent/60" />
        {/* light rail under the lip */}
        {spec.lightRail && (
          <rect {...R(-oh + 1.2, sh - tt - 1, -oh + 2.4, sh - tt)} className="fill-amber-400" />
        )}
        {/* front skin edge */}
        <line x1={sx(0)} y1={sy(tk)} x2={sx(0)} y2={sy(faceHeightIn)} className="stroke-accent" strokeWidth="0.8" />
      </svg>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {legend.map((l) => (
          <span key={l.text} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className={`inline-block h-2.5 w-2.5 shrink-0 ${l.swatch}`} />
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function CutTable({ items }: { items: { label: string; qty: number; widthIn: number; heightIn: number; kind: string; note?: string }[] }) {
  if (!items.length)
    return <p className="text-sm text-muted">No panels.</p>;
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Size (W × H)</th>
            <th className="px-3 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.label} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-mono text-foreground">{it.label}</td>
              <td className="px-3 py-2 font-mono text-foreground">{it.qty}</td>
              <td className="px-3 py-2 font-mono text-foreground">
                {it.widthIn}″ × {it.heightIn}″
              </td>
              <td className="px-3 py-2 text-[11px] text-muted">{it.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
