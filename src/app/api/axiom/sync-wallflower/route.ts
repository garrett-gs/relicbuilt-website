import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runWallflowerSync } from "@/lib/sync-wallflower";

/**
 * User-triggered sync (the "Sync from Wallflower RELIC" button on the Customers
 * page). The actual engine lives in @/lib/sync-wallflower and is shared with the
 * daily cron (GET /api/cron/sync-wallflower).
 *
 * Auth: requires a valid Axiom user session — the caller must pass their
 * Supabase access token as `Authorization: Bearer <token>`.
 */

export async function POST(req: NextRequest) {
  try {
    const axiomUrl = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!;

    // ── Verify the caller is a logged-in Axiom user ──
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authClient = createClient(axiomUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runWallflowerSync();

    return NextResponse.json({
      ok: true,
      summary: {
        companies: { inserted: result.companies.inserted.length, updated: result.companies.updated.length },
        customers: { inserted: result.customers.inserted.length, updated: result.customers.updated.length },
      },
      detail: result,
    });
  } catch (err) {
    console.error("sync-wallflower error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
