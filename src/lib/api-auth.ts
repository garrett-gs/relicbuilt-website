import { NextResponse } from "next/server";
import { AuthError, CallerContext, identifyCaller } from "@/lib/assistant/identity";

/**
 * Gate for internal API routes: the caller must send their Axiom session as
 * `Authorization: Bearer <access token>` (see authedFetch) and be on the team.
 * Returns the caller, or the 401/403 response to send back:
 *
 *   const caller = await requireTeamMember(req);
 *   if (caller instanceof NextResponse) return caller;
 */
export async function requireTeamMember(req: Request): Promise<CallerContext | NextResponse> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  try {
    return await identifyCaller(token);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
