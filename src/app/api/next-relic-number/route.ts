// Next Relic number (REL-####), computed from the GLOBAL max across all tenants.
// relic_number lives on custom_work and is unique across the whole shared table,
// but a client (anon key) only sees its own tenant's rows under RLS — so a
// client-side "max + 1" would collide with a number another company already
// used. This runs with the service role so it sees every row and never hands
// back a taken number. Mirrors api/next-estimate-number, but against custom_work
// (the estimate endpoint reads only the estimates table and would be blind to
// Relic numbers). Sequential, no year segment — REL-1042, REL-1043, …
import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/api-auth";
import { axiomAdmin } from "@/lib/axiom-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireTeamMember(req);
  if (auth instanceof NextResponse) return auth;

  const db = axiomAdmin();
  const { data } = await db
    .from("custom_work")
    .select("relic_number")
    .like("relic_number", "REL-%")
    .order("relic_number", { ascending: false })
    .limit(50);

  // Start the sequence at 1042 (matches the approved mockup) when none exist yet.
  let maxNum = 1041;
  for (const row of (data || []) as { relic_number?: string }[]) {
    const n = parseInt((row.relic_number || "").split("-").pop() || "0", 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }

  const relic_number = `REL-${String(maxNum + 1).padStart(4, "0")}`;
  return NextResponse.json({ relic_number, next: maxNum + 1 });
}
