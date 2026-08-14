// Connection + auth with session refresh (Spec §1, build step 1).
//
// Authenticate as a dedicated Axiom user via signInWithPassword and act as
// `authenticated` under RLS — NOT the service-role key. Refresh on expiry;
// fail closed with a clear error (that never leaks env values) if sign-in
// fails.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable ${name}. Set the four AXIOM_ variables (see .env.example).`,
    );
  }
  return v;
}

export function mcpUserEmail(): string {
  return required("AXIOM_MCP_USER_EMAIL");
}

/**
 * Returns a signed-in Supabase client for the Axiom project, ensuring the
 * session is valid before every use. Signs in on first call and re-signs (or
 * refreshes) when the token is within 60s of expiry.
 */
export async function getClient(): Promise<SupabaseClient> {
  if (!client) {
    const url = required("AXIOM_SUPABASE_URL");
    const key = required("AXIOM_SUPABASE_ANON_KEY");
    client = createClient(url, key, {
      auth: {
        persistSession: false, // stdio process; keep the session in memory only
        autoRefreshToken: true,
      },
    });
  }
  await ensureSession(client);
  return client;
}

async function ensureSession(c: SupabaseClient): Promise<void> {
  const { data } = await c.auth.getSession();
  const session = data.session;
  const skewMs = 60_000; // treat a token expiring within 60s as stale

  if (session?.expires_at && session.expires_at * 1000 - Date.now() > skewMs) {
    return; // still valid
  }

  if (session) {
    const { data: refreshed, error } = await c.auth.refreshSession();
    if (!error && refreshed.session) return;
    // fall through to a fresh sign-in if refresh failed
  }

  await signIn(c);
}

async function signIn(c: SupabaseClient): Promise<void> {
  const email = required("AXIOM_MCP_USER_EMAIL");
  const password = required("AXIOM_MCP_USER_PASSWORD");
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) {
    // Fail closed. Do not include the email or password in the message.
    throw new Error(
      "The Axiom MCP user could not sign in. Verify AXIOM_MCP_USER_EMAIL and " +
        "AXIOM_MCP_USER_PASSWORD are correct and the account exists in the " +
        "Axiom Supabase project.",
    );
  }
}
