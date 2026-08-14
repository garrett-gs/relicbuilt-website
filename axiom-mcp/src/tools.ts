// Read-only tools (Spec §3–§4, build step 3): get_estimate, list_estimates,
// get_project. No writes. Each read computes totals via calcTotals and includes
// them, and distinguishes an RLS denial from a genuinely missing row (§5).

import { getClient } from "./supabase.js";
import { calcTotals } from "./helpers.js";
import type { ToolResult } from "./types.js";

export function ok(obj: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// Under RLS, a denied read returns empty — identical to not-found through
// PostgREST. Say so explicitly rather than asserting the record is absent.
export function notFound(kind: string, ref: string): ToolResult {
  return fail(
    `No ${kind} found for ${ref}. If you expected one, this may be a ` +
      `row-level-security denial rather than a missing row — PostgREST returns ` +
      `the same empty result for both.`,
  );
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export const TOOLS: ToolDef[] = [
  {
    name: "get_estimate",
    description:
      "Fetch a single estimate by estimate_id (uuid) or estimate_number " +
      "(e.g. EST-2026-0001). Returns the full row plus computed totals " +
      "(materialTotal, laborTotal, subtotal, markupAmount, total, margin_percent). Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        estimate_id: { type: "string", description: "Estimate UUID." },
        estimate_number: {
          type: "string",
          description: "Human-readable number, e.g. EST-2026-0001.",
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const estimateId = typeof args.estimate_id === "string" ? args.estimate_id : undefined;
      const estimateNumber =
        typeof args.estimate_number === "string" ? args.estimate_number : undefined;
      if (!estimateId && !estimateNumber) {
        return fail("Provide either estimate_id or estimate_number.");
      }
      const client = await getClient();
      let query = client.from("estimates").select("*").limit(1);
      query = estimateId
        ? query.eq("id", estimateId)
        : query.eq("estimate_number", estimateNumber as string);
      const { data, error } = await query.maybeSingle();
      if (error) return fail(`Estimate query failed: ${error.message}`);
      if (!data) {
        return notFound(
          "estimate",
          estimateId ? `id "${estimateId}"` : `number "${estimateNumber}"`,
        );
      }
      const totals = calcTotals(data.line_items, data.labor_items, data.markup_percent);
      return ok({ ...data, totals });
    },
  },

  {
    name: "list_estimates",
    description:
      "List estimates, newest first. Optional filters: status, client_name " +
      "(partial match), custom_work_id. Returns summary rows each with a " +
      "computed total. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["draft", "sent", "accepted", "rejected"],
          description: "Exact status filter.",
        },
        client_name: { type: "string", description: "Partial, case-insensitive match." },
        custom_work_id: { type: "string", description: "Filter to one project (uuid)." },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 20,
          description: "Max rows (default 20, cap 50).",
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const client = await getClient();
      const limit = Math.min(Math.max(1, Number(args.limit) || 20), 50);
      let query = client
        .from("estimates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (typeof args.status === "string") query = query.eq("status", args.status);
      if (typeof args.custom_work_id === "string")
        query = query.eq("custom_work_id", args.custom_work_id);
      if (typeof args.client_name === "string")
        query = query.ilike("client_name", `%${args.client_name}%`);

      const { data, error } = await query;
      if (error) return fail(`Estimate list query failed: ${error.message}`);

      const rows = (data ?? []).map((e: Record<string, unknown>) => ({
        id: e.id,
        estimate_number: e.estimate_number,
        project_name: e.project_name,
        client_name: e.client_name,
        status: e.status,
        custom_work_id: e.custom_work_id,
        created_at: e.created_at,
        total: calcTotals(e.line_items, e.labor_items, e.markup_percent).total,
      }));
      return ok({ count: rows.length, estimates: rows });
    },
  },

  {
    name: "get_project",
    description:
      "Fetch a project (custom_work) by id, with its estimates embedded. Each " +
      "embedded estimate carries computed totals. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project (custom_work) UUID." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const id = typeof args.id === "string" ? args.id : undefined;
      if (!id) return fail("Provide id (project uuid).");
      const client = await getClient();
      const { data, error } = await client
        .from("custom_work")
        .select("*, estimates(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) return fail(`Project query failed: ${error.message}`);
      if (!data) return notFound("project", `id "${id}"`);

      const estimates = Array.isArray(data.estimates)
        ? data.estimates.map((e: Record<string, unknown>) => ({
            ...e,
            totals: calcTotals(e.line_items, e.labor_items, e.markup_percent),
          }))
        : [];
      return ok({ ...data, estimates });
    },
  },
];
