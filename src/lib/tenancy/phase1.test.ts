import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Runs supabase/tenancy-phase1.sql against an in-memory copy of the live
// schema (supabase/schema-snapshot.sql) with a small stand-in for Supabase auth.

const root = join(__dirname, "..", "..", "..");
const SNAPSHOT = readFileSync(join(root, "supabase", "schema-snapshot.sql"), "utf8");
const PHASE1 = readFileSync(join(root, "supabase", "tenancy-phase1.sql"), "utf8");

const SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

const GARRETT = "11111111-1111-4111-8111-111111111111";
const STRANGER = "99999999-9999-4999-8999-999999999999";

let db: PGlite;
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const tenantOf = async (table: string, id: string) =>
  (await one<{ slug: string | null }>(
    `select t.slug from public.${table} x left join public.tenants t on t.id = x.tenant_id where x.id = $1`,
    [id],
  ))?.slug ?? null;

// Act as a signed-in user (or the service key) sending a workspace header.
async function as<T>(who: { sub?: string; email?: string; role: string }, slug: string | null, fn: () => Promise<T>) {
  const claims = JSON.stringify({ sub: who.sub, email: who.email, role: who.role });
  const headers = JSON.stringify(slug ? { "x-axiom-tenant": slug } : {});
  await db.query(`select set_config('request.jwt.claims', $1, false), set_config('request.headers', $2, false)`, [claims, headers]);
  await db.exec(`set role ${who.role}`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; reset request.jwt.claims; reset request.headers;`);
  }
}
const garrett = { sub: GARRETT, email: "Garrett@RelicBuilt.com", role: "authenticated" };
const stranger = { sub: STRANGER, email: "x@example.com", role: "authenticated" };

const ids = {
  wrCo: crypto.randomUUID(),
  wrCust: crypto.randomUUID(),
  wrJob: crypto.randomUUID(),
  relicJob: crypto.randomUUID(),
  relicEst: crypto.randomUUID(),
  relicPO: crypto.randomUUID(),
  relicTask: crypto.randomUUID(),
  orphanTask: crypto.randomUUID(),
  relicTime: crypto.randomUUID(),
  shopTime: crypto.randomUUID(),
  poReceipt: crypto.randomUUID(),
  looseReceipt: crypto.randomUUID(),
  audit: crypto.randomUUID(),
  logRelic: crypto.randomUUID(),
  logLead: crypto.randomUUID(),
  item: crypto.randomUUID(),
  vendor: crypto.randomUUID(),
  workOrder: crypto.randomUUID(),
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SHIM);
  await db.exec(SNAPSHOT);
  // The REST schema doesn't expose jsonb defaults; give required jsonb columns
  // one so test rows can leave them out, as the app does.
  await db.exec(`
    do $$ declare c record; begin
      for c in select table_name, column_name from information_schema.columns
               where table_schema = 'public' and data_type = 'jsonb' and is_nullable = 'NO' and column_default is null loop
        execute format('alter table public.%I alter column %I set default ''[]''::jsonb', c.table_name, c.column_name);
      end loop;
    end $$;
  `);
  await db.query(`insert into auth.users (id, email) values ($1, 'garrett@relicbuilt.com'), ($2, 'x@example.com')`, [GARRETT, STRANGER]);

  // Data shaped like the live database, before Phase 1.
  await db.query(
    `insert into public.settings (team_members) values ($1)`,
    [JSON.stringify([
      { name: "Garrett Schmidt", email: "garrett@relicbuilt.com", role: "superadmin", pin: "1234", hourly_rate: 60 },
      { name: "Misty Schmidt", email: "Misty@Wallflower-Relic.com ", role: "admin", pin: "4321", hourly_rate: 40, phone: "402" },
      { name: "No Email Crew", role: "staff", pin: "1111" },
    ])],
  );
  await db.query(`insert into public.companies (id, name, entity) values ($1, 'WR Co', 'wallflower_relic')`, [ids.wrCo]);
  await db.query(`insert into public.customers (id, name, entity) values ($1, 'WR Cust', 'wallflower_relic')`, [ids.wrCust]);
  await db.query(
    `insert into public.custom_work (id, project_name, client_name, entity) values ($1, 'Bar', 'C', 'wallflower_relic'), ($2, 'Hidden Door', 'C', 'relic')`,
    [ids.wrJob, ids.relicJob],
  );
  await db.query(`insert into public.estimates (id, estimate_number, entity, custom_work_id) values ($1, 'E-1', 'relic', $2)`, [ids.relicEst, ids.relicJob]);
  await db.query(`insert into public.purchase_orders (id, po_number, vendor_name, entity) values ($1, 'PO-1', 'HDL', 'relic')`, [ids.relicPO]);
  await db.query(
    `insert into public.tasks (id, title, custom_work_id) values ($1, 'Sand', $2), ($3, 'Loose', null)`,
    [ids.relicTask, ids.relicJob, ids.orphanTask],
  );
  await db.query(
    `insert into public.time_entries (id, member_name, custom_work_id, project_name) values ($1, 'Garrett', $2, 'Hidden Door'), ($3, 'Garrett', null, 'Shop')`,
    [ids.relicTime, ids.relicJob, ids.shopTime],
  );
  await db.query(
    `insert into public.receipts (id, purchase_order_id) values ($1, $2), ($3, null)`,
    [ids.poReceipt, ids.relicPO, ids.looseReceipt],
  );
  await db.query(
    `insert into public.proposal_audit_events (id, estimate_id, event_type) values ($1, $2, 'viewed')`,
    [ids.audit, ids.relicEst],
  );
  await db.query(
    `insert into public.activity_log (id, action, entity, entity_id) values ($1, 'created', 'estimate', $2), ($3, 'created', 'lead', gen_random_uuid())`,
    [ids.logRelic, ids.relicEst, ids.logLead],
  );
  await db.query(`insert into public.vendors (id, name) values ($1, 'HDL')`, [ids.vendor]);
  await db.query(`insert into public.inventory_items (id, description) values ($1, 'Red oak')`, [ids.item]);
  await db.query(`insert into public.wallflower_work_orders (id, item_name) values ($1, 'Arch')`, [ids.workOrder]);

  await db.exec(PHASE1);
});

describe("backfill", () => {
  it("tags rows by their own business", async () => {
    expect(await tenantOf("companies", ids.wrCo)).toBe("wallflower_relic");
    expect(await tenantOf("custom_work", ids.relicJob)).toBe("relic");
    expect(await tenantOf("estimates", ids.relicEst)).toBe("relic");
    expect(await tenantOf("purchase_orders", ids.relicPO)).toBe("relic");
  });

  it("children follow their project, PO or estimate", async () => {
    expect(await tenantOf("tasks", ids.relicTask)).toBe("relic");
    expect(await tenantOf("time_entries", ids.relicTime)).toBe("relic");
    expect(await tenantOf("receipts", ids.poReceipt)).toBe("relic");
    expect(await tenantOf("proposal_audit_events", ids.audit)).toBe("relic");
    expect(await tenantOf("activity_log", ids.logRelic)).toBe("relic");
  });

  it("anything tied to no business goes to Wallflower, as do shop materials (for now)", async () => {
    for (const [table, id] of [
      ["tasks", ids.orphanTask],
      ["time_entries", ids.shopTime],
      ["receipts", ids.looseReceipt],
      ["activity_log", ids.logLead],
      ["vendors", ids.vendor],
      ["inventory_items", ids.item],
      ["wallflower_work_orders", ids.workOrder],
    ] as const) {
      expect(await tenantOf(table, id), table).toBe("wallflower_relic");
    }
  });

  it("leaves only the shared Settings row untagged", async () => {
    const { rows } = await db.query<{ table_name: string; untagged: number }>(
      PHASE1.slice(PHASE1.lastIndexOf("select x.table_name")),
    );
    const untagged = rows.filter((r) => Number(r.untagged) > 0).map((r) => r.table_name);
    expect(untagged).toEqual(["settings"]);
  });

  it("is safe to run again", async () => {
    await db.exec(PHASE1);
    expect(await tenantOf("tasks", ids.relicTask)).toBe("relic");
    expect((await one<{ n: number }>(`select count(*)::int as n from public.tenants`))!.n).toBe(2);
  });
});

describe("team", () => {
  it("puts everyone with an email on both teams, linked to their login", async () => {
    const { rows } = await db.query<{ slug: string; email: string; user_id: string | null; pin: string }>(
      `select t.slug, m.email, m.user_id, m.pin from public.tenant_members m join public.tenants t on t.id = m.tenant_id
       where m.active order by t.slug, m.email`,
    );
    expect(rows.map((r) => `${r.slug}:${r.email}`)).toEqual([
      "relic:garrett@relicbuilt.com",
      "relic:misty@wallflower-relic.com",
      "wallflower_relic:garrett@relicbuilt.com",
      "wallflower_relic:misty@wallflower-relic.com",
    ]);
    expect(rows.find((r) => r.email === "garrett@relicbuilt.com")?.user_id).toBe(GARRETT);
  });

  it("follows Settings: edits update, removals deactivate", async () => {
    await db.query(
      `update public.settings set team_members = $1`,
      [JSON.stringify([{ name: "Garrett S", email: "garrett@relicbuilt.com", role: "superadmin", pin: "9999", hourly_rate: 70 }])],
    );
    const misty = await one<{ active: boolean }>(`select bool_or(active) as active from public.tenant_members where email = 'misty@wallflower-relic.com'`);
    expect(misty!.active).toBe(false);
    const g = await one<{ name: string; pin: string; n: number }>(
      `select min(name) as name, min(pin) as pin, count(*)::int as n from public.tenant_members where email = 'garrett@relicbuilt.com' and active`,
    );
    expect(g).toEqual({ name: "Garrett S", pin: "9999", n: 2 });
  });
});

describe("current_tenant_id()", () => {
  const current = () => one<{ id: string | null }>(`select public.current_tenant_id() as id`).then((r) => r!.id);
  const idOf = (slug: string) => one<{ id: string }>(`select id from public.tenants where slug = $1`, [slug]).then((r) => r!.id);

  it("is the workspace in the header when the caller is a member", async () => {
    expect(await as(garrett, "relic", current)).toBe(await idOf("relic"));
  });

  it("is empty for non-members, unknown workspaces, or no header", async () => {
    expect(await as(stranger, "relic", current)).toBeNull();
    expect(await as(garrett, "nope", current)).toBeNull();
    expect(await as(garrett, null, current)).toBeNull();
  });

  it("trusts the service key's header", async () => {
    expect(await as({ role: "service_role" }, "wallflower_relic", current)).toBe(await idOf("wallflower_relic"));
  });
});

describe("new rows", () => {
  it("take their business, or their parent's workspace", async () => {
    const est = crypto.randomUUID();
    const task = crypto.randomUUID();
    await db.query(`insert into public.estimates (id, estimate_number, entity) values ($1, 'E-2', 'relic')`, [est]);
    await db.query(`insert into public.tasks (id, title, custom_work_id) values ($1, 'Glue', $2)`, [task, ids.relicJob]);
    expect(await tenantOf("estimates", est)).toBe("relic");
    expect(await tenantOf("tasks", task)).toBe("relic");
  });

  it("take the request's workspace when nothing else says", async () => {
    const item = crypto.randomUUID();
    await as(garrett, "relic", () => db.query(`insert into public.inventory_items (id, description) values ($1, 'Walnut')`, [item]));
    expect(await tenantOf("inventory_items", item)).toBe("relic");
  });

  it("an explicit tenant wins", async () => {
    const v = crypto.randomUUID();
    const relic = await one<{ id: string }>(`select id from public.tenants where slug = 'relic'`);
    await db.query(`insert into public.vendors (id, name, tenant_id) values ($1, 'Woodcraft', $2)`, [v, relic!.id]);
    expect(await tenantOf("vendors", v)).toBe("relic");
  });

  it("moving a project to the other business moves its workspace", async () => {
    await db.query(`update public.custom_work set entity = 'wallflower_relic' where id = $1`, [ids.relicJob]);
    expect(await tenantOf("custom_work", ids.relicJob)).toBe("wallflower_relic");
    await db.query(`update public.custom_work set entity = 'relic' where id = $1`, [ids.relicJob]);
  });
});

describe("access to the new tables", () => {
  it("members see their workspaces and teammates; others see nothing", async () => {
    // Garrett is still active (the roster test kept him).
    const mine = await as(garrett, null, () => db.query(`select slug from public.tenants order by slug`));
    expect(mine.rows.map((r) => (r as { slug: string }).slug)).toEqual(["relic", "wallflower_relic"]);
    const theirs = await as(stranger, null, () => db.query(`select * from public.tenants`));
    expect(theirs.rows).toHaveLength(0);
    const team = await as(stranger, null, () => db.query(`select * from public.tenant_members`));
    expect(team.rows).toHaveLength(0);
  });

  it("nobody can add themselves to a workspace", async () => {
    const relic = (await one<{ id: string }>(`select id from public.tenants where slug = 'relic'`))!.id;
    for (const who of [stranger, garrett]) {
      await expect(
        as(who, null, () => db.query(`insert into public.tenant_members (tenant_id, email) values ($1, 'x@example.com')`, [relic])),
      ).rejects.toThrow(/row-level security/);
    }
  });
});
