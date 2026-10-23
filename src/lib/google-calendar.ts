// Minimal, dependency-free Google Calendar client using a service account.
// Signs a JWT with the SA private key (RS256), exchanges it for an access
// token, and calls the Calendar v3 REST API. Used to push Axiom's build
// schedule into a dedicated Google calendar so it stays live (no subscription
// refresh lag). Credentials come from env; absent them the caller no-ops.

import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_API = "https://www.googleapis.com/calendar/v3";
// Full calendar scope so we can also (best-effort) keep the calendar's name in
// sync — "Axiom-<Business Name>". Falls back silently to event-only behavior
// if the service account is only granted "make changes to events".
const SCOPE = "https://www.googleapis.com/auth/calendar";

let cachedToken: { token: string; expMs: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Whether the service-account credentials are present. */
export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_SA_CLIENT_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expMs > Date.now() + 60_000) return cachedToken.token;

  const email = process.env.GOOGLE_SA_CLIENT_EMAIL!;
  // Env stores the PEM with literal "\n" — restore real newlines.
  const key = (process.env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat, exp }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  signer.end();
  const sig = b64url(signer.sign(key));
  const jwt = `${header}.${claim}.${sig}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  cachedToken = { token: json.access_token, expMs: Date.now() + (json.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

export interface GCalEvent {
  id?: string;
  summary?: string;
  description?: string;
  start?: { date?: string };
  end?: { date?: string };
  status?: string;
  transparency?: string;
  extendedProperties?: { private?: Record<string, string> };
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${CAL_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

/** Every Axiom-managed event on a calendar (tagged axiomSource=build), paged. */
export async function listAxiomEvents(calendarId: string): Promise<GCalEvent[]> {
  const out: GCalEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      privateExtendedProperty: "axiomSource=build",
      maxResults: "2500",
      showDeleted: "false",
      singleEvents: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await api(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
    if (!res.ok) throw new Error(`list ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    for (const e of json.items || []) out.push(e as GCalEvent);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * Best-effort: keep the calendar's display name as "Axiom-<Business>". Requires
 * the service account to have "make changes and manage sharing" on the calendar;
 * if it only has event access the PATCH 403s, which we swallow (the owner's
 * manual name then stands).
 */
export async function ensureCalendarName(calendarId: string, name: string): Promise<boolean> {
  try {
    const res = await api(`/calendars/${encodeURIComponent(calendarId)}`, { method: "PATCH", body: JSON.stringify({ summary: name }) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function insertEvent(calendarId: string, ev: GCalEvent): Promise<void> {
  const res = await api(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: JSON.stringify(ev) });
  if (!res.ok) throw new Error(`insert ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function updateEvent(calendarId: string, id: string, ev: GCalEvent): Promise<void> {
  const res = await api(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(ev) });
  if (!res.ok) throw new Error(`update ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function deleteEvent(calendarId: string, id: string): Promise<void> {
  const res = await api(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, { method: "DELETE" });
  // 410/404 = already gone; treat as success.
  if (!res.ok && res.status !== 410 && res.status !== 404) throw new Error(`delete ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
