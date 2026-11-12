// Next estimate/change-order number, computed from the GLOBAL max across all
// tenants. estimate_number is unique across the whole shared estimates table,
// but a client (anon key) only sees its own tenant's rows under RLS — so on a
// tenant whose numbers lag another's, the client-side "max + 1" collides with a
// number another company already used. This runs with the service role so it
// sees every row and never hands back a number that's taken.

import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/api-auth";
import { axiomAdmin } from "@/lib/axiom-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireTeamMember(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const prefix = (url.searchParams.get("prefix") || "EST").toUpperCase().replace(/[^A-Z]/g, "") || "EST";
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();

  const db = axiomAdmin();
  // Pull recent matches and take the true numeric max (string ordering is fine
  // up to 9999, but compute numerically to be safe).
  const { data } = await db
    .from("estimates")
    .select("estimate_number")
    .like("estimate_number", `${prefix}-${year}-%`)
    .order("estimate_number", { ascending: false })
    .limit(50);

  let maxNum = 0;
  for (const row of (data || []) as { estimate_number?: string }[]) {
    const n = parseInt((row.estimate_number || "").split("-").pop() || "0", 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }

  const estimate_number = `${prefix}-${year}-${String(maxNum + 1).padStart(4, "0")}`;
  return NextResponse.json({ estimate_number, next: maxNum + 1 });
}
