import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Audit-trail event types for the proposal lifecycle.
 *
 * - sent: Garrett (or another team member) sent the proposal email
 * - viewed: client opened /proposal/[token] in their browser
 * - signed: client typed their name and clicked Accept
 * - deposit_paid: deposit invoice was paid (Stripe or manual)
 * - resent: proposal was re-sent (email re-fired)
 * - voided: proposal was canceled / superseded
 */
export type ProposalEventType =
  | "sent"
  | "viewed"
  | "signed"
  | "deposit_paid"
  | "resent"
  | "voided";

export interface LogProposalEventArgs {
  supabase: SupabaseClient;
  estimateId: string;
  eventType: ProposalEventType;
  signerName?: string | null;
  signerEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  documentHash?: string | null;
  documentSnapshotUrl?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Insert an audit event for a proposal/estimate. Failures are non-fatal —
 * we always log to console so an audit logging hiccup never blocks the
 * actual business action.
 */
export async function logProposalEvent({
  supabase,
  estimateId,
  eventType,
  signerName,
  signerEmail,
  ipAddress,
  userAgent,
  documentHash,
  documentSnapshotUrl,
  metadata,
}: LogProposalEventArgs): Promise<void> {
  try {
    const { error } = await supabase.from("proposal_audit_events").insert({
      estimate_id: estimateId,
      event_type: eventType,
      signer_name: signerName || null,
      signer_email: signerEmail || null,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      document_hash: documentHash || null,
      document_snapshot_url: documentSnapshotUrl || null,
      metadata: metadata || {},
    });
    if (error) console.error("[audit] insert failed:", error.message);
  } catch (err) {
    console.error("[audit] unexpected error:", err);
  }
}

/**
 * Pull the client IP from common reverse-proxy headers in priority order.
 * Vercel sets x-forwarded-for, fly sets fly-client-ip, etc.
 */
export function ipFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP if there's a comma-separated chain
    return forwarded.split(",")[0].trim();
  }
  return (
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    headers.get("fly-client-ip") ||
    "unknown"
  );
}

/**
 * SHA-256 hex digest of a string. Used to fingerprint the document content
 * at the moment of signing so we can verify later that nothing was altered.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
