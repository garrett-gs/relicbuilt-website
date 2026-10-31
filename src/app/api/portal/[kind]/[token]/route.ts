import { NextRequest, NextResponse } from "next/server";
import { axiomAdmin } from "@/lib/axiom-admin";
import { portalContent, requirePortal } from "@/lib/portal-server";

// GET /api/portal/{project|company}/<token> → { company, projects: [{ project, files, comments, approvals }] }

type Ctx = { params: Promise<{ kind: string; token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const db = axiomAdmin();
  const p = await requirePortal(db, ctx.params);
  if (p instanceof NextResponse) return p;
  return NextResponse.json(await portalContent(db, p.scope), { headers: { "Cache-Control": "no-store" } });
}
