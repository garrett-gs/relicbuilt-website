"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, ReactNode } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { useAuth } from "./AuthProvider";
import { TeamMember, BusinessEntity } from "@/types/axiom";

/**
 * Which business entity the app is currently scoped to.
 *
 * The selection is a per-browser preference (localStorage) exposed through a
 * tiny external store so we can read it without a setState-in-effect. Relic is
 * only ever the *effective* entity when the signed-in user has been granted
 * access — so losing access (or never having it) always resolves to Wallflower
 * RELIC, no matter what's stored.
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
}

const EntityContext = createContext<EntityContextType | null>(null);

export function EntityProvider({ children }: { children: ReactNode }) {
  const { userEmail } = useAuth();
  const [hasRelicAccess, setHasRelicAccess] = useState(false);

  const stored = useSyncExternalStore(subscribe, readStored, () => "wallflower_relic" as BusinessEntity);

  // Resolve the signed-in user's Relic access from settings.team_members.
  // With no user, access stays false (its initial value).
  useEffect(() => {
    if (!userEmail) return;
    let active = true;
    axiom.from("settings").select("team_members").limit(1).single().then(({ data }) => {
      if (!active) return;
      const me = (data?.team_members || []).find(
        (m: TeamMember) => m.email?.toLowerCase() === userEmail.toLowerCase()
      );
      setHasRelicAccess(!!me && (me.role === "superadmin" || me.relic_access === true));
    });
    return () => { active = false; };
  }, [userEmail]);

  const entity: BusinessEntity = hasRelicAccess ? stored : "wallflower_relic";

  // Flag the document so CSS can swing the app's accent to gold in Relic mode.
  useEffect(() => {
    const el = document.documentElement;
    if (entity === "relic") el.setAttribute("data-entity", "relic");
    else el.removeAttribute("data-entity");
    return () => el.removeAttribute("data-entity");
  }, [entity]);

  const setEntity = (e: BusinessEntity) => {
    if (e === "relic" && !hasRelicAccess) return;
    writeStored(e);
  };

  return (
    <EntityContext.Provider value={{ entity, setEntity, hasRelicAccess }}>
      {children}
    </EntityContext.Provider>
  );
}

export function useEntity() {
  const ctx = useContext(EntityContext);
  if (!ctx) throw new Error("useEntity must be used within EntityProvider");
  return ctx;
}
