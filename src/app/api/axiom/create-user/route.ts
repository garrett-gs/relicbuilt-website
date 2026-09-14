import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Create a Supabase Auth login for a new team member from inside Axiom.
 * Server-side because creating users needs the service-role key (admin API).
 * Admin-gated: the caller must pass their Axiom session token and be an
 * admin/superadmin in settings.team_members. This only creates the LOGIN —
 * the Settings UI records the team_members row (single writer for settings).
 *
 * POST /api/axiom/create-user  { email, password }
 */
export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!service) {
      return NextResponse.json({ error: "Server isn't configured to add users." }, { status: 500 });
    }

    // Identify the caller from their session token.
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    const callerEmail = userData?.user?.email?.toLowerCase();
    if (userErr || !callerEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(url, service);

    // Only admins/superadmins may add users.
    const { data: settings } = await admin.from("settings").select("team_members").limit(1).single();
    const members = (settings?.team_members || []) as Array<{ email?: string; role?: string }>;
    const caller = members.find((m) => m.email?.toLowerCase() === callerEmail);
    if (!caller || (caller.role !== "superadmin" && caller.role !== "admin")) {
      return NextResponse.json({ error: "Only admins can add users." }, { status: 403 });
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const { error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no confirmation email needed; they can log in right away
    });
    if (cErr) {
      // Surfaces "A user with this email address has already been registered", etc.
      return NextResponse.json({ error: cErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[create-user] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
