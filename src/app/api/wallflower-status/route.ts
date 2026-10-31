// Thin wrapper that lets client-side UI code trigger the outbound Wallflower
// status webhook without exposing service keys to the browser. The actual
// HTTP call to Wallflower happens inside notifyWallflowerStatus, which reads
// server-only env vars.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyWallflowerStatus, type WallflowerSource } from "@/lib/wallflower-status";
import { requireTeamMember } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const auth = await requireTeamMember(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const source = body?.source as WallflowerSource | undefined;
    const status = body?.status as string | undefined;
    const completed = body?.completed as boolean | undefined;
    const actor = body?.actor as string | undefined;
    const notes = body?.notes as string | undefined;

    if (!source || !status) {
      return NextResponse.json({ error: "source and status required" }, { status: 400 });
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    await notifyWallflowerStatus(db, source, status, { completed, actor, notes });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[wallflower-status route] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
