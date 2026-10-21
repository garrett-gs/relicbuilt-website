import type { BusinessEntity } from "@/types/axiom";

/**
 * Deployment-level site configuration, read from build-time env vars.
 *
 * With both vars unset the app behaves exactly as it does today (legacy
 * switcher mode, Nexus connected), so this module can be merged before any
 * Vercel change. See AXIOM_SPLIT_SITES_SPEC.md §2–§3.
 */

const rawEntity = process.env.NEXT_PUBLIC_AXIOM_ENTITY;

/** The entity this deployment is locked to, or null for the legacy switcher mode. */
export const SITE_ENTITY: BusinessEntity | null =
  rawEntity === "relic" || rawEntity === "wallflower_relic" ? rawEntity : null;

/**
 * Whether this deployment is connected to a Nexus (event side). Defaults to
 * true = today's behavior; only an explicit "false" turns it off.
 */
export const NEXUS_CONNECTED = process.env.NEXT_PUBLIC_AXIOM_NEXUS_CONNECTED !== "false";
