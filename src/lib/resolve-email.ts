// Look up the best-available client email for a record by walking back
// through linked entities. Saves the user from re-typing an email into a
// "Send to" field when the email is already on the linked customer,
// estimate, or project.
//
// Priority is direct → most-likely-up-to-date:
//   1. The record's own client_email, if set.
//   2. customers.email via customer_id, if linked.
//   3. estimate.client_email via estimate_id, if linked.
//   4. estimate.customer_id → customers.email.
//   5. custom_work.client_email via custom_work_id, if linked.
//   6. custom_work.customer_id → customers.email.
// Returns "" if nothing turns up.

import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailRefs = {
  client_email?: string | null;
  customer_id?: string | null;
  estimate_id?: string | null;
  custom_work_id?: string | null;
};

export async function resolveClientEmail(
  db: SupabaseClient,
  refs: EmailRefs
): Promise<string> {
  const direct = (refs.client_email || "").trim();
  if (direct) return direct;

  if (refs.customer_id) {
    const { data } = await db
      .from("customers")
      .select("email")
      .eq("id", refs.customer_id)
      .maybeSingle();
    const email = (data?.email || "").trim();
    if (email) return email;
  }

  if (refs.estimate_id) {
    const { data } = await db
      .from("estimates")
      .select("client_email, customer_id")
      .eq("id", refs.estimate_id)
      .maybeSingle();
    const estEmail = (data?.client_email || "").trim();
    if (estEmail) return estEmail;
    if (data?.customer_id) {
      const { data: cust } = await db
        .from("customers")
        .select("email")
        .eq("id", data.customer_id)
        .maybeSingle();
      const custEmail = (cust?.email || "").trim();
      if (custEmail) return custEmail;
    }
  }

  if (refs.custom_work_id) {
    const { data } = await db
      .from("custom_work")
      .select("client_email, customer_id")
      .eq("id", refs.custom_work_id)
      .maybeSingle();
    const cwEmail = (data?.client_email || "").trim();
    if (cwEmail) return cwEmail;
    if (data?.customer_id) {
      const { data: cust } = await db
        .from("customers")
        .select("email")
        .eq("id", data.customer_id)
        .maybeSingle();
      const custEmail = (cust?.email || "").trim();
      if (custEmail) return custEmail;
    }
  }

  return "";
}
