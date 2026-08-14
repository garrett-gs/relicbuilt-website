// Write tools (Spec §3–§4, build steps 4-7): create_estimate, add_line_items,
// add_labor_items, replace_estimate_items, create_project,
// convert_estimate_to_project.
//
// A careful writer, not a general DB client. Every write replicates what the
// app does — document numbering (with 23505 retry), updated_at, activity
// logging — or it doesn't happen. Status changes are OUT of v1 (§7).

import { getClient } from "./supabase.js";
import { calcTotals, generateEstimateNumber, logActivity, stampUpdatedAt } from "./helpers.js";
import { ok, fail, notFound, type ToolDef } from "./tools.js";
import type { EstimateLineItem, EstimateLaborItem, ToolResult } from "./types.js";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const int = (v: unknown): number | undefined => {
  const n = num(v);
  return n === undefined ? undefined : Math.trunc(n);
};

const PROJECT_STATUS = ["new", "in_review", "quoted", "in_progress", "complete"] as const;

type Validated<T> = { ok: true; value: T } | { ok: false; err: string };

function validateLineItems(items: unknown): Validated<EstimateLineItem[]> {
  if (!Array.isArray(items)) return { ok: false, err: "items must be an array." };
  const out: EstimateLineItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Record<string, unknown>;
    if (typeof it?.item_number !== "string")
      return { ok: false, err: `items[${i}].item_number must be a string.` };
    if (typeof it?.description !== "string")
      return { ok: false, err: `items[${i}].description must be a string.` };
    if (typeof it?.quantity !== "number" || !Number.isFinite(it.quantity) || it.quantity < 0)
      return { ok: false, err: `items[${i}].quantity must be a non-negative finite number.` };
    if (typeof it?.unit_price !== "number" || !Number.isFinite(it.unit_price) || it.unit_price < 0)
      return { ok: false, err: `items[${i}].unit_price must be a non-negative finite number (dollars).` };
    if (typeof it?.unit !== "string" || it.unit.trim() === "")
      return { ok: false, err: `items[${i}].unit must be a non-empty string (e.g. ea, roll, ls, hr).` };
    out.push({
      item_number: it.item_number,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      unit: it.unit,
    });
  }
  return { ok: true, value: out };
}

function validateLaborItems(items: unknown): Validated<EstimateLaborItem[]> {
  if (!Array.isArray(items)) return { ok: false, err: "items must be an array." };
  const out: EstimateLaborItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Record<string, unknown>;
    if (typeof it?.description !== "string")
      return { ok: false, err: `items[${i}].description must be a string.` };
    if (typeof it?.hours !== "number" || !Number.isFinite(it.hours) || it.hours < 0)
      return { ok: false, err: `items[${i}].hours must be a non-negative finite number.` };
    if (typeof it?.rate !== "number" || !Number.isFinite(it.rate) || it.rate < 0)
      return { ok: false, err: `items[${i}].rate must be a non-negative finite number (dollars/hr).` };
    const expected = round2(it.hours * it.rate);
    // cost is stored directly, but must agree with hours × rate (§3).
    if (it.cost !== undefined) {
      if (typeof it.cost !== "number" || !Number.isFinite(it.cost))
        return { ok: false, err: `items[${i}].cost must be a finite number if provided.` };
      if (Math.abs(it.cost - expected) > 0.01)
        return {
          ok: false,
          err: `items[${i}].cost (${it.cost}) disagrees with hours × rate (${expected}). Provide a matching cost or omit it.`,
        };
    }
    out.push({ description: it.description, hours: it.hours, rate: it.rate, cost: expected });
  }
  return { ok: true, value: out };
}

async function readEstimate(id: string) {
  const client = await getClient();
  const { data, error } = await client.from("estimates").select("*").eq("id", id).maybeSingle();
  return { client, data, error };
}

function withTotals(row: Record<string, unknown>) {
  return { ...row, totals: calcTotals(row.line_items, row.labor_items, row.markup_percent) };
}

export const WRITE_TOOLS: ToolDef[] = [
  // --- Step 4 --------------------------------------------------------------
  {
    name: "create_estimate",
    description:
      "Create a new DRAFT estimate. Generates the estimate_number (EST-YYYY-NNNN). " +
      "Never set id, status, or estimate_number — they are generated. Returns the " +
      "row plus computed totals.",
    inputSchema: {
      type: "object",
      properties: {
        project_name: { type: "string" },
        client_name: { type: "string" },
        client_email: { type: "string" },
        client_phone: { type: "string" },
        customer_id: { type: "string", description: "Existing customer uuid." },
        custom_work_id: { type: "string", description: "Link to an existing project uuid." },
        unit_count: { type: "integer", description: "Job-level unit count (metadata)." },
        markup_percent: { type: "number", default: 0 },
        notes: { type: "string" },
      },
      required: ["project_name"],
      additionalProperties: false,
    },
    handler: async (args): Promise<ToolResult> => {
      const project_name = str(args.project_name);
      if (!project_name) return fail("project_name is required.");
      const markup = num(args.markup_percent) ?? 0;
      if (markup < 0) return fail("markup_percent cannot be negative.");
      const client = await getClient();
      const base = {
        project_name,
        client_name: str(args.client_name) ?? null,
        client_email: str(args.client_email) ?? null,
        client_phone: str(args.client_phone) ?? null,
        customer_id: str(args.customer_id) ?? null,
        custom_work_id: str(args.custom_work_id) ?? null,
        unit_count: int(args.unit_count) ?? null,
        markup_percent: markup,
        notes: str(args.notes) ?? null,
        status: "draft",
        line_items: [] as EstimateLineItem[],
        labor_items: [] as EstimateLaborItem[],
      };

      // estimate_number is unique with no DB sequence — retry on 23505.
      let lastErr: { code?: string; message?: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const estimate_number = await generateEstimateNumber(client);
        const { data, error } = await client
          .from("estimates")
          .insert({ ...base, estimate_number })
          .select()
          .single();
        if (!error && data) {
          await logActivity(client, {
            action: "created",
            entity: "estimate",
            entity_id: data.id,
            label: `Created estimate ${estimate_number}`,
            meta: { via: "create_estimate" },
          });
          return ok(withTotals(data));
        }
        lastErr = error;
        if (error?.code !== "23505") break; // only estimate_number collisions are retryable
      }
      if (lastErr?.code === "23505")
        return fail("Could not create estimate — estimate_number kept colliding after 3 attempts. Retry.");
      return fail(`Could not create estimate: ${lastErr?.message ?? "unknown error"}.`);
    },
  },

  // --- Step 5 --------------------------------------------------------------
  {
    name: "add_line_items",
    description:
      "Append material line items to an estimate. Each item: item_number, description, " +
      "quantity, unit_price (dollars), unit. Returns the updated estimate with recomputed totals.",
    inputSchema: {
      type: "object",
      properties: {
        estimate_id: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_number: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              unit: { type: "string" },
            },
            required: ["item_number", "description", "quantity", "unit_price", "unit"],
          },
        },
      },
      required: ["estimate_id", "items"],
      additionalProperties: false,
    },
    handler: async (args): Promise<ToolResult> => {
      const id = str(args.estimate_id);
      if (!id) return fail("estimate_id is required.");
      const v = validateLineItems(args.items);
      if (!v.ok) return fail(v.err);
      const { client, data, error } = await readEstimate(id);
      if (error) return fail(`Estimate lookup failed: ${error.message}`);
      if (!data) return notFound("estimate", `id "${id}"`);
      const merged = [...(Array.isArray(data.line_items) ? data.line_items : []), ...v.value];
      const { data: updated, error: upErr } = await client
        .from("estimates")
        .update({ line_items: merged, ...stampUpdatedAt() })
        .eq("id", id)
        .select()
        .single();
      if (upErr || !updated) return fail(`Update failed: ${upErr?.message ?? "no row returned"}`);
      await logActivity(client, {
        action: "updated",
        entity: "estimate",
        entity_id: id,
        label: `Added ${v.value.length} line item(s) to ${updated.estimate_number}`,
        meta: { via: "add_line_items", added: v.value.length },
      });
      return ok(withTotals(updated));
    },
  },

  {
    name: "add_labor_items",
    description:
      "Append labor items to an estimate. Each item: description, hours, rate (dollars/hr), " +
      "and optional cost — cost is stored server-computed as hours × rate and rejected if a " +
      "supplied cost disagrees by more than $0.01. Returns the updated estimate with totals.",
    inputSchema: {
      type: "object",
      properties: {
        estimate_id: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              hours: { type: "number" },
              rate: { type: "number" },
              cost: { type: "number", description: "Optional; must equal hours × rate if given." },
            },
            required: ["description", "hours", "rate"],
          },
        },
      },
      required: ["estimate_id", "items"],
      additionalProperties: false,
    },
    handler: async (args): Promise<ToolResult> => {
      const id = str(args.estimate_id);
      if (!id) return fail("estimate_id is required.");
      const v = validateLaborItems(args.items);
      if (!v.ok) return fail(v.err);
      const { client, data, error } = await readEstimate(id);
      if (error) return fail(`Estimate lookup failed: ${error.message}`);
      if (!data) return notFound("estimate", `id "${id}"`);
      const merged = [...(Array.isArray(data.labor_items) ? data.labor_items : []), ...v.value];
      const { data: updated, error: upErr } = await client
        .from("estimates")
        .update({ labor_items: merged, ...stampUpdatedAt() })
        .eq("id", id)
        .select()
        .single();
      if (upErr || !updated) return fail(`Update failed: ${upErr?.message ?? "no row returned"}`);
      await logActivity(client, {
        action: "updated",
        entity: "estimate",
        entity_id: id,
        label: `Added ${v.value.length} labor item(s) to ${updated.estimate_number}`,
        meta: { via: "add_labor_items", added: v.value.length },
      });
      return ok(withTotals(updated));
    },
  },

  {
    name: "replace_estimate_items",
    description:
      "Full replacement of line_items and/or labor_items (and optionally markup_percent) for a " +
      "revision. ONLY the arrays you explicitly provide are replaced — omitting an array leaves it " +
      "UNCHANGED (it does NOT clear it). Pass an empty array to intentionally clear one.",
    inputSchema: {
      type: "object",
      properties: {
        estimate_id: { type: "string" },
        line_items: { type: "array", description: "Omit to leave untouched; [] to clear." },
        labor_items: { type: "array", description: "Omit to leave untouched; [] to clear." },
        markup_percent: { type: "number" },
      },
      required: ["estimate_id"],
      additionalProperties: false,
    },
    handler: async (args): Promise<ToolResult> => {
      const id = str(args.estimate_id);
      if (!id) return fail("estimate_id is required.");

      const patch: Record<string, unknown> = { ...stampUpdatedAt() };
      if (args.line_items !== undefined) {
        const v = validateLineItems(args.line_items);
        if (!v.ok) return fail(v.err);
        patch.line_items = v.value;
      }
      if (args.labor_items !== undefined) {
        const v = validateLaborItems(args.labor_items);
        if (!v.ok) return fail(v.err);
        patch.labor_items = v.value;
      }
      if (args.markup_percent !== undefined) {
        const m = num(args.markup_percent);
        if (m === undefined || m < 0) return fail("markup_percent must be a non-negative number.");
        patch.markup_percent = m;
      }
      if (Object.keys(patch).length === 1) {
        return fail("Nothing to replace — provide line_items, labor_items, and/or markup_percent.");
      }

      const { client, data, error } = await readEstimate(id);
      if (error) return fail(`Estimate lookup failed: ${error.message}`);
      if (!data) return notFound("estimate", `id "${id}"`);
      const { data: updated, error: upErr } = await client
        .from("estimates")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (upErr || !updated) return fail(`Update failed: ${upErr?.message ?? "no row returned"}`);
      await logActivity(client, {
        action: "updated",
        entity: "estimate",
        entity_id: id,
        label: `Revised items on ${updated.estimate_number}`,
        meta: {
          via: "replace_estimate_items",
          replaced: Object.keys(patch).filter((k) => k !== "updated_at"),
        },
      });
      return ok(withTotals(updated));
    },
  },

  // --- Step 6 --------------------------------------------------------------
  {
    name: "create_project",
    description:
      "Create a project (custom_work). status defaults to 'new'. Portal and proposal fields are " +
      "not settable here (they gate external access — set them in the UI).",
    inputSchema: {
      type: "object",
      properties: {
        project_name: { type: "string" },
        client_name: { type: "string" },
        client_email: { type: "string" },
        client_phone: { type: "string" },
        customer_id: { type: "string" },
        project_description: { type: "string" },
        status: { type: "string", enum: [...PROJECT_STATUS] },
        quoted_amount: { type: "number", description: "Dollars." },
        unit_count: { type: "integer" },
        start_date: { type: "string", description: "ISO date (YYYY-MM-DD)." },
        due_date: { type: "string", description: "ISO date (YYYY-MM-DD)." },
        internal_notes: { type: "string" },
      },
      required: ["project_name"],
      additionalProperties: false,
    },
    handler: async (args): Promise<ToolResult> => {
      const project_name = str(args.project_name);
      if (!project_name) return fail("project_name is required.");
      const status = str(args.status) ?? "new";
      if (!PROJECT_STATUS.includes(status as (typeof PROJECT_STATUS)[number]))
        return fail(`status must be one of: ${PROJECT_STATUS.join(", ")}.`);
      const quoted = num(args.quoted_amount);
      if (quoted !== undefined && quoted < 0) return fail("quoted_amount cannot be negative.");

      const client = await getClient();
      const { data, error } = await client
        .from("custom_work")
        .insert({
          project_name,
          client_name: str(args.client_name) ?? null,
          client_email: str(args.client_email) ?? null,
          client_phone: str(args.client_phone) ?? null,
          customer_id: str(args.customer_id) ?? null,
          project_description: str(args.project_description) ?? null,
          status,
          quoted_amount: quoted ?? 0,
          unit_count: int(args.unit_count) ?? null,
          start_date: str(args.start_date) ?? null,
          due_date: str(args.due_date) ?? null,
          internal_notes: str(args.internal_notes) ?? null,
        })
        .select()
        .single();
      if (error || !data) return fail(`Could not create project: ${error?.message ?? "no row returned"}`);
      await logActivity(client, {
        action: "created",
        entity: "custom_work",
        entity_id: data.id,
        label: `Created project ${project_name}`,
        meta: { via: "create_project" },
      });
      return ok(data);
    },
  },

  // --- Step 7 --------------------------------------------------------------
  {
    name: "convert_estimate_to_project",
    description:
      "Create a project from an estimate and link them. Two writes, not atomic: if linking fails " +
      "after the project is created, the error names the orphan project (it is NOT auto-deleted). " +
      "Refuses if the estimate is already linked, returning the existing project.",
    inputSchema: {
      type: "object",
      properties: { estimate_id: { type: "string" } },
      required: ["estimate_id"],
      additionalProperties: false,
    },
    handler: async (args): Promise<ToolResult> => {
      const id = str(args.estimate_id);
      if (!id) return fail("estimate_id is required.");
      const { client, data: est, error } = await readEstimate(id);
      if (error) return fail(`Estimate lookup failed: ${error.message}`);
      if (!est) return notFound("estimate", `id "${id}"`);

      // Refuse to create a second project — return the existing one.
      if (est.custom_work_id) {
        const { data: existing } = await client
          .from("custom_work")
          .select("*")
          .eq("id", est.custom_work_id)
          .maybeSingle();
        return ok({
          already_linked: true,
          message: `Estimate ${est.estimate_number} is already linked to project ${est.custom_work_id}. Returning the existing project.`,
          project: existing ?? { id: est.custom_work_id },
        });
      }

      const total = calcTotals(est.line_items, est.labor_items, est.markup_percent).total;

      // Step 2: create the project.
      const { data: project, error: projErr } = await client
        .from("custom_work")
        .insert({
          project_name: est.project_name ?? "Untitled Project",
          client_name: est.client_name ?? null,
          client_email: est.client_email ?? null,
          client_phone: est.client_phone ?? null,
          customer_id: est.customer_id ?? null,
          unit_count: est.unit_count ?? null,
          quoted_amount: total,
          status: "new",
        })
        .select()
        .single();
      if (projErr || !project)
        return fail(`Could not create project from estimate: ${projErr?.message ?? "no row returned"}`);

      // Step 3: link the estimate. Non-atomic — surface an orphan clearly.
      const { error: linkErr } = await client
        .from("estimates")
        .update({ custom_work_id: project.id, ...stampUpdatedAt() })
        .eq("id", id);
      if (linkErr) {
        return fail(
          `Project ${project.id} was created, but linking estimate ${id} to it FAILED ` +
            `(${linkErr.message}). The estimate is still unlinked and the project was NOT deleted. ` +
            `Fix by setting estimates.custom_work_id = "${project.id}" for estimate ${id}.`,
        );
      }

      await logActivity(client, {
        action: "created",
        entity: "custom_work",
        entity_id: project.id,
        label: `Converted estimate ${est.estimate_number} to project (quoted ${total})`,
        meta: { via: "convert_estimate_to_project", estimate_id: id, quoted_amount: total },
      });
      return ok({ linked: true, estimate_id: id, quoted_amount: total, project });
    },
  },
];
