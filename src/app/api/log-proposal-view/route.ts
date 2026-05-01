import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logProposalEvent, ipFromHeaders } from "@/lib/audit";

/**
 * Public endpoint called by /proposal/[token] when the page loads,
 * so we can log a "viewed" audit event with the client's IP and UA.
 *
 * Idempotency: we don't dedupe in the DB. A single client may view the
 * proposal multiple times — that's useful in the audit trail.
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: estimate } = await supabase
      .from("estimates")
      .select("id")
      .eq("proposal_token", token)
      .single();

    if (!estimate) return NextResponse.json({ ok: true });

    await logProposalEvent({
      supabase,
      estimateId: estimate.id,
      eventType: "viewed",
      ipAddress: ipFromHeaders(req.headers),
      userAgent: req.headers.get("user-agent") || null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[log-proposal-view] error:", err);
    // Audit logging shouldn't crash the client experience
    return NextResponse.json({ ok: true });
  }
}
