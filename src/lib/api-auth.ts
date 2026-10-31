import { NextResponse } from "next/server";
import { AuthError, CallerContext, identifyCaller } from "@/lib/assistant/identity";
import { requireWritableWorkspace } from "@/lib/relicon-billing";

/**
 * Gate for internal API routes: the caller must send their Axiom session as
 * `Authorization: Bearer <access token>` (see authedFetch) and be on the team.
 * Unless `write: false`, the site's workspace must also be paid up (Phase 3).
 * Returns the caller, or the 401/403 response to send back:
 *
 *   const caller = await requireTeamMember(req);
 *   if (caller instanceof NextResponse) return caller;
 */
export async function requireTeamMember(
  req: Request,
  // Routes that only read or draft (no saved change) pass write: false so they
  // keep working while the workspace is read-only for billing.
  { write = true }: { write?: boolean } = {},
): Promise<CallerContext | NextResponse> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  let caller: CallerContext;
  try {
    caller = await identifyCaller(token);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  if (write) {
    const blocked = await requireWritableWorkspace(caller.admin);
    if (blocked) return blocked;
  }
  return caller;
}
