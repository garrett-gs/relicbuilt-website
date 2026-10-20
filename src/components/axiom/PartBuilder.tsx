"use client";

import { useState, useMemo, useEffect } from "react";
import Button from "@/components/ui/Button";
import { buildSvg, buildDxf, downloadSvg, downloadDxf } from "@/lib/partSvg";
import { appendEngravedLabel, ENGRAVE_ROLE } from "@/lib/relic-blueprint/engrave";
import type {
  PartGenerator,
  PartSpec,
  SolveContext,
  SolveOk,
} from "@/lib/parts";

export interface PartBuilderExport {
  format: "dxf" | "svg";
  text: string;
  spec: PartSpec;
  result: SolveOk;
  generatorId: string;
  generatorVersion: number;
}

export interface PartSaveToLibrary {
  spec: PartSpec;
  result: SolveOk;
  generatorId: string;
  generatorVersion: number;
}

interface PartBuilderProps {
  generator: PartGenerator;
  initial?: Partial<PartSpec>;
  context?: SolveContext;
  onExport?: (payload: PartBuilderExport) => void;
  /** When provided, a "Save to Library" button appears, handing back the
   *  current spec/result so the caller can store it in the shared parts library. */
  onSaveToLibrary?: (payload: PartSaveToLibrary) => void | Promise<void>;
}

export default function PartBuilder({
  generator,
  initial = {},
  context = {},
  onExport,
  onSaveToLibrary,
}: PartBuilderProps) {
  const [spec, setSpec] = useState<PartSpec>(
    () => ({ ...generator.defaults, ...initial }) as PartSpec
  );
  const [savedToLib, setSavedToLib] = useState(false);
  // Optional single-line engraving stamped onto the cut file (ENGRAVE layer),
  // in the Relic Blueprint lettering. Export-time only — not part of the
  // saved part spec.
  const [engraveLabel, setEngraveLabel] = useState("");
  const result = useMemo(
    () => generator.solve(spec, context),
    [generator, spec, context]
  );
  const set = (key: string, value: number | string) =>
    setSpec((s) => ({ ...s, [key]: value }));

  const handleSaveToLibrary = async (ok: SolveOk) => {
    if (!onSaveToLibrary) return;
    await onSaveToLibrary({ spec, result: ok, generatorId: generator.id, generatorVersion: generator.version });
    setSavedToLib(true);
    setTimeout(() => setSavedToLib(false), 2000);
  };

  const handleExport = (format: "dxf" | "svg", ok: SolveOk) => {
    const name = ok.filename ?? generator.id;
    // Stamp the engraved label (if any) onto its own ENGRAVE layer so CAM can
    // assign a V-bit / engrave toolpath to it alone. The saved part stays the
    // original geometry.
    const geo = engraveLabel.trim() ? appendEngravedLabel(ok, engraveLabel) : ok;
    const text = format === "dxf" ? buildDxf(geo) : buildSvg(geo);
    onExport?.({
      format,
      text,
      spec,
      result: ok,
      generatorId: generator.id,
      generatorVersion: generator.version,
    });
    (format === "dxf" ? downloadDxf : downloadSvg)(text, name);
  };

  return (
    <div className="w-full">
      <div className="mb-5">
        <h2 className="text-base font-heading font-bold text-foreground">
          {generator.label}
        </h2>
        {generator.blurb && (
          <p className="mt-0.5 text-sm text-muted">{generator.blurb}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {generator.fields.map((f) =>
          f.type === "choice" ? (
            <div key={f.key} className="flex flex-col justify-end">
              <span className="mb-1.5 text-xs uppercase tracking-wider text-muted">
                {f.label}
              </span>
              <div className="flex gap-2">
                {f.options.map((o) => {
                  const active = spec[f.key] === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set(f.key, o.value)}
                      className={
                        active
                          ? "h-9 flex-1 border border-accent bg-accent text-background text-sm font-medium"
                          : "h-9 flex-1 border border-border bg-card text-foreground text-sm hover:border-accent hover:text-accent transition-colors"
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <DimensionInput
              key={f.key}
              label={f.label}
              min={f.min}
              max={f.max}
              step={f.step}
              value={spec[f.key] as number}
              onChange={(v) => set(f.key, v)}
            />
          )
        )}
      </div>

      {"error" in result ? (
        <p className="mt-5 border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-400">
          {result.error}
        </p>
      ) : (
        <PartOkPanel
          result={result}
          label={generator.label}
          onExport={handleExport}
          engraveLabel={engraveLabel}
          onEngraveLabelChange={setEngraveLabel}
          onSave={onSaveToLibrary ? () => handleSaveToLibrary(result) : undefined}
          saved={savedToLib}
        />
      )}
    </div>
  );
}

// Number entry for a dimension. Holds its own text buffer so partial
// input ("12.", "") is preserved while typing; only a valid parse is
// pushed up to the spec. Clamps to [min, max] on blur.
function DimensionInput({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));

  // Keep the buffer in sync when the value changes from outside (e.g. a
  // different spec loads), but don't stomp what the user is mid-typing.
  useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = () => {
    const n = parseFloat(text);
    if (Number.isNaN(n)) {
      setText(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-muted">
          {label}
        </span>
        <span className="text-[10px] text-muted/70">
          {min}–{max}&Prime;
        </span>
      </span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          className="h-9 w-full border border-border bg-card pl-3 pr-7 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseFloat(e.target.value);
            if (!Number.isNaN(n) && n >= min && n <= max) onChange(n);
          }}
          onBlur={commit}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
          &Prime;
        </span>
      </div>
    </label>
  );
}

function PartOkPanel({
  result,
  label,
  onExport,
  onSave,
  saved,
  engraveLabel,
  onEngraveLabelChange,
}: {
  result: SolveOk;
  label: string;
  onExport: (format: "dxf" | "svg", ok: SolveOk) => void;
  onSave?: () => void;
  saved?: boolean;
  engraveLabel?: string;
  onEngraveLabelChange?: (v: string) => void;
}) {
  const pad = 0.5;
  // Preview-only orientation. Rotating the display 90° lets you eyeball a
  // part the way it'll actually hang (a scallop apron on a vertical face,
  // say) — the cut file and dimensions are unchanged.
  const [rotated, setRotated] = useState(false);

  // Reflect the engraved label in the preview so you see exactly what the cut
  // file carries. Engrave strokes are open polylines — rendered stroke-only
  // (no fill) and separated from the cut outline.
  const labeled = engraveLabel?.trim() ? appendEngravedLabel(result, engraveLabel) : result;
  const allEntries =
    labeled.paths ?? (labeled.path ? [{ d: labeled.path, role: "cut" }] : []);
  const entries = allEntries.filter((p) => p.role !== ENGRAVE_ROLE);
  const engraveEntries = allEntries.filter((p) => p.role === ENGRAVE_ROLE);
  const vbW = (rotated ? result.height : result.width) + pad * 2;
  const vbH = (rotated ? result.width : result.height) + pad * 2;
  // Rotate 90° CW about the origin, then shift back into positive space.
  const groupTransform = rotated
    ? `translate(${result.height} 0) rotate(90)`
    : undefined;

  return (
    <>
      <div className="my-5 bg-card border border-border p-4">
        <div className="mb-3 flex items-center justify-end gap-2">
          <span className="mr-auto text-[10px] uppercase tracking-wider text-muted">
            {rotated ? "Portrait" : "Landscape"} view
          </span>
          <button
            type="button"
            onClick={() => setRotated(false)}
            className={
              !rotated
                ? "border border-accent bg-accent px-2.5 py-1 text-[11px] font-medium text-background"
                : "border border-border bg-card px-2.5 py-1 text-[11px] text-muted hover:border-accent hover:text-accent transition-colors"
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
                : "border border-border bg-card px-2.5 py-1 text-[11px] text-muted hover:border-accent hover:text-accent transition-colors"
            }
          >
            Portrait
          </button>
        </div>
        <svg
          viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          className="mx-auto block h-auto w-full max-h-[70vh]"
          role="img"
          aria-label={`${label} preview`}
        >
          <g transform={groupTransform}>
            {entries.map((p, i) => (
              <path
                key={i}
                d={p.d}
                fill="currentColor"
                className="text-muted/20"
                stroke="currentColor"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {entries.map((p, i) => (
              <path
                key={`stroke-${i}`}
                d={p.d}
                fill="none"
                stroke="currentColor"
                className="text-accent"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {engraveEntries.map((p, i) => (
              <path
                key={`engrave-${i}`}
                d={p.d}
                fill="none"
                stroke="currentColor"
                className="text-foreground"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {result.stats.map((s) => (
          <div
            key={s.label}
            className="bg-card border border-border p-3"
          >
            <p className="text-[10px] uppercase tracking-wider text-muted">
              {s.label}
            </p>
            <p className="mt-0.5 font-mono text-lg text-foreground">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted">
        Blank required{" "}
        <span className="font-mono text-foreground">
          {result.width.toFixed(2)}&Prime; &times;{" "}
          {result.height.toFixed(2)}&Prime;
        </span>
      </p>

      {result.notes?.map((n, i) => (
        <p
          key={i}
          className="mt-2 border border-border bg-card p-3 text-sm text-muted"
        >
          {n}
        </p>
      ))}

      {onEngraveLabelChange && (
        <div className="mt-5">
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">
            Engrave Label <span className="normal-case text-muted/60">(optional — single-line, on its own ENGRAVE layer)</span>
          </label>
          <input
            value={engraveLabel ?? ""}
            onChange={(e) => onEngraveLabelChange(e.target.value)}
            placeholder="e.g. P1 · 3/16 · RELIC"
            className="w-full bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent font-blueprint"
            style={{ letterSpacing: "0.04em" }}
          />
          <p className="mt-1 text-xs text-muted">
            Engraved in Relic Blueprint lettering. CAM can toolpath the ENGRAVE layer with a V-bit or engrave bit.
          </p>
        </div>
      )}

      {onSave && (
        <Button onClick={onSave} className="mt-3 w-full">
          {saved ? "Saved to Library ✓" : "Save to Library"}
        </Button>
      )}

      <div className={`${onSave ? "mt-2" : "mt-5"} flex gap-2`}>
        <Button onClick={() => onExport("dxf", result)} variant={onSave ? "outline" : "primary"} className="flex-1">
          Download DXF
        </Button>
        <Button
          variant="outline"
          onClick={() => onExport("svg", result)}
          className="flex-1"
        >
          Download SVG
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        {onSave ? "Save a reusable copy to the Parts Library, or download — " : ""}DXF for Fusion and CAM. SVG for Illustrator and artwork.
      </p>
    </>
  );
}
