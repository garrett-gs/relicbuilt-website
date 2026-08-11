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

  const pad = Math.max(result.bboxW, result.bboxH) * 0.06 || 4;
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
                {result.gap.active &&
                  (() => {
                    const w = Math.min(result.gap.widthIn, result.bboxW);
                    const x1 = result.gap.cx - w / 2;
                    const x2 = result.gap.cx + w / 2;
                    const y = result.gap.cy;
                    const tick = Math.max(4, result.bboxH * 0.12);
                    return (
                      <g stroke="currentColor" vectorEffect="non-scaling-stroke">
                        {/* dashed opening across the back run */}
                        <line
                          x1={x1}
                          y1={y}
                          x2={x2}
                          y2={y}
                          className="text-amber-400"
                          strokeWidth="2"
                          strokeDasharray="5 3"
                        />
                        {/* jamb posts */}
                        <line x1={x1} y1={y - tick} x2={x1} y2={y + tick} className="text-amber-400" strokeWidth="2" />
                        <line x1={x2} y1={y - tick} x2={x2} y2={y + tick} className="text-amber-400" strokeWidth="2" />
                      </g>
                    );
                  })()}
              </g>
            </svg>
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
