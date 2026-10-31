import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/api-auth";
import { refreshWorkspaceBilling } from "@/lib/relicon-billing";

// POST /api/billing/refresh → this site's workspace billing state, re-checked
// with Relicon at most hourly. The billing banner calls it when Axiom opens or
// comes back to the foreground.

export async function POST(req: NextRequest) {
  const caller = await requireTeamMember(req, { write: false });
  if (caller instanceof NextResponse) return caller;
  const billing = await refreshWorkspaceBilling(caller.admin);
  return NextResponse.json({ billing }, { headers: { "Cache-Control": "no-store" } });
}
