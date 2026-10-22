"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, ReactNode } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { useAuth } from "./AuthProvider";
import { TeamMember, BusinessEntity, RelicProfile } from "@/types/axiom";
import { SITE_ENTITY, NEXUS_CONNECTED, isOwnerEmail } from "@/lib/axiom-site";

/**
 * Which business entity the app is currently scoped to.
 *
 * The selection is a per-browser preference (localStorage) exposed through a
 * tiny external store so we can read it without a setState-in-effect. Relic is
 * only ever the *effective* entity when the signed-in user has been granted
 * access — so losing access (or never having it) always resolves to Wallflower
 * RELIC, no matter what's stored.
 *
 * When this deployment is locked to a single entity (SITE_ENTITY, from the
 * per-project env var), the switcher is disabled: `entity` is always
 * SITE_ENTITY, `setEntity` is a no-op, and `locked` is true. On the RELIC site
 * a signed-in user without Relic access is blocked (`accessDenied`) rather than
 * silently dropped to Wallflower — there is no Wallflower side to fall back to.
 * With SITE_ENTITY null (local dev / today), none of this engages.
 */

const ENTITY_KEY = "axiom-entity";
const listeners = new Set<() => void>();

function readStored(): BusinessEntity {
  try {
    return localStorage.getItem(ENTITY_KEY) === "relic" ? "relic" : "wallflower_relic";
  } catch {
    return "wallflower_relic";
  }
}
function writeStored(e: BusinessEntity) {
  try { localStorage.setItem(ENTITY_KEY, e); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb); // sync across tabs
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}

interface EntityContextType {
  entity: BusinessEntity;          // the effective entity (always wallflower_relic without access)
  setEntity: (e: BusinessEntity) => void;
  hasRelicAccess: boolean;
  locked: boolean;                 // deployment is pinned to SITE_ENTITY (no switcher)
  accessDenied: boolean;           // RELIC site + signed-in user without Relic access
  loading: boolean;                // the Relic-access check is still resolving
  brandName: string;               // the entity's business name, from settings
  brandEmail: string;              // the entity's business email, from settings
  accent: string;                  // the entity's accent color, from settings
  nexusConnected: boolean;         // whether this workspace is linked to Nexus
}

const EntityContext = createContext<EntityContextType | null>(null);

export function EntityProvider({ children }: { children: ReactNode }) {
  const { userEmail } = useAuth();
  const [hasRelicAccess, setHasRelicAccess] = useState(false);
  // Start true so the RELIC site shows its spinner until the access check
  // resolves, instead of flashing the access-denied screen at a user who
  // actually has access.
  const [accessLoading, setAccessLoading] = useState(true);
  // Business identity (name + accent) from settings, resolved per entity below.
  const [settingsRow, setSettingsRow] = useState<{
    accent_color?: string;
    biz_name?: string;
    biz_email?: string;
    nexus_connected?: boolean;
    relic_profile?: RelicProfile | null;
  } | null>(null);

  const stored = useSyncExternalStore(subscribe, readStored, () => "wallflower_relic" as BusinessEntity);

  const locked = SITE_ENTITY !== null;

  // Resolve the signed-in user's Relic access from settings.team_members.
  // With no user, access stays false and the check is considered settled.
  useEffect(() => {
    if (!userEmail) {
      setHasRelicAccess(false);
      setAccessLoading(false);
      return;
    }
    // Break-glass: a configured owner always has access, independent of the
    // editable roster — so a typo in Settings (or a failed settings read) can
    // never lock an owner out of their own RELIC site. Set it up front so it
    // holds even if the fetch below errors.
    const owner = isOwnerEmail(userEmail);
    if (owner) setHasRelicAccess(true);
    let active = true;
    setAccessLoading(true);
    axiom.from("settings").select("team_members, accent_color, biz_name, biz_email, nexus_connected, relic_profile").limit(1).single().then(({ data }) => {
      if (!active) return;
      setSettingsRow(data as typeof settingsRow);
      const me = (data?.team_members || []).find(
        (m: TeamMember) => m.email?.toLowerCase() === userEmail.toLowerCase()
      );
      setHasRelicAccess(owner || (!!me && (me.role === "superadmin" || me.relic_access === true)));
      setAccessLoading(false);
    });
    return () => { active = false; };
  }, [userEmail]);

  // Effective entity: a locked deployment is always its SITE_ENTITY; otherwise
  // Relic only sticks when the user has access, else Wallflower.
  const entity: BusinessEntity = locked
    ? (SITE_ENTITY as BusinessEntity)
    : hasRelicAccess ? stored : "wallflower_relic";

  // On the RELIC site, a signed-in user without Relic access is denied (once
  // the check has settled) rather than shown the Wallflower side.
  const accessDenied = SITE_ENTITY === "relic" && !accessLoading && !hasRelicAccess;

  // Per-entity business identity, from settings (falls back to the defaults
  // until settings load). The accent drives the whole app's --accent token
  // (buttons, highlights, borders) so each business can theme its workspace.
  const brandName =
    entity === "relic"
      ? settingsRow?.relic_profile?.name || "RELIC"
      : settingsRow?.biz_name || "Wallflower RELIC";
  // Business contact email from settings; falls back to the signed-in user's
  // email until the business email is set.
  const brandEmail =
    (entity === "relic" ? settingsRow?.relic_profile?.email : settingsRow?.biz_email) || userEmail || "";
  const accent =
    entity === "relic"
      ? settingsRow?.relic_profile?.accent_color || "#b8963c"
      : settingsRow?.accent_color || "#5b642e";
  // Nexus link is a per-site setting; until an admin sets it, fall back to the
  // build-time NEXUS_CONNECTED default for this deployment.
  const nexusStored =
    entity === "relic" ? settingsRow?.relic_profile?.nexus_connected : settingsRow?.nexus_connected;
  const nexusConnected = nexusStored ?? NEXUS_CONNECTED;

  // Stamp data-entity (for any entity-specific CSS) and drive --accent from the
  // business's chosen color so the UI recolors to match.
  useEffect(() => {
    const el = document.documentElement;
    if (entity === "relic") el.setAttribute("data-entity", "relic");
    else el.removeAttribute("data-entity");
    el.style.setProperty("--accent", accent);
    return () => el.removeAttribute("data-entity");
  }, [entity, accent]);

  const setEntity = (e: BusinessEntity) => {
    if (locked) return;                       // switcher disabled on a pinned site
    if (e === "relic" && !hasRelicAccess) return;
    writeStored(e);
  };

  return (
    <EntityContext.Provider
      value={{ entity, setEntity, hasRelicAccess, locked, accessDenied, loading: accessLoading, brandName, brandEmail, accent, nexusConnected }}
    >
      {children}
    </EntityContext.Provider>
  );
}

export function useEntity() {
  const ctx = useContext(EntityContext);
  if (!ctx) throw new Error("useEntity must be used within EntityProvider");
  return ctx;
}
