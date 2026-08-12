"use client";

import { useMemo, useState, useEffect, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import { buildSvg, buildDxf, downloadSvg, downloadDxf } from "@/lib/partSvg";
import {
  solveBar,
  panelSheetGeometry,
  endPanelGeometry,
  BAR_SHAPES,
  BAR_DEFAULTS,
  COATINGS,
  CORNER_STYLES,
  FRONT_STYLES,
  type BarSpec,
  type BarShape,
  type Coating,
  type CornerStyle,
  type FrontStyle,
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

// Feet + inches entry. Stores/returns a decimal-feet value but lets you
// type feet and inches separately (e.g., 8 ft 6 in).
function FtInField({
  label,
  value,
  onChange,
  minFt = 0,
  maxFt = 40,
}: {
  label: string;
  value: number; // decimal feet
  onChange: (v: number) => void;
  minFt?: number;
  maxFt?: number;
}) {
  const split = (v: number) => {
    let ft = Math.floor(v + 1e-6);
    let inch = Math.round((v - ft) * 12);
    if (inch >= 12) {
      ft += 1;
      inch = 0;
    }
    return { ft, inch };
  };
  const init = split(value);
  const [ftText, setFtText] = useState(String(init.ft));
  const [inText, setInText] = useState(String(init.inch));

  useEffect(() => {
    const cur = (parseFloat(ftText) || 0) + (parseFloat(inText) || 0) / 12;
    if (Math.abs(cur - value) > 1e-3) {
      const s = split(value);
      setFtText(String(s.ft));
      setInText(String(s.inch));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const push = (ftStr: string, inStr: string) => {
    const f = parseFloat(ftStr);
    const ic = parseFloat(inStr);
    const combined = (Number.isNaN(f) ? 0 : f) + (Number.isNaN(ic) ? 0 : ic) / 12;
    onChange(Math.min(maxFt, Math.max(minFt, combined)));
  };

  const box =
    "h-9 w-full border border-border bg-card pl-3 pr-7 font-mono text-sm text-foreground focus:border-accent focus:outline-none";
  const suffix = "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted";

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input
            type="number"
            inputMode="numeric"
            className={box}
            min={0}
            step={1}
            value={ftText}
            onChange={(e) => {
              setFtText(e.target.value);
              push(e.target.value, inText);
            }}
          />
          <span className={suffix}>ft</span>
        </div>
        <div className="relative flex-1">
          <input
            type="number"
            inputMode="decimal"
            className={box}
            min={0}
            max={11.75}
            step={0.25}
            value={inText}
            onChange={(e) => {
              setInText(e.target.value);
              push(ftText, e.target.value);
            }}
          />
          <span className={suffix}>in</span>
        </div>
      </div>
    </label>
  );
}

export default function BarDesigner() {
  const [spec, setSpec] = useState<BarSpec>(BAR_DEFAULTS);
  const [rotated, setRotated] = useState(false);
  const [showBolts, setShowBolts] = useState(false);
  const result = useMemo(() => solveBar(spec), [spec]);
  const set = <K extends keyof BarSpec>(key: K, value: BarSpec[K]) =>
    setSpec((s) => ({ ...s, [key]: value }));

  const arced =
    spec.shape === "round" || spec.shape === "oval" || spec.shape === "radius";
  const isRound = spec.shape === "round";
  const isStraight = spec.shape === "straight";

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
  const exportEndPanel = (format: "dxf" | "svg") => {
    if (result.error || !result.endPanel.count) return;
    const geo = endPanelGeometry(result.endPanel);
    const text = format === "dxf" ? buildDxf(geo) : buildSvg(geo);
    (format === "dxf" ? downloadDxf : downloadSvg)(text, `bar-${spec.shape}-end-panel`);
  };

  const pad = (Math.max(result.bboxW, result.bboxH) || 60) * 0.14 + 10;
  const vbW = (rotated ? result.bboxH : result.bboxW) + pad * 2;
  const vbH = (rotated ? result.bboxW : result.bboxH) + pad * 2;
  const groupTransform = rotated
    ? `translate(${result.bboxH} 0) rotate(90)`
    : undefined;

  return (
    <div className="w-full">
      {/* Print-only title block */}
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-bold">
          {BAR_SHAPES.find((s) => s.value === spec.shape)?.label} bar —{" "}
          {ftIn(spec.lengthFt * 12)}
          {spec.shape !== "round" ? ` × ${ftIn(spec.widthFt * 12)}` : ""}
        </h1>
        <p className="text-sm">
          {result.sections} sections · {result.builtFaceFt.toFixed(1)}′ front ·{" "}
          {spec.serviceHeightIn}″ service / {spec.workingHeightIn}″ working ·{" "}
          {FRONT_STYLES.find((f) => f.value === spec.frontStyle)?.label} front ·{" "}
          {Math.round(result.weightLb)} lb · {usd(result.price.total)}
        </p>
      </div>

      {/* Screen controls */}
      <div className="print:hidden">
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

      {/* Corner style (hard corners) */}
      {(spec.shape === "rect" || spec.shape === "hex") && (
        <div className="mb-5">
          <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted">
            Corner style
          </span>
          <div className="flex flex-wrap items-start gap-2">
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
              {CORNER_STYLES.map((c) => {
                const active = spec.cornerStyle === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set("cornerStyle", c.value as CornerStyle)}
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
            {(spec.cornerStyle === "radius" ||
              spec.cornerStyle === "chamfer" ||
              spec.cornerStyle === "column") && (
              <div className="w-28">
                <NumField
                  label={spec.cornerStyle === "radius" ? "Radius" : spec.cornerStyle === "column" ? "Column" : "Chamfer"}
                  suffix="in"
                  value={spec.cornerSizeIn}
                  onChange={(v) => set("cornerSizeIn", v)}
                  min={1}
                  max={24}
                  step={0.5}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dimensions */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <FtInField
          label={isRound ? "Diameter" : "Length"}
          value={spec.lengthFt}
          onChange={(v) => set("lengthFt", v)}
          minFt={2}
          maxFt={40}
        />
        {!isRound && !isStraight && (
          <FtInField
            label="Depth (std 2′)"
            value={spec.widthFt}
            onChange={(v) => set("widthFt", v)}
            minFt={1}
            maxFt={20}
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

      {/* Front finish */}
      <div className="mb-6">
        <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted">
          Front finish
        </span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {FRONT_STYLES.map((f) => {
            const active = spec.frontStyle === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => set("frontStyle", f.value as FrontStyle)}
                className={
                  active
                    ? "h-9 border border-accent bg-accent text-sm font-medium text-background"
                    : "h-9 border border-border bg-card text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
        {(spec.frontStyle === "reeded" ||
          spec.frontStyle === "paneled" ||
          spec.insertedPanel) && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {spec.frontStyle === "reeded" && (
              <NumField
                label="Reed spacing"
                suffix="in"
                value={spec.reedSpacingIn}
                onChange={(v) => set("reedSpacingIn", v)}
                min={0.25}
                max={3}
                step={0.125}
              />
            )}
            {spec.frontStyle === "paneled" && (
              <NumField
                label="Stile / rail"
                suffix="in"
                value={spec.panelStileIn}
                onChange={(v) => set("panelStileIn", v)}
                min={1}
                max={6}
                step={0.25}
              />
            )}
            {spec.insertedPanel && (
              <NumField
                label="Insert reveal"
                suffix="in"
                value={spec.insertRevealIn}
                onChange={(v) => set("insertRevealIn", v)}
                min={0}
                max={1}
                step={0.0625}
              />
            )}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => set("removableTop", !spec.removableTop)}
            className={
              spec.removableTop
                ? "h-8 border border-accent bg-accent px-3 text-[13px] font-medium text-background"
                : "h-8 border border-border bg-card px-3 text-[13px] text-muted transition-colors hover:border-accent hover:text-accent"
            }
          >
            Removable top
          </button>
          <button
            type="button"
            onClick={() => set("insertedPanel", !spec.insertedPanel)}
            className={
              spec.insertedPanel
                ? "h-8 border border-accent bg-accent px-3 text-[13px] font-medium text-background"
                : "h-8 border border-border bg-card px-3 text-[13px] text-muted transition-colors hover:border-accent hover:text-accent"
            }
          >
            Inserted panel
          </button>
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
        {!isStraight && (
        <div>
          <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted">
            Bartender access
          </span>
          <div className="flex gap-2">
            <div className="flex flex-1">
              <button
                type="button"
                onClick={() => set("accessGap", true)}
                className={
                  spec.accessGap
                    ? "h-9 flex-1 border border-accent bg-accent text-sm font-medium text-background"
                    : "h-9 flex-1 border border-border bg-card text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
                }
              >
                Opening
              </button>
              <button
                type="button"
                onClick={() => set("accessGap", false)}
                className={
                  !spec.accessGap
                    ? "h-9 flex-1 border border-accent bg-accent text-sm font-medium text-background"
                    : "h-9 flex-1 border border-l-0 border-border bg-card text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
                }
              >
                None
              </button>
            </div>
            {spec.accessGap && (
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
            )}
          </div>
          {!spec.accessGap && (
            <p className="mt-1.5 text-[11px] text-muted">
              Fully enclosed — no entrance (freestanding / served from outside).
            </p>
          )}
        </div>
        )}
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
              <span className="flex gap-2 print:hidden">
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
              <button
                type="button"
                onClick={() => setShowBolts((b) => !b)}
                className={
                  showBolts
                    ? "border border-amber-400 bg-amber-400/20 px-2.5 py-1 text-[11px] font-medium text-amber-400"
                    : "border border-border bg-card px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
                }
              >
                Bolts
              </button>
              </span>
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
                {result.isStraight && (
                  <g>
                    {/* open bartender side (back edge) */}
                    <line
                      x1={0}
                      y1={result.bboxH}
                      x2={result.bboxW}
                      y2={result.bboxH}
                      stroke="currentColor"
                      className="text-muted"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={result.bboxW / 2}
                      y={result.bboxH * 0.5}
                      textAnchor="middle"
                      fontSize={Math.max(result.bboxW, result.bboxH) * 0.05}
                      className="fill-muted"
                    >
                      open (bartender side)
                    </text>
                  </g>
                )}
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
                {/* corner columns */}
                {result.cornerPosts.map((p, i) => {
                  const s = result.cornerSizeIn;
                  return (
                    <rect
                      key={i}
                      x={p.x - s / 2}
                      y={p.y - s / 2}
                      width={s}
                      height={s}
                      className="fill-accent/60 stroke-accent"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
                {/* section-joint bolt positions */}
                {showBolts &&
                (() => {
                  const r = Math.max(1.2, Math.min(result.bboxW, result.bboxH) * 0.012);
                  return result.boltPoints.map((b, i) => (
                    <circle
                      key={i}
                      cx={b.x}
                      cy={b.y}
                      r={r}
                      fill="none"
                      stroke="currentColor"
                      className="text-amber-400"
                      strokeWidth="1"
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

          {/* Front elevation */}
          <div className="mb-5 border border-border bg-card p-4">
            <span className="mb-3 block text-[10px] uppercase tracking-wider text-muted">
              Front elevation — unrolled ({FRONT_STYLES.find((f) => f.value === spec.frontStyle)?.label})
            </span>
            <FrontElevation
              seq={result.frontSeq}
              skinH={result.frontSkinHeightIn}
              toeKickIn={spec.toeKickIn}
              spec={spec}
            />
          </div>

          {/* Summary stats */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: "Sections", value: String(result.sections) },
              { label: "Built face", value: `${result.builtFaceFt.toFixed(1)}′` },
              { label: "Skin height", value: `${result.frontSkinHeightIn.toFixed(1)}″` },
              {
                label: "Under-rail",
                value: `${result.railClearanceIn.toFixed(1)}″`,
                warn: result.railClearanceIn < 12,
              },
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
            {result.cornerPosts.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-heading font-bold text-foreground">
                  Corner columns
                </h3>
                <CutTable
                  items={[
                    {
                      label: "C1",
                      qty: result.cornerPosts.length,
                      widthIn: result.cornerSizeIn,
                      heightIn: Math.round(result.faceHeightIn * 10) / 10,
                      kind: "post",
                      note: "Square corner post — shared reconfig joint",
                    },
                  ]}
                />
              </div>
            )}
            {result.endPanels.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-heading font-bold text-foreground">
                  End panels <span className="font-normal text-muted">(bolt-together)</span>
                </h3>
                <CutTable items={result.endPanels} />
                <EndPanelDiagram ep={result.endPanel} />
              </div>
            )}
            {result.insertPanels.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-heading font-bold text-foreground">
                  Swappable inserts
                </h3>
                <CutTable items={result.insertPanels} />
              </div>
            )}
          </div>

          {/* Rates */}
          <div className="mb-5 print:hidden">
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
          <div className="mt-5 flex flex-wrap gap-2 print:hidden">
            <Button onClick={() => window.print()} className="flex-1">
              Print shop drawing
            </Button>
            <Button variant="outline" onClick={() => exportPanels("dxf")} className="flex-1">
              Panels DXF
            </Button>
            <Button variant="outline" onClick={() => exportPanels("svg")} className="flex-1">
              Panels SVG
            </Button>
            <Button variant="outline" onClick={exportPlan} className="flex-1">
              Plan SVG
            </Button>
            <Button variant="outline" onClick={() => exportEndPanel("dxf")} className="flex-1">
              End panel DXF
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted print:hidden">
            Print shop drawing lays out the plan, section, front elevation, and parts
            schedule on one page (use “Save as PDF”). Panels DXF is one cut sheet of every
            unique face panel. End panel DXF has the 3/8″ bolt holes on a separate “HOLES”
            layer for CNC. DXF for Fusion/CAM.
          </p>
        </>
      )}
      <style>{`
        @media print {
          @page { margin: 0.5in; }
          .bar-designer-svg, svg { max-height: none !important; }
        }
      `}</style>
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

  const underRail = Math.max(0, sh - tt - wh);
  const legend: { swatch: string; text: string }[] = [
    { swatch: "bg-accent/40 border border-accent", text: `Service rail ${sh}″` },
    { swatch: "bg-accent/40 border border-accent", text: `Working surface ${wh}″` },
    {
      swatch: "bg-muted/20 border border-dashed border-muted",
      text: `Under-rail storage ${underRail.toFixed(1)}″${underRail < 12 ? " (target 12″)" : ""}`,
    },
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

// Draw the chosen finish inside one section rectangle (x..x+w, 0..h).
function finishGraphics(
  style: FrontStyle,
  x: number,
  w: number,
  h: number,
  spec: BarSpec
): ReactNode {
  const inset = spec.insertedPanel ? spec.insertRevealIn : 0;
  const ix = x + inset;
  const iw = Math.max(1, w - 2 * inset);
  const iy = inset;
  const ih = Math.max(1, h - 2 * inset);
  const nodes: ReactNode[] = [];
  if (spec.insertedPanel) {
    nodes.push(
      <rect key="rev" x={ix} y={iy} width={iw} height={ih} fill="none" strokeDasharray="2 1.5" stroke="currentColor" className="text-muted" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
    );
  }
  if (style === "reeded") {
    const pitch = Math.max(0.25, spec.reedSpacingIn);
    const n = Math.max(1, Math.round(iw / pitch));
    for (let i = 1; i < n; i++) {
      const rx = ix + (i * iw) / n;
      nodes.push(<line key={`r${i}`} x1={rx} y1={iy + 1} x2={rx} y2={iy + ih - 1} stroke="currentColor" className="text-accent/45" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />);
    }
  } else if (style === "paneled") {
    const s = Math.min(spec.panelStileIn, iw / 2 - 1, ih / 2 - 1);
    nodes.push(<rect key="pnl" x={ix + s} y={iy + s} width={iw - 2 * s} height={ih - 2 * s} fill="none" stroke="currentColor" className="text-accent/55" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />);
  } else if (style === "trimmed") {
    const t = Math.min(2, iw / 2 - 1, ih / 2 - 1);
    nodes.push(<rect key="trm" x={ix + t} y={iy + t} width={iw - 2 * t} height={ih - 2 * t} fill="none" stroke="currentColor" className="text-accent/55" strokeWidth="1" vectorEffect="non-scaling-stroke" />);
  } else if (style === "cement") {
    nodes.push(<rect key="cem" x={ix} y={iy} width={iw} height={ih} className="fill-muted/25" />);
  }
  return nodes;
}

// Unrolled front elevation — every section drawn left to right at its true
// width, with the finish, section seams, bolt marks, and the recessed toe
// kick. Reads jamb → around → jamb.
function FrontElevation({
  seq,
  skinH,
  toeKickIn,
  spec,
}: {
  seq: { widthIn: number; kind: string }[];
  skinH: number;
  toeKickIn: number;
  spec: BarSpec;
}) {
  if (!seq.length) return <p className="text-sm text-muted">No sections.</p>;
  const total = seq.reduce((s, p) => s + p.widthIn, 0);
  const H = skinH + toeKickIn;
  const pad = Math.max(total, H) * 0.03 + 2;
  const kickSetback = 3;

  let x = 0;
  const sections: ReactNode[] = [];
  const seams: ReactNode[] = [];
  const bolts: ReactNode[] = [];
  const boltR = Math.max(0.6, H * 0.02);
  seq.forEach((p, i) => {
    sections.push(
      <g key={i} transform={`translate(${x} 0)`}>
        {finishGraphics(spec.frontStyle, 0, p.widthIn, skinH, spec)}
      </g>
    );
    if (i > 0) {
      seams.push(<line key={`s${i}`} x1={x} y1={0} x2={x} y2={skinH} stroke="currentColor" className="text-accent" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />);
      // two bolt marks per joint (upper/lower)
      bolts.push(<circle key={`b${i}a`} cx={x} cy={skinH * 0.25} r={boltR} fill="none" stroke="currentColor" className="text-amber-400" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />);
      bolts.push(<circle key={`b${i}b`} cx={x} cy={skinH * 0.75} r={boltR} fill="none" stroke="currentColor" className="text-amber-400" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />);
    }
    x += p.widthIn;
  });

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`${-pad} ${-pad} ${total + pad * 2} ${H + pad * 2}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block h-auto max-h-[38vh] w-full min-w-[520px]"
        role="img"
        aria-label="Front elevation"
      >
        {/* skin band */}
        <rect x={0} y={0} width={total} height={skinH} fill="currentColor" className="text-muted/10" stroke="currentColor" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
        {sections}
        {seams}
        {bolts}
        {/* recessed toe kick */}
        <rect x={kickSetback} y={skinH} width={total - kickSetback} height={toeKickIn} className="fill-muted/20 stroke-accent" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-2 text-[10px] text-muted">
        {seq.length} sections · {(total / 12).toFixed(1)}′ of front · amber = bolt joints · ends are the entrance jambs
      </p>
    </div>
  );
}

// Small end-panel drawing showing the 3/8" bolt hole layout (CNC).
function EndPanelDiagram({
  ep,
}: {
  ep: { widthIn: number; heightIn: number; holeDiaIn: number; holes: { x: number; y: number }[]; through: boolean };
}) {
  if (!ep.widthIn) return null;
  const pad = 3;
  const r = ep.holeDiaIn / 2;
  return (
    <div className="mt-2 border border-border bg-card p-3">
      <svg
        viewBox={`${-pad} ${-pad} ${ep.widthIn + pad * 2} ${ep.heightIn + pad * 2}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block h-auto max-h-40 w-auto max-w-full"
        role="img"
        aria-label="End panel bolt pattern"
      >
        <rect
          x={0}
          y={0}
          width={ep.widthIn}
          height={ep.heightIn}
          fill="currentColor"
          className="text-muted/10"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {ep.holes.map((h, i) => (
          <circle
            key={i}
            cx={h.x}
            cy={h.y}
            r={r}
            fill="none"
            stroke="currentColor"
            className="text-amber-400"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between px-1 text-[9px] uppercase tracking-wider text-muted/70">
        <span>front</span>
        <span>back</span>
      </div>
      <p className="mt-1 text-center text-[10px] text-muted">
        End panel {ep.widthIn}″ × {ep.heightIn}″ · 2 front / 2 back ⌀3/8″ ·{" "}
        {ep.through ? "through" : "threaded / set-screw"}
      </p>
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
