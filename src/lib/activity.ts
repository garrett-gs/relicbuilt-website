import { axiom } from "./axiom-supabase";

type ActionType =
  | "created"
  | "updated"
  | "deleted"
  | "sent"
  | "converted"
  | "completed"
  | "signed"
  | "approved"
  | "rejected";

type EntityType =
  | "project"
  | "task"
  | "invoice"
  | "purchase_order"
  | "expense"
  | "customer"
  | "company"
  | "estimate"
  | "settings";

export async function logActivity({
  action,
  entity,
  entity_id,
  label,
  user_name,
  meta,
}: {
  action: ActionType;
  entity: EntityType;
  entity_id?: string;
  label: string;
  user_name?: string;
  meta?: Record<string, unknown>;
}) {
  await axiom.from("activity_log").insert({
    action,
    entity,
    entity_id,
    label,
    user_name,
    meta: meta || {},
  });
}
