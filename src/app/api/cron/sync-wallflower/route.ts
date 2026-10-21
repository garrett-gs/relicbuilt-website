// Daily Nexus -> Axiom sync. Vercel Cron hits this once a day (see vercel.json)
// so the Axiom companies/customers lists stay current without anyone pressing
// the "Sync from Wallflower RELIC" button on the Customers page. Same engine as
// that button (@/lib/sync-wallflower); this entry point is gated by CRON_SECRET
// instead of a user session, matching the daily-task-digest cron.

import { NextRequest, NextResponse } from "next/server";
import { runWallflowerSync } from "@/lib/sync-wallflower";

export async function GET(req: NextRequest) {
  // Both Vercel projects share this vercel.json, so its crons would otherwise
  // fire on both. Only the project with CRONS_ENABLED=true actually runs them.
  if (process.env.CRONS_ENABLED !== "true") {
    return Response.json({ skipped: true });
  }

  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runWallflowerSync();
    return NextResponse.json({
      ok: true,
      summary: {
        companies: { inserted: result.companies.inserted.length, updated: result.companies.updated.length },
        customers: { inserted: result.customers.inserted.length, updated: result.customers.updated.length },
      },
    });
  } catch (err) {
    console.error("[cron/sync-wallflower] error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
