"use client";

import { useState, useMemo } from "react";
import Button from "@/components/ui/Button";
import { buildSvg, buildDxf, downloadSvg, downloadDxf } from "@/lib/partSvg";
import type {
  PartGenerator,
  PartSpec,
  SolveContext,
  SolveOk,
} from "@/lib/parts";

export interface PartStudioExport {
  format: "dxf" | "svg";
  text: string;
  spec: PartSpec;
  result: SolveOk;
  generatorId: string;
}

interface PartStudioProps {
  generator: PartGenerator;
  initial?: Partial<PartSpec>;
  context?: SolveContext;
  onExport?: (payload: PartStudioExport) => void;
}

export default function PartStudio({
  generator,
  initial = {},
  context = {},
  onExport,
}: PartStudioProps) {
  const [spec, setSpec] = useState<PartSpec>(
    () => ({ ...generator.defaults, ...initial }) as PartSpec
  );
  const result = useMemo(
    () => generator.solve(spec, context),
    [generator, spec, context]
  );
  const set = (key: string, value: number | string) =>
    setSpec((s) => ({ ...s, [key]: value }));

  const handleExport = (format: "dxf" | "svg", ok: SolveOk) => {
    const name = ok.filename ?? generator.id;
    const text = format === "dxf" ? buildDxf(ok) : buildSvg(ok);
    onExport?.({ format, text, spec, result: ok, generatorId: generator.id });
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
            <label key={f.key} className="block">
              <span className="mb-1.5 flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-wider text-muted">
                  {f.label}
                </span>
                <span className="font-mono text-sm text-foreground">
                  {spec[f.key]}&Prime;
                </span>
              </span>
              <input
                type="range"
                className="w-full accent-accent"
                min={f.min}
                max={f.max}
                step={f.step}
                value={spec[f.key] as number}
                onChange={(e) => set(f.key, parseFloat(e.target.value))}
              />
            </label>
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
        />
      )}
    </div>
  );
}

function PartOkPanel({
  result,
  label,
  onExport,
}: {
  result: SolveOk;
  label: string;
  onExport: (format: "dxf" | "svg", ok: SolveOk) => void;
}) {
  const pad = 0.5;
  return (
    <>
      <div className="my-5 bg-card border border-border p-4">
        <svg
          viewBox={`${-pad} ${-pad} ${result.width + pad * 2} ${
            result.height + pad * 2
          }`}
          className="h-auto w-full"
          role="img"
          aria-label={`${label} preview`}
        >
          <path
            d={result.path}
            fill="currentColor"
            className="text-muted/20"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={result.path}
            fill="none"
            stroke="currentColor"
            className="text-accent"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
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

      <div className="mt-5 flex gap-2">
        <Button onClick={() => onExport("dxf", result)} className="flex-1">
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
        DXF for Fusion and CAM. SVG for Illustrator and artwork.
      </p>
    </>
  );
}
