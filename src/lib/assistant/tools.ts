import { SupabaseClient } from "@supabase/supabase-js";
import { BusinessEntity } from "@/types/axiom";

/**
 * Whitelisted operations the Axiom Assistant may perform. This file is the
 * assistant's entire capability surface — it can do nothing that isn't defined
 * here. Nothing here touches code, schema, or settings structure.
 *
 * Each tool is either "read" (auto-runs) or "write" (pauses for confirmation).
 * Entity-scoped tables always get ctx.entity set/filtered so Wallflower RELIC
 * and Relic data never mix. Tables without an entity column (tasks, work
 * orders, inventory) are shared, matching the rest of the app.
 */

export interface ToolCtx {
  admin: SupabaseClient;
  entity: BusinessEntity;
  email: string;
  hasRelicAccess: boolean;
}

export type ToolResult = { ok: true; data?: unknown } | { ok: false; error: string };

type Kind = "read" | "write";
type Risk = "money" | "outbound" | "normal";

// ── small input accessors ────────────────────────────────────────────────────
type In = Record<string, unknown>;
const str = (o: In, k: string): string | undefined => {
  const v = o[k];
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return undefined;
};
const num = (o: In, k: string): number | undefined => {
  const v = o[k];
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return undefined;
};

async function logActivity(
  ctx: ToolCtx,
  a: { action: string; entity: string; entity_id?: string; label: string; meta?: In }
) {
  try {
    await ctx.admin.from("activity_log").insert({
      action: a.action,
      entity: a.entity,
      entity_id: a.entity_id,
      label: a.label,
      user_name: `${ctx.email} (assistant)`,
      meta: a.meta || {},
    });
  } catch {
    /* activity logging is best-effort */
  }
}

// ── tool metadata ────────────────────────────────────────────────────────────
const KIND: Record<string, Kind> = {
  find_customers: "read",
  find_companies: "read",
  list_work_orders: "read",
  find_estimates: "read",
  find_invoices: "read",
  list_tasks: "read",
  list_inventory: "read",
  list_expenses: "read",
  create_customer: "write",
  update_customer: "write",
  create_company: "write",
  create_task: "write",
  update_task: "write",
  create_work_order: "write",
  update_work_order: "write",
  create_estimate: "write",
  update_estimate: "write",
  create_invoice: "write",
  record_invoice_payment: "write",
  create_expense: "write",
  add_inventory_item: "write",
  adjust_inventory: "write",
};

const RISK: Record<string, Risk> = {
  create_estimate: "money",
  update_estimate: "money",
  create_invoice: "money",
  record_invoice_payment: "money",
  create_expense: "money",
};

export function toolKind(name: string): Kind | undefined {
  return KIND[name];
}
export function toolRisk(name: string): Risk {
  return RISK[name] || "normal";
}

// ── tool schemas sent to the model ───────────────────────────────────────────
export const TOOLS = [
  {
    name: "find_customers",
    description: "Search customers/contacts in the current workspace by name, email, or phone. Returns matches with their id.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Name, email, or phone fragment. Omit to list recent." } } },
  },
  {
    name: "find_companies",
    description: "Search companies in the current workspace by name.",
    input_schema: { type: "object", properties: { query: { type: "string" } } },
  },
  {
    name: "list_work_orders",
    description: "List work orders, optionally filtered by column status: pending (New), estimated, accepted, in_progress, complete, cancelled.",
    input_schema: { type: "object", properties: { status: { type: "string" } } },
  },
  {
    name: "find_estimates",
    description: "Find estimates in the current workspace by client/project text and/or status (draft, sent, accepted, rejected).",
    input_schema: { type: "object", properties: { query: { type: "string" }, status: { type: "string" } } },
  },
  {
    name: "find_invoices",
    description: "Find invoices in the current workspace by client text and/or status (unpaid, partial, paid). Returns totals and balance.",
    input_schema: { type: "object", properties: { query: { type: "string" }, status: { type: "string" } } },
  },
  {
    name: "list_tasks",
    description: "List tasks, optionally filtered by status (todo, in_progress, done) and/or assignee.",
    input_schema: { type: "object", properties: { status: { type: "string" }, assignee: { type: "string" } } },
  },
  {
    name: "list_inventory",
    description: "Search inventory items by description; set low_stock true to list items at or below their minimum level.",
    input_schema: { type: "object", properties: { query: { type: "string" }, low_stock: { type: "boolean" } } },
  },
  {
    name: "list_expenses",
    description: "List recent expenses in the current workspace.",
    input_schema: { type: "object", properties: { limit: { type: "number" } } },
  },

  {
    name: "create_customer",
    description: "Add a customer/contact to the current workspace.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: { type: "string", enum: ["Individual", "Business", "Contact"] },
        email: { type: "string" },
        phone: { type: "string" },
        company_name: { type: "string" },
        title: { type: "string" },
        address: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_customer",
    description: "Update fields on an existing customer (by id).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        status: { type: "string", enum: ["active", "inactive", "prospect"] },
      },
      required: ["id"],
    },
  },
  {
    name: "create_company",
    description: "Add a company to the current workspace.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        address: { type: "string" },
        industry: { type: "string" },
        phone: { type: "string" },
        website: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_task",
    description: "Create a task.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        assignee: { type: "string", description: "Team member name or email" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update a task (status, assignee, priority, due date, title).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        assignee: { type: "string" },
        due_date: { type: "string" },
        title: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_work_order",
    description: "Create a work order (goes to the New column).",
    input_schema: {
      type: "object",
      properties: {
        item_name: { type: "string" },
        work_type: { type: "string" },
        scope: { type: "string" },
        assigned_to: { type: "string" },
        deadline: { type: "string", description: "YYYY-MM-DD" },
        description: { type: "string" },
        quantity: { type: "number" },
      },
      required: ["item_name"],
    },
  },
  {
    name: "update_work_order",
    description: "Update a work order — move it between columns via status (pending, estimated, accepted, in_progress, complete, cancelled), or change assignee/deadline/details.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["pending", "estimated", "accepted", "in_progress", "complete", "cancelled"] },
        assigned_to: { type: "string" },
        deadline: { type: "string" },
        work_type: { type: "string" },
        description: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_estimate",
    description: "Create a DRAFT estimate in the current workspace. Line items can be added later in the Estimator.",
    input_schema: {
      type: "object",
      properties: {
        project_name: { type: "string" },
        client_name: { type: "string" },
        customer_id: { type: "string" },
      },
    },
  },
  {
    name: "update_estimate",
    description: "Update an existing estimate's details (by id): project/client name, job-site address, deposit %, or status. Does not change line items — those are edited in the Estimator.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        project_name: { type: "string" },
        client_name: { type: "string" },
        site_address: { type: "string", description: "Job-site address to show on the proposal's Project block" },
        site_same_as_client: { type: "boolean", description: "True: proposal uses the client's address for the job site. False: uses site_address." },
        deposit_percent: { type: "number" },
        status: { type: "string", enum: ["draft", "sent", "accepted", "rejected"] },
      },
      required: ["id"],
    },
  },
  {
    name: "create_invoice",
    description: "Create an invoice in the current workspace with line items. Money action.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        client_email: { type: "string" },
        client_phone: { type: "string" },
        description: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        tax_rate: { type: "number", description: "Percent, defaults to 8.75" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
            },
            required: ["description", "quantity", "unit_price"],
          },
        },
      },
      required: ["client_name", "line_items"],
    },
  },
  {
    name: "record_invoice_payment",
    description: "Record a payment against an invoice (updates paid/partial/paid status). Money action.",
    input_schema: {
      type: "object",
      properties: {
        invoice_id: { type: "string" },
        amount: { type: "number" },
        method: { type: "string", description: "Cash, Check, Card, ACH, etc." },
        note: { type: "string" },
      },
      required: ["invoice_id", "amount"],
    },
  },
  {
    name: "create_expense",
    description: "Log an expense in the current workspace. Money action.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
        description: { type: "string" },
        category: { type: "string" },
        vendor_name: { type: "string" },
        notes: { type: "string" },
      },
      required: ["amount"],
    },
  },
  {
    name: "add_inventory_item",
    description: "Add a new inventory item.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string" },
        item_number: { type: "string" },
        unit: { type: "string", description: "e.g. ea, ft, box" },
        unit_cost: { type: "number" },
        quantity_on_hand: { type: "number" },
        min_stock_level: { type: "number" },
        location: { type: "string" },
      },
      required: ["description"],
    },
  },
  {
    name: "adjust_inventory",
    description: "Adjust an inventory item's quantity on hand by a delta (positive to add stock, negative to remove).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        delta: { type: "number" },
        note: { type: "string" },
      },
      required: ["id", "delta"],
    },
  },
];

// ── human-readable confirmation text for write tools ─────────────────────────
export function describeAction(name: string, input: In): { title: string; summary: string } {
  const lines = (pairs: [string, unknown][]) =>
    pairs.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}: ${v}`).join("\n");
  switch (name) {
    case "create_customer":
      return { title: `Add customer: ${str(input, "name")}`, summary: lines([["Type", input.type || "Individual"], ["Email", input.email], ["Phone", input.phone], ["Company", input.company_name], ["Address", input.address]]) };
    case "update_customer":
      return { title: `Update customer`, summary: lines([["ID", input.id], ["Name", input.name], ["Email", input.email], ["Phone", input.phone], ["Address", input.address], ["Status", input.status]]) };
    case "create_company":
      return { title: `Add company: ${str(input, "name")}`, summary: lines([["Address", input.address], ["Industry", input.industry], ["Phone", input.phone], ["Website", input.website]]) };
    case "create_task":
      return { title: `Create task: ${str(input, "title")}`, summary: lines([["Priority", input.priority || "medium"], ["Assignee", input.assignee], ["Due", input.due_date], ["Details", input.description]]) };
    case "update_task":
      return { title: `Update task`, summary: lines([["ID", input.id], ["Status", input.status], ["Priority", input.priority], ["Assignee", input.assignee], ["Due", input.due_date], ["Title", input.title]]) };
    case "create_work_order":
      return { title: `Create work order: ${str(input, "item_name")}`, summary: lines([["Work type", input.work_type || "Repair"], ["Scope", input.scope || "Internal"], ["Assigned", input.assigned_to], ["Deadline", input.deadline], ["Qty", input.quantity], ["Details", input.description]]) };
    case "update_work_order":
      return { title: `Update work order`, summary: lines([["ID", input.id], ["Move to", input.status], ["Assigned", input.assigned_to], ["Deadline", input.deadline], ["Work type", input.work_type]]) };
    case "create_estimate":
      return { title: `Create draft estimate`, summary: lines([["Project", input.project_name], ["Client", input.client_name]]) };
    case "update_estimate":
      return {
        title: `Update estimate`,
        summary: lines([
          ["ID", input.id],
          ["Project", input.project_name],
          ["Client", input.client_name],
          ["Job site", input.site_same_as_client === true ? "Same as client address" : input.site_address],
          ["Deposit %", input.deposit_percent],
          ["Status", input.status],
        ]),
      };
    case "create_invoice": {
      const items = Array.isArray(input.line_items) ? (input.line_items as In[]) : [];
      const sub = items.reduce((s, li) => s + (num(li, "quantity") || 0) * (num(li, "unit_price") || 0), 0);
      const tax = num(input, "tax_rate") ?? 8.75;
      const total = sub * (1 + tax / 100);
      const itemLines = items.map((li) => `  • ${str(li, "description")} — ${num(li, "quantity")} × $${num(li, "unit_price")}`).join("\n");
      return {
        title: `Create invoice for ${str(input, "client_name")} — $${total.toFixed(2)}`,
        summary: `${itemLines}\nSubtotal: $${sub.toFixed(2)}  Tax: ${tax}%  Total: $${total.toFixed(2)}${input.due_date ? `\nDue: ${input.due_date}` : ""}`,
      };
    }
    case "record_invoice_payment":
      return { title: `Record payment of $${num(input, "amount")?.toFixed(2)}`, summary: lines([["Invoice", input.invoice_id], ["Method", input.method || "—"], ["Note", input.note]]) };
    case "create_expense":
      return { title: `Log expense: $${num(input, "amount")?.toFixed(2)}`, summary: lines([["Date", input.date || "today"], ["Category", input.category], ["Vendor", input.vendor_name], ["Description", input.description], ["Notes", input.notes]]) };
    case "add_inventory_item":
      return { title: `Add inventory item: ${str(input, "description")}`, summary: lines([["Item #", input.item_number], ["Unit", input.unit], ["Unit cost", input.unit_cost], ["On hand", input.quantity_on_hand], ["Min", input.min_stock_level], ["Location", input.location]]) };
    case "adjust_inventory":
      return { title: `Adjust stock by ${num(input, "delta")}`, summary: lines([["Item", input.id], ["Note", input.note]]) };
    default:
      return { title: name, summary: JSON.stringify(input) };
  }
}

// ── read context snapshot for the system prompt ──────────────────────────────
export async function buildContextBlurb(ctx: ToolCtx): Promise<string> {
  const { data: settings } = await ctx.admin
    .from("settings")
    .select("biz_name, deposit_percent, team_members")
    .limit(1)
    .single();
  const team = (settings?.team_members || []) as Array<{ name?: string; email?: string; role?: string }>;
  const teamLines = team.map((m) => `  - ${m.name || "?"} <${m.email || ""}> (${m.role || "member"})`).join("\n") || "  - (none)";
  return [
    `Business: ${settings?.biz_name || "RELIC"}`,
    `Default deposit: ${settings?.deposit_percent ?? "—"}%`,
    `Team (for assignees):\n${teamLines}`,
  ].join("\n");
}

// ── executor ─────────────────────────────────────────────────────────────────
export async function runTool(name: string, input: In, ctx: ToolCtx): Promise<ToolResult> {
  const { admin, entity } = ctx;
  try {
    switch (name) {
      // ---- reads ----
      case "find_customers": {
        let q = admin.from("customers").select("id,name,email,phone,type,company_name,status").eq("entity", entity).limit(25);
        const query = str(input, "query");
        if (query) q = q.or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`);
        const { data, error } = await q.order("name");
        return error ? { ok: false, error: error.message } : { ok: true, data };
      }
      case "find_companies": {
        let q = admin.from("companies").select("id,name,address,industry,phone,website").eq("entity", entity).limit(25);
        const query = str(input, "query");
        if (query) q = q.ilike("name", `%${query}%`);
        const { data, error } = await q.order("name");
        return error ? { ok: false, error: error.message } : { ok: true, data };
      }
      case "list_work_orders": {
        let q = admin.from("wallflower_work_orders").select("id,item_name,work_type,scope,status,assigned_to,deadline,quantity").limit(50);
        const status = str(input, "status");
        if (status) q = q.eq("status", status);
        const { data, error } = await q.order("created_at", { ascending: false });
        return error ? { ok: false, error: error.message } : { ok: true, data };
      }
      case "find_estimates": {
        let q = admin.from("estimates").select("id,estimate_number,project_name,client_name,status,deposit_percent,site_address,site_same_as_client,customer_id").eq("entity", entity).limit(25);
        const query = str(input, "query");
        const status = str(input, "status");
        if (query) q = q.or(`project_name.ilike.%${query}%,client_name.ilike.%${query}%,estimate_number.ilike.%${query}%`);
        if (status) q = q.eq("status", status);
        const { data, error } = await q.order("created_at", { ascending: false });
        return error ? { ok: false, error: error.message } : { ok: true, data };
      }
      case "find_invoices": {
        let q = admin.from("invoices").select("id,invoice_number,client_name,subtotal,delivery_fee,discount,tax_rate,status,payments").eq("entity", entity).limit(25);
        const query = str(input, "query");
        const status = str(input, "status");
        if (query) q = q.or(`client_name.ilike.%${query}%,invoice_number.ilike.%${query}%`);
        if (status) q = q.eq("status", status);
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) return { ok: false, error: error.message };
        const rows = (data || []).map((inv) => {
          const taxable = (inv.subtotal || 0) + (inv.delivery_fee || 0) - (inv.discount || 0);
          const total = taxable + taxable * ((inv.tax_rate || 0) / 100);
          const paid = (inv.payments || []).reduce((s: number, p: { amount?: number }) => s + (p.amount || 0), 0);
          return { id: inv.id, invoice_number: inv.invoice_number, client_name: inv.client_name, status: inv.status, total: Number(total.toFixed(2)), paid: Number(paid.toFixed(2)), balance: Number((total - paid).toFixed(2)) };
        });
        return { ok: true, data: rows };
      }
      case "list_tasks": {
        let q = admin.from("tasks").select("id,title,status,priority,assignee,due_date").limit(50);
        const status = str(input, "status");
        const assignee = str(input, "assignee");
        if (status) q = q.eq("status", status);
        if (assignee) q = q.ilike("assignee", `%${assignee}%`);
        const { data, error } = await q.order("created_at", { ascending: false });
        return error ? { ok: false, error: error.message } : { ok: true, data };
      }
      case "list_inventory": {
        let q = admin.from("inventory_items").select("id,description,item_number,unit,unit_cost,quantity_on_hand,min_stock_level,location").eq("active", true).limit(50);
        const query = str(input, "query");
        if (query) q = q.ilike("description", `%${query}%`);
        const { data, error } = await q.order("description");
        if (error) return { ok: false, error: error.message };
        let rows = data || [];
        if (input.low_stock === true) rows = rows.filter((i) => (i.quantity_on_hand || 0) <= (i.min_stock_level || 0));
        return { ok: true, data: rows };
      }
      case "list_expenses": {
        const limit = num(input, "limit") || 20;
        const { data, error } = await admin.from("expenses").select("id,date,amount,category,vendor_name,description").eq("entity", entity).order("date", { ascending: false }).limit(limit);
        return error ? { ok: false, error: error.message } : { ok: true, data };
      }

      // ---- writes ----
      case "create_customer": {
        const name = str(input, "name");
        if (!name) return { ok: false, error: "name is required" };
        const { data, error } = await admin.from("customers").insert({
          entity, name, type: str(input, "type") || "Individual",
          email: str(input, "email") || null, phone: str(input, "phone") || null,
          company_name: str(input, "company_name") || null, title: str(input, "title") || null,
          address: str(input, "address") || null,
        }).select("id,name").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "created", entity: "customer", entity_id: data.id, label: `Added customer: ${data.name}` });
        return { ok: true, data };
      }
      case "update_customer": {
        const id = str(input, "id");
        if (!id) return { ok: false, error: "id is required" };
        const patch: In = {};
        for (const k of ["name", "email", "phone", "address", "status"]) if (str(input, k)) patch[k] = str(input, k);
        if (Object.keys(patch).length === 0) return { ok: false, error: "nothing to update" };
        const { data, error } = await admin.from("customers").update(patch).eq("id", id).eq("entity", entity).select("id,name").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "updated", entity: "customer", entity_id: id, label: `Updated customer: ${data?.name || id}` });
        return { ok: true, data };
      }
      case "create_company": {
        const name = str(input, "name");
        if (!name) return { ok: false, error: "name is required" };
        const { data, error } = await admin.from("companies").insert({
          entity, name, address: str(input, "address") || null, industry: str(input, "industry") || null,
          phone: str(input, "phone") || null, website: str(input, "website") || null,
        }).select("id,name").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "created", entity: "company", entity_id: data.id, label: `Added company: ${data.name}` });
        return { ok: true, data };
      }
      case "create_task": {
        const title = str(input, "title");
        if (!title) return { ok: false, error: "title is required" };
        const { data, error } = await admin.from("tasks").insert({
          title, description: str(input, "description") || null, status: "todo",
          priority: str(input, "priority") || "medium", assignee: str(input, "assignee") || null,
          due_date: str(input, "due_date") || null,
        }).select("id,title").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "created", entity: "task", entity_id: data.id, label: `Created task: ${data.title}` });
        return { ok: true, data };
      }
      case "update_task": {
        const id = str(input, "id");
        if (!id) return { ok: false, error: "id is required" };
        const patch: In = { updated_at: new Date().toISOString() };
        for (const k of ["status", "priority", "assignee", "due_date", "title"]) if (str(input, k)) patch[k] = str(input, k);
        const { data, error } = await admin.from("tasks").update(patch).eq("id", id).select("id,title").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "updated", entity: "task", entity_id: id, label: `Updated task: ${data?.title || id}` });
        return { ok: true, data };
      }
      case "create_work_order": {
        const item_name = str(input, "item_name");
        if (!item_name) return { ok: false, error: "item_name is required" };
        const { data, error } = await admin.from("wallflower_work_orders").insert({
          item_name, item_source: "custom", work_type: str(input, "work_type") || "Repair",
          scope: str(input, "scope") || "Internal", assigned_to: str(input, "assigned_to") || null,
          deadline: str(input, "deadline") || null, status: "pending",
          description: str(input, "description") || null, quantity: num(input, "quantity") || 1,
          submitted_by: `${ctx.email} (assistant)`,
        }).select("id,item_name").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "created", entity: "wallflower_work_order", entity_id: data.id, label: `Created work order: ${data.item_name}` });
        return { ok: true, data };
      }
      case "update_work_order": {
        const id = str(input, "id");
        if (!id) return { ok: false, error: "id is required" };
        const patch: In = { updated_at: new Date().toISOString() };
        for (const k of ["status", "assigned_to", "deadline", "work_type", "description"]) if (str(input, k)) patch[k] = str(input, k);
        const { data, error } = await admin.from("wallflower_work_orders").update(patch).eq("id", id).select("id,item_name,status").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "updated", entity: "wallflower_work_order", entity_id: id, label: `Updated work order: ${data?.item_name || id}` });
        return { ok: true, data };
      }
      case "create_estimate": {
        const year = new Date().getFullYear();
        const { data: latest } = await admin.from("estimates").select("estimate_number").like("estimate_number", `EST-${year}-%`).order("estimate_number", { ascending: false }).limit(1).maybeSingle();
        const lastNum = latest?.estimate_number ? parseInt(latest.estimate_number.split("-").pop() || "0", 10) : 0;
        const estimate_number = `EST-${year}-${String(lastNum + 1).padStart(4, "0")}`;
        const { data, error } = await admin.from("estimates").insert({
          entity, estimate_number, project_name: str(input, "project_name") || "", client_name: str(input, "client_name") || "",
          customer_id: str(input, "customer_id") || null, status: "draft", line_items: [], labor_items: [], markup_percent: 0,
        }).select("id,estimate_number").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "created", entity: "estimate", entity_id: data.id, label: `Created estimate ${data.estimate_number}` });
        return { ok: true, data };
      }
      case "update_estimate": {
        const id = str(input, "id");
        if (!id) return { ok: false, error: "id is required" };
        const patch: In = { updated_at: new Date().toISOString() };
        for (const k of ["project_name", "client_name", "site_address", "status"]) if (str(input, k)) patch[k] = str(input, k);
        if (typeof input.site_same_as_client === "boolean") patch.site_same_as_client = input.site_same_as_client;
        const dp = num(input, "deposit_percent");
        if (dp !== undefined) patch.deposit_percent = dp;
        if (Object.keys(patch).length <= 1) return { ok: false, error: "nothing to update" };
        const { data, error } = await admin.from("estimates").update(patch).eq("id", id).eq("entity", entity).select("id,estimate_number").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "updated", entity: "estimate", entity_id: id, label: `Updated estimate ${data?.estimate_number || id}` });
        return { ok: true, data };
      }
      case "create_invoice": {
        const client_name = str(input, "client_name");
        const items = Array.isArray(input.line_items) ? (input.line_items as In[]) : [];
        if (!client_name) return { ok: false, error: "client_name is required" };
        if (items.length === 0) return { ok: false, error: "at least one line item is required" };
        const lineItems = items.map((li) => {
          const quantity = num(li, "quantity") || 0;
          const unit_price = num(li, "unit_price") || 0;
          return { description: str(li, "description") || "", quantity, unit_price, amount: quantity * unit_price };
        });
        const subtotal = lineItems.reduce((s, li) => s + li.amount, 0);
        const year = new Date().getFullYear();
        const invoice_number = `INV-${year}-${Math.floor(1000 + Math.random() * 9000)}`;
        const { data, error } = await admin.from("invoices").insert({
          entity, invoice_number, client_name, client_email: str(input, "client_email") || null,
          client_phone: str(input, "client_phone") || null, description: str(input, "description") || null,
          subtotal, delivery_fee: 0, discount: 0, tax_rate: num(input, "tax_rate") ?? 8.75,
          issued_date: new Date().toISOString().split("T")[0], due_date: str(input, "due_date") || null,
          line_items: lineItems,
        }).select("id,invoice_number").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "created", entity: "invoice", entity_id: data.id, label: `Created invoice ${data.invoice_number} for ${client_name}` });
        return { ok: true, data };
      }
      case "record_invoice_payment": {
        const invoice_id = str(input, "invoice_id");
        const amount = num(input, "amount");
        if (!invoice_id || amount === undefined) return { ok: false, error: "invoice_id and amount are required" };
        const { data: inv, error: gErr } = await admin.from("invoices").select("id,subtotal,delivery_fee,discount,tax_rate,payments,invoice_number").eq("id", invoice_id).eq("entity", entity).single();
        if (gErr || !inv) return { ok: false, error: gErr?.message || "invoice not found" };
        const taxable = (inv.subtotal || 0) + (inv.delivery_fee || 0) - (inv.discount || 0);
        const total = taxable + taxable * ((inv.tax_rate || 0) / 100);
        const payments = [...(inv.payments || []), { amount, method: str(input, "method") || "Manual", date: new Date().toISOString().split("T")[0], note: str(input, "note") || null, created_at: new Date().toISOString() }];
        const paid = payments.reduce((s: number, p: { amount?: number }) => s + (p.amount || 0), 0);
        const status = paid >= total - 0.005 ? "paid" : paid > 0 ? "partial" : "unpaid";
        const { error } = await admin.from("invoices").update({ payments, status, updated_at: new Date().toISOString() }).eq("id", invoice_id);
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "updated", entity: "invoice", entity_id: invoice_id, label: `Recorded $${amount.toFixed(2)} payment on ${inv.invoice_number}` });
        return { ok: true, data: { status, paid: Number(paid.toFixed(2)), total: Number(total.toFixed(2)), balance: Number((total - paid).toFixed(2)) } };
      }
      case "create_expense": {
        const amount = num(input, "amount");
        if (amount === undefined) return { ok: false, error: "amount is required" };
        const { data, error } = await admin.from("expenses").insert({
          entity, date: str(input, "date") || new Date().toISOString().split("T")[0], amount,
          description: str(input, "description") || null, category: str(input, "category") || null,
          vendor_name: str(input, "vendor_name") || null, notes: str(input, "notes") || null,
        }).select("id").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "created", entity: "expense", entity_id: data.id, label: `Logged expense $${amount.toFixed(2)}${str(input, "vendor_name") ? ` — ${str(input, "vendor_name")}` : ""}` });
        return { ok: true, data };
      }
      case "add_inventory_item": {
        const description = str(input, "description");
        if (!description) return { ok: false, error: "description is required" };
        const { data, error } = await admin.from("inventory_items").insert({
          description, item_number: str(input, "item_number") || null, unit: str(input, "unit") || "ea",
          unit_cost: num(input, "unit_cost") || 0, quantity_on_hand: num(input, "quantity_on_hand") || 0,
          min_stock_level: num(input, "min_stock_level") || 0, location: str(input, "location") || null,
        }).select("id,description").single();
        if (error) return { ok: false, error: error.message };
        await logActivity(ctx, { action: "created", entity: "inventory", entity_id: data.id, label: `Added inventory: ${data.description}` });
        return { ok: true, data };
      }
      case "adjust_inventory": {
        const id = str(input, "id");
        const delta = num(input, "delta");
        if (!id || delta === undefined) return { ok: false, error: "id and delta are required" };
        const { data: item, error: gErr } = await admin.from("inventory_items").select("id,description,quantity_on_hand,unit_cost").eq("id", id).single();
        if (gErr || !item) return { ok: false, error: gErr?.message || "item not found" };
        const newQty = (item.quantity_on_hand || 0) + delta;
        const { error } = await admin.from("inventory_items").update({ quantity_on_hand: newQty }).eq("id", id);
        if (error) return { ok: false, error: error.message };
        await admin.from("inventory_transactions").insert({
          inventory_item_id: id, type: delta >= 0 ? "in" : "out", quantity: Math.abs(delta),
          unit_cost: item.unit_cost || 0, date: new Date().toISOString().split("T")[0],
          notes: str(input, "note") || "Assistant adjustment", created_by: `${ctx.email} (assistant)`,
        });
        await logActivity(ctx, { action: "updated", entity: "inventory", entity_id: id, label: `Adjusted ${item.description} by ${delta} (now ${newQty})` });
        return { ok: true, data: { id, quantity_on_hand: newQty } };
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "tool failed" };
  }
}
