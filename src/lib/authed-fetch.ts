import { axiom } from "@/lib/axiom-supabase";

/**
 * fetch() for Axiom's internal API routes: adds the signed-in user's session
 * token, which those routes require (see requireTeamMember). getSession()
 * refreshes an expired token first.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await axiom.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}

/**
 * Open the signed audit-trail PDF for an estimate in a new tab. The route needs
 * the session token, which a plain link can't send, so the PDF is fetched here
 * and handed to the tab. The tab opens first, inside the click, so pop-up
 * blockers allow it.
 */
export async function openAuditTrail(estimateId: string): Promise<void> {
  const tab = window.open("", "_blank");
  const res = await authedFetch(`/api/audit-trail/${estimateId}`);
  if (!res.ok) {
    tab?.close();
    const body = await res.json().catch(() => ({}));
    alert(body.error || "Couldn't load the audit trail.");
    return;
  }
  const url = URL.createObjectURL(await res.blob());
  if (tab) tab.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
