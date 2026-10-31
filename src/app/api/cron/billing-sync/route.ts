// Daily Relicon billing check for every workspace, so a lapsed or recovered
// account takes effect even if nobody opens Axiom (see lib/relicon-billing).
// Gated like the other crons: CRONS_ENABLED on one project, CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { axiomAdmin } from "@/lib/axiom-admin";
import { refreshWorkspaceBilling } from "@/lib/relicon-billing";

export async function GET(req: NextRequest) {
  if (process.env.CRONS_ENABLED !== "true") return Response.json({ skipped: true });
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = axiomAdmin();
  const { data: tenants } = await db.from("tenants").select("slug").not("billing_account_id", "is", null);
  const results = [];
  for (const { slug } of tenants || []) {
    const b = await refreshWorkspaceBilling(db, slug, { force: true });
    results.push({ slug, access: b?.access ?? null, status: b?.billing_status ?? null });
  }
  return NextResponse.json({ ok: true, results });
}
