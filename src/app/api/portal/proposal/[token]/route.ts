import { NextRequest, NextResponse } from "next/server";
import { axiomAdmin } from "@/lib/axiom-admin";

// GET /api/portal/proposal/<token> → the project proposal shown on /approve/<token>.
// (Approving goes through /api/approve-proposal.)

const FIELDS =
  "id,project_name,client_name,client_email,quoted_amount,proposal_status,proposal_approved_at,proposal_scope,proposal_cost_section,proposal_highlights,project_description,start_date,due_date";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data } = await axiomAdmin().from("custom_work").select(FIELDS).eq("proposal_token", token).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project: data }, { headers: { "Cache-Control": "no-store" } });
}
