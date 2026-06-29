"use client";

import { useEffect, useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { useAuth } from "@/components/axiom/AuthProvider";
import { TeamMember } from "@/types/axiom";

export type AxiomRole = TeamMember["role"];

/**
 * Resolves the signed-in user's Axiom role from settings.team_members.
 *
 * `superadmin` is a strict superset of `admin` — `isAdmin` is true for both,
 * so granting someone superadmin never removes admin abilities. `isSuperAdmin`
 * is the extra tier used to gate super-admin-only surfaces (e.g. archives).
 */
export function useAxiomRole() {
  const { userEmail } = useAuth();
  const [role, setRole] = useState<AxiomRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userEmail) return;
    let active = true;
    axiom
      .from("settings")
      .select("team_members")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (!active) return;
        const me = (data?.team_members || []).find(
          (m: TeamMember) => m.email?.toLowerCase() === userEmail.toLowerCase()
        );
        setRole((me?.role as AxiomRole) ?? null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userEmail]);

  const isSuperAdmin = role === "superadmin";
  const isAdmin = role === "admin" || isSuperAdmin;
  const isManager = role === "manager";
  const isAdminOrManager = isAdmin || isManager;

  return { role, isSuperAdmin, isAdmin, isManager, isAdminOrManager, loading };
}
