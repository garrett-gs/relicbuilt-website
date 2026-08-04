// Contract that every part generator implements. PartBuilder builds its
// entire UI from `fields`, and stores `spec` and `id` on the build record
// (change orders are edits to five numbers, not regenerated files).

export type PartSpec = Record<string, number | string>;

export interface SolveContext {
  bitDiameter?: number;
}

export interface SolveStat {
  label: string;
  value: string | number;
}

export interface SolveOk {
  path: string;
  width: number;
  height: number;
  filename: string;
  stats: SolveStat[];
  notes: string[];
}

export interface SolveError {
  error: string;
}

export type SolveResult = SolveOk | SolveError;

export interface NumberField {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  type?: "number";
}

export interface ChoiceField {
  key: string;
  label: string;
  type: "choice";
  options: { value: string; label: string }[];
}

export type PartField = NumberField | ChoiceField;

export interface PartGenerator {
  // Kebab-case, immutable. Saved rows reference this — renaming orphans them
  // silently (the lookup fails and the spec becomes unopenable with no
  // write-time error).
  id: string;
  // Bump whenever solve() output changes — bug fix, rounding tweak, anything.
  // Stored on the saved row at export time so old specs re-solve to their
  // original geometry (or you can tell they need re-checking against the
  // current version).
  version: number;
  // Groups the picker via <optgroup>. Sentence-case, freely editable.
  category: string;
  // Sentence case, freely editable (display only — not referenced by rows).
  label: string;
  blurb?: string;
  defaults: PartSpec;
  fields: PartField[];
  solve(spec: PartSpec, ctx?: SolveContext): SolveResult;
}
