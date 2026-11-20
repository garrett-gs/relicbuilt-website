// Notes tools (phone workflow): add_note, find_records, list_notes.
//
// Mirrors the app's Notes feature (src/app/axiom/notes/page.tsx +
// RecordNotesPanel.tsx). A note lives in the `notes` table and can be tagged to
// exactly one record via an explicit FK column — custom_work_id (project),
// estimate_id (quote), or work_order_id (order). The acting workspace comes from
// AXIOM_TENANT (same header the web app sends); the note's `entity` is set to it
// so it shows on that side's Notes page. A note added here appears in the feed
// and on the record's Notes tab; it is NEVER client-facing.

import { getClient, mcpTenantSlug, mcpUserEmail } from "./supabase.js";
import { logActivity } from "./helpers.js";
import { ok, fail, type ToolDef } from "./tools.js";
import type { ToolResult } from "./types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

type RecordType = "project" | "quote" | "order";

const RECORD_COLUMN: Record<RecordType, "custom_work_id" | "estimate_id" | "work_order_id"> = {
  project: "custom_work_id",
  quote: "estimate_id",
  order: "work_order_id",
};

interface RecordHit {
  type: RecordType;
  id: string;
  name: string;
  num?: string;
  client?: string;
}

// The note's `entity` follows the workspace this server acts in. AXIOM_TENANT is
// always a BusinessEntity slug (wallflower_relic | relic).
function actingEntity(): string {
  return mcpTenantSlug();
}

// Escape PostgREST .or() reserved characters in user input.
function sanitize(q: string): string {
  return q.replace(/[(),]/g, " ").trim();
}

/**
 * Search projects / quotes / orders for a free-text term (name or number).
 * Filtered to the acting workspace: custom_work and estimates carry an `entity`
 * column (and are tenant-scoped under RLS); wallflower_work_orders is scoped by
 * RLS only. Returns a flat, ranked-by-recency list.
 */
async function searchRecords(
  client: SupabaseClient,
  query: string,
  type: RecordType | undefined,
  limit: number,
): Promise<RecordHit[]> {
  const entity = actingEntity();
  const q = sanitize(query);
  const like = `%${q}%`;
  const want = (t: RecordType) => !type || type === t;
  const hits: RecordHit[] = [];

  if (want("project")) {
    let pq = client
      .from("custom_work")
      .select("id, project_name, client_name")
      .eq("entity", entity)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (q) pq = pq.or(`project_name.ilike.${like},client_name.ilike.${like}`);
    const { data } = await pq;
    (data || []).forEach((r: { id: string; project_name?: string; client_name?: string }) =>
      hits.push({ type: "project", id: r.id, name: r.project_name || "Untitled project", client: r.client_name || undefined }));
  }

  if (want("quote")) {
    let qq = client
      .from("estimates")
      .select("id, estimate_number, project_name, client_name")
      .eq("entity", entity)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (q) qq = qq.or(`project_name.ilike.${like},estimate_number.ilike.${like},client_name.ilike.${like}`);
    const { data } = await qq;
    (data || []).forEach((r: { id: string; estimate_number?: string; project_name?: string; client_name?: string }) =>
      hits.push({ type: "quote", id: r.id, name: r.project_name || r.estimate_number || "Quote", num: r.estimate_number || undefined, client: r.client_name || undefined }));
  }

  if (want("order")) {
    let oq = client
      .from("wallflower_work_orders")
      .select("id, item_name, wallflower_order_number")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (q) oq = oq.or(`item_name.ilike.${like},wallflower_order_number.ilike.${like}`);
    const { data } = await oq;
    (data || []).forEach((r: { id: string; item_name?: string; wallflower_order_number?: string }) =>
      hits.push({ type: "order", id: r.id, name: r.item_name || "Work order", num: r.wallflower_order_number || undefined }));
  }

  return hits;
}

export const NOTE_TOOLS: ToolDef[] = [
  {
    name: "add_note",
    description:
      "Add a note to Axiom (the shop notebook). Optionally tag it to ONE record " +
      "so it also shows on that record's Notes tab: pass an explicit project_id / " +
      "quote_id / order_id (uuid), OR a free-text `record` (name or number) which " +
      "is resolved to a project, quote, or order. If `record` matches more than one, " +
      "the matches are returned instead of guessing — re-call with the chosen id. " +
      "Notes are internal only and never shown to clients. Acts in the AXIOM_TENANT " +
      "workspace. Use this to jot something down when away from Axiom.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The note body (required)." },
        title: { type: "string", description: "Optional short title/subject." },
        shared: { type: "boolean", default: false, description: "Also visible to the other Axiom side. Default false (private to this workspace). Never client-facing either way." },
        record: { type: "string", description: "Free-text record to tag: a project/quote/order name or number (e.g. 'Escort Wall', 'EST-2026-0007'). Resolved to one record." },
        record_type: { type: "string", enum: ["project", "quote", "order"], description: "Narrow the `record` search to one kind." },
        project_id: { type: "string", description: "Tag to this project (custom_work uuid)." },
        quote_id: { type: "string", description: "Tag to this quote/estimate (uuid)." },
        order_id: { type: "string", description: "Tag to this work order (uuid)." },
      },
      required: ["text"],
      additionalProperties: false,
    },
    handler: async (args): Promise<ToolResult> => {
      const text = str(args.text);
      if (!text) return fail("text is required (the note body).");
      const title = str(args.title);
      const shared = args.shared === true;

      const client = await getClient();

      // Resolve the (optional) tagged record. Explicit id wins; else search.
      const explicit: Array<[RecordType, string | undefined]> = [
        ["project", str(args.project_id)],
        ["quote", str(args.quote_id)],
        ["order", str(args.order_id)],
      ];
      const givenIds = explicit.filter(([, id]) => id);
      if (givenIds.length > 1) return fail("Tag only one record: pass just one of project_id, quote_id, or order_id.");

      let tag: { type: RecordType; id: string; label?: string } | null = null;

      if (givenIds.length === 1) {
        const [type, id] = givenIds[0];
        tag = { type, id: id as string };
      } else if (str(args.record)) {
        const recordType = str(args.record_type) as RecordType | undefined;
        const hits = await searchRecords(client, str(args.record) as string, recordType, 8);
        if (hits.length === 0) {
          return fail(
            `No project, quote, or order matches "${str(args.record)}"${recordType ? ` (type ${recordType})` : ""}. ` +
              `Check the name/number, or call find_records to browse.`,
          );
        }
        if (hits.length > 1) {
          return ok({
            needs_disambiguation: true,
            message: `"${str(args.record)}" matches ${hits.length} records. Re-call add_note with the chosen id (project_id/quote_id/order_id), or a more specific record/record_type.`,
            matches: hits,
          });
        }
        tag = { type: hits[0].type, id: hits[0].id, label: hits[0].name };
      }

      const recordCols: Record<string, string | null> = {
        custom_work_id: null,
        estimate_id: null,
        work_order_id: null,
      };
      if (tag) recordCols[RECORD_COLUMN[tag.type]] = tag.id;

      const row = {
        entity: actingEntity(),
        title: title ?? null,
        body: text,
        shared,
        created_by: mcpUserEmail(),
        ...recordCols,
      };

      const { data, error } = await client.from("notes").insert(row).select().single();
      if (error) {
        // Most likely cause if estimate_id/work_order_id is rejected: migration
        // v52 hasn't been applied yet.
        return fail(`Could not add the note: ${error.message}`);
      }

      await logActivity(client, {
        action: "created",
        entity: "note",
        entity_id: data.id,
        label: tag ? `Added note on ${tag.type}${tag.label ? ` "${tag.label}"` : ""} (via Claude)` : "Added note (via Claude)",
        meta: tag ? { note_record_type: tag.type, note_record_id: tag.id } : {},
      });

      return ok({
        added: true,
        note: { id: data.id, title: data.title, body: data.body, shared: data.shared, created_at: data.created_at },
        tagged_to: tag ? { type: tag.type, id: tag.id, label: tag.label } : null,
        workspace: actingEntity(),
      });
    },
  },

  {
    name: "find_records",
    description:
      "Search projects, quotes, and work orders by name or number, to get the id " +
      "to tag a note to (or just to look one up). Returns matches with type, id, " +
      "name, and number. Read-only. Acts in the AXIOM_TENANT workspace.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or number to search for. Omit to list the most recent of each type." },
        type: { type: "string", enum: ["project", "quote", "order"], description: "Limit to one kind." },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10, description: "Max per type (default 10, cap 25)." },
      },
      additionalProperties: false,
    },
    handler: async (args): Promise<ToolResult> => {
      const client = await getClient();
      const limit = Math.min(Math.max(1, Number(args.limit) || 10), 25);
      const type = str(args.type) as RecordType | undefined;
      const hits = await searchRecords(client, str(args.query) || "", type, limit);
      return ok({ count: hits.length, records: hits });
    },
  },

  {
    name: "list_notes",
    description:
      "List recent notes, newest first. Optionally filter to one record by passing " +
      "project_id, quote_id, or order_id. Read-only. Acts in the AXIOM_TENANT workspace.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Only notes tagged to this project (uuid)." },
        quote_id: { type: "string", description: "Only notes tagged to this quote (uuid)." },
        order_id: { type: "string", description: "Only notes tagged to this order (uuid)." },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20, description: "Max rows (default 20, cap 50)." },
      },
      additionalProperties: false,
    },
    handler: async (args): Promise<ToolResult> => {
      const client = await getClient();
      const limit = Math.min(Math.max(1, Number(args.limit) || 20), 50);
      const entity = actingEntity();

      let query = client
        .from("notes")
        .select("id, title, body, shared, entity, created_by, created_at, custom_work_id, estimate_id, work_order_id")
        .order("created_at", { ascending: false })
        .limit(limit);

      const pid = str(args.project_id), qid = str(args.quote_id), oid = str(args.order_id);
      if (pid) query = query.eq("custom_work_id", pid);
      else if (qid) query = query.eq("estimate_id", qid);
      else if (oid) query = query.eq("work_order_id", oid);
      else query = query.or(`entity.eq.${entity},shared.eq.true`);

      const { data, error } = await query;
      if (error) return fail(`Notes query failed: ${error.message}`);

      const rows = (data || []).map((n: Record<string, unknown>) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        shared: n.shared,
        created_by: n.created_by,
        created_at: n.created_at,
        tagged_to: n.custom_work_id
          ? { type: "project", id: n.custom_work_id }
          : n.estimate_id
            ? { type: "quote", id: n.estimate_id }
            : n.work_order_id
              ? { type: "order", id: n.work_order_id }
              : null,
      }));
      return ok({ count: rows.length, notes: rows });
    },
  },
];
