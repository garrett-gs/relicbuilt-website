import scallopApron from "./scallopApron";
import archedApron from "./archedApron";
import type { PartGenerator } from "./types";

export type {
  PartGenerator,
  PartSpec,
  PartField,
  SolveResult,
  SolveContext,
  SolveOk,
  SolveError,
  SolveStat,
} from "./types";

export const GENERATORS: PartGenerator[] = [scallopApron, archedApron];

export const byId: Record<string, PartGenerator> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g])
);

export default GENERATORS;
