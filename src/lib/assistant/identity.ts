import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { TeamMember } from "@/types/axiom";

/**
 * Identity + access resolution for the Axiom Assistant API.
 *
 * The assistant runs with the service-role key (it writes across tables), so
 * every request must first prove WHO is calling and WHAT they may touch:
 *   - the caller must be a signed-in Axiom user (valid session token), and
 *   - a member of settings.team_members.
 * Relic access mirrors the client rule in EntityProvider exactly: superadmin,
 * or an explicit relic_access flag. Anyone else is pinned to Wallflower RELIC,
 * so the assistant can never read or write Relic data on their behalf.
 */
export interface CallerContext {
  admin: SupabaseClient;      // service-role client (bypasses RLS)
  email: string;              // lowercased caller email
  member: TeamMember;         // their team_members row
  isAdmin: boolean;           // admin or superadmin
  hasRelicAccess: boolean;    // may operate in the Relic entity
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function identifyCaller(token: string | undefined): Promise<CallerContext> {
  const url = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) throw new AuthError("Assistant isn't configured on the server.", 500);
  if (!token) throw new AuthError("Unauthorized", 401);

  // Verify the session token → caller email.
  const authClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  const email = userData?.user?.email?.toLowerCase();
  if (userErr || !email) throw new AuthError("Unauthorized", 401);

  const admin = createClient(url, service);

  // The caller must be a known team member.
  const { data: settings } = await admin
    .from("settings")
    .select("team_members")
    .limit(1)
    .single();
  const members = (settings?.team_members || []) as TeamMember[];
  const member = members.find((m) => m.email?.toLowerCase() === email);
  if (!member) throw new AuthError("You don't have access to the assistant.", 403);

  const isAdmin = member.role === "superadmin" || member.role === "admin";
  const hasRelicAccess = member.role === "superadmin" || member.relic_access === true;

  return { admin, email, member, isAdmin, hasRelicAccess };
}
