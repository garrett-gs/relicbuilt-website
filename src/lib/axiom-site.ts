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

/**
 * Break-glass owner allowlist. These emails ALWAYS have RELIC access once
 * signed in — independent of the editable Settings roster and even if the
 * settings read fails. It lives in deploy config (not the app), so a typo in
 * the roster can never lock an owner out of their own RELIC site; they can
 * always get in and fix the roster from Settings. Comma-separated; defaults to
 * the known owner so it works without any env change.
 */
const DEFAULT_OWNER_EMAILS = "garrett@relicbuilt.com";
export const OWNER_EMAILS: string[] = (process.env.NEXT_PUBLIC_AXIOM_OWNER_EMAILS || DEFAULT_OWNER_EMAILS)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** True if the email is a configured owner (break-glass RELIC access). */
export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && OWNER_EMAILS.includes(email.toLowerCase());
}
