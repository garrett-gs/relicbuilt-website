import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { axiomAdmin } from "@/lib/axiom-admin";
import { NextResponse } from "next/server";
import { TeamMember } from "@/types/axiom";

/**
 * Sessions for the PIN-gated /receipts app, which crew use on their phones
 * without an Axiom login. The PIN is checked here on the server (PINs never
 * reach the browser) and a signed, 12-hour session token comes back; every
 * receipts API call sends it as `x-receipts-session`. All reads and writes go
 * through the service-role client, so the page needs no anon-key access.
 */

const TTL_MS = 12 * 60 * 60 * 1000;
const HEADER = "x-receipts-session";

function signingKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  // Derived, so the service key itself never signs anything a browser holds.
  return createHmac("sha256", key).update("axiom-receipts-session-v1").digest("hex");
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", signingKey()).update(payload).digest("base64url");

export function receiptsDb(): SupabaseClient {
  return axiomAdmin();
}

export async function pinMembers(db: SupabaseClient): Promise<TeamMember[]> {
  const { data } = await db.from("settings").select("team_members").limit(1).single();
  return ((data?.team_members || []) as TeamMember[]).filter((m) => m.name && m.pin);
}

// ── Wrong-PIN throttle ──────────────────────────────────────────────
// A 4-digit PIN is guessable, so each name gets 5 tries, then a 15-minute
// lockout. Kept in memory: it slows guessing on each server instance, which is
// the most a PIN can offer; the real data access still needs the signed token.
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map<string, { count: number; until: number }>();

export function lockedOut(name: string, now = Date.now()): boolean {
  const f = fails.get(name.toLowerCase());
  return !!f && f.until > now;
}

export function recordPinResult(name: string, ok: boolean, now = Date.now()) {
  const key = name.toLowerCase();
  if (ok) return void fails.delete(key);
  const f = fails.get(key) ?? { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) {
    f.count = 0;
    f.until = now + LOCK_MS;
  }
  fails.set(key, f);
}

export function pinMatches(given: string, actual: string): boolean {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(actual));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueReceiptsSession(name: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ n: name, e: now + TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

/** The member name a session token was issued to, or null if invalid/expired. */
export function readReceiptsSession(token: string | null | undefined, now = Date.now()): string | null {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { n, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof n === "string" && typeof e === "number" && e > now ? n : null;
  } catch {
    return null;
  }
}

/**
 * Gate for receipts API routes. Returns the member's name and a service-role
 * client, or the 401 to send back. The member must still be on the team with a
 * PIN, so removing someone in Settings ends their session.
 */
export async function requireReceiptsSession(
  req: Request,
): Promise<{ name: string; db: SupabaseClient } | NextResponse> {
  const name = readReceiptsSession(req.headers.get(HEADER));
  if (!name) return NextResponse.json({ error: "Sign in with your PIN again." }, { status: 401 });
  const db = receiptsDb();
  const members = await pinMembers(db);
  if (!members.some((m) => m.name === name)) {
    return NextResponse.json({ error: "Sign in with your PIN again." }, { status: 401 });
  }
  return { name, db };
}

export const RECEIPTS_SESSION_HEADER = HEADER;
