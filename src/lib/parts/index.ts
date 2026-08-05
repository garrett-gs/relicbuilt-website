import scallopApron from "./scallopApron";
import archedApron from "./archedApron";
import pill from "./pill";
import roundBase from "./roundBase";
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
  PathEntry,
} from "./types";

export const GENERATORS: PartGenerator[] = [scallopApron, archedApron, pill, roundBase];

export const byId: Record<string, PartGenerator> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g])
);

export default GENERATORS;
