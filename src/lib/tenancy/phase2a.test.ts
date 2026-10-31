import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as as asWho, createDb, sql, type Who } from "./testdb";

// Runs Phase 1 then supabase/tenancy-phase2a.sql against an in-memory copy of
// the live schema, with the live access rules that Phase 2a replaces.

const PHASE2A = sql("tenancy-phase2a.sql");

const GARRETT = "11111111-1111-4111-8111-111111111111";
const STRANGER = "99999999-9999-4999-8999-999999999999";
const garrett: Who = { sub: GARRETT, email: "garrett@relicbuilt.com", role: "authenticated" };
const stranger: Who = { sub: STRANGER, email: "x@example.com", role: "authenticated" };
const anon: Who = { role: "anon" };

let db: PGlite;
const as = <T,>(who: Who, slug: string | null, fn: () => Promise<T>) => asWho(db, who, slug, fn);
const rows = async <T,>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;
const tenant = (slug: string) => rows<{ id: string }>(`select id from public.tenants where slug = $1`, [slug]).then((r) => r[0].id);

const id = {
  wrJob: crypto.randomUUID(),
  relicJob: crypto.randomUUID(),
  portalJob: crypto.randomUUID(),
  hdl: crypto.randomUUID(),
  woodcraft: crypto.randomUUID(),
  catItem: crypto.randomUUID(),
  category: crypto.randomUUID(),
  oak: crypto.randomUUID(),
  relicPO: crypto.randomUUID(),
  relicTxn: crypto.randomUUID(),
  wrTxn: crypto.randomUUID(),
};

beforeAll(async () => {
  db = await createDb();
  await db.query(`insert into auth.users (id, email) values ($1, 'garrett@relicbuilt.com'), ($2, 'x@example.com')`, [GARRETT, STRANGER]);

  // The live rules Phase 2a replaces (simplified), plus the public ones it keeps.
  await db.exec(`
    create function public.has_relic_access() returns boolean language sql stable as $$ select true $$;
    alter table public.custom_work enable row level security;
    create policy "Entity access" on public.custom_work for all to authenticated
      using (entity = 'wallflower_relic' or has_relic_access()) with check (true);
    create policy "Portal read projects" on public.custom_work for select to anon using (portal_enabled = true);
    alter table public.inventory_items enable row level security;
    create policy "Auth full access" on public.inventory_items for all to public
      using (auth.role() = 'authenticated' or auth.role() = 'service_role') with check (true);
    alter table public.wallflower_work_orders enable row level security;
    create policy "Auth full access" on public.wallflower_work_orders for all to authenticated using (true) with check (true);
    create policy "Public intake insert" on public.wallflower_work_orders for insert to anon with check (true);
    -- Live automation: every new catalog item gets an inventory item.
    create function public.sync_catalog_to_inventory() returns trigger language plpgsql as $$
    begin
      insert into public.inventory_items (catalog_item_id, vendor_id, description, unit_cost)
        values (new.id, new.vendor_id, new.description, coalesce(new.unit_price, 0));
      return new;
    end $$;
    create trigger trg_catalog_insert_sync after insert on public.vendor_catalog
      for each row execute function public.sync_catalog_to_inventory();
    alter table public.settings enable row level security;
    create policy "Auth full access" on public.settings for all to authenticated using (true) with check (true);
  `);

  await db.query(`insert into public.settings (team_members) values ($1)`, [
    JSON.stringify([{ name: "Garrett", email: "garrett@relicbuilt.com", role: "superadmin" }]),
  ]);
  await db.query(
    `insert into public.custom_work (id, project_name, client_name, entity, portal_enabled) values
       ($1, 'Bar', 'C', 'wallflower_relic', false), ($2, 'Hidden Door', 'C', 'relic', false), ($3, 'Portal job', 'C', 'wallflower_relic', true)`,
    [id.wrJob, id.relicJob, id.portalJob],
  );
  await db.query(`insert into public.vendors (id, name) values ($1, 'HDL'), ($2, 'Woodcraft')`, [id.hdl, id.woodcraft]);
  await db.query(`insert into public.vendor_catalog (id, vendor_id, description) values ($1, $2, 'Oak 4/4')`, [id.catItem, id.hdl]);
  await db.query(`insert into public.inventory_categories (id, name) values ($1, 'Lumber')`, [id.category]);
  await db.query(
    `insert into public.inventory_items (id, description, vendor_id, category_id, catalog_item_id, quantity_on_hand)
     values ($1, 'Red oak', $2, $3, $4, 12)`,
    [id.oak, id.hdl, id.category, id.catItem],
  );
  await db.query(`insert into public.shopping_lists (name) values ('Saturday run')`);
  await db.query(
    `insert into public.purchase_orders (id, po_number, vendor_name, vendor_id, entity) values ($1, 'PO-R1', 'HDL', $2, 'relic')`,
    [id.relicPO, id.hdl],
  );
  await db.query(
    `insert into public.inventory_transactions (id, inventory_item_id, type, quantity, custom_work_id) values
       ($1, $2, 'out', 2, $3), ($4, $2, 'in', 5, null)`,
    [id.relicTxn, id.oak, id.relicJob, id.wrTxn],
  );

  await db.exec(sql("tenancy-phase1.sql"));
  await db.exec(PHASE2A);
});

describe("RELIC's copy of the materials", () => {
  it("copies every vendor, catalog item, category, item and shopping list", async () => {
    const counts = await rows<{ t: string; wr: number; relic: number }>(`
      select t, count(*) filter (where slug = 'wallflower_relic')::int as wr, count(*) filter (where slug = 'relic')::int as relic
      from (
        select 'vendors' t, tenant_id from public.vendors
        union all select 'vendor_catalog', tenant_id from public.vendor_catalog
        union all select 'inventory_categories', tenant_id from public.inventory_categories
        union all select 'inventory_items', tenant_id from public.inventory_items
        union all select 'shopping_lists', tenant_id from public.shopping_lists
      ) x join public.tenants on tenants.id = x.tenant_id group by t order by t`);
    expect(counts).toEqual([
      { t: "inventory_categories", wr: 1, relic: 1 },
      // The fixture's own item plus the one the catalog automation made; RELIC
      // gets one copy of each and no extra from the paused automation.
      { t: "inventory_items", wr: 2, relic: 2 },
      { t: "shopping_lists", wr: 1, relic: 1 },
      { t: "vendor_catalog", wr: 1, relic: 1 },
      { t: "vendors", wr: 2, relic: 2 },
    ]);
  });

  it("RELIC's copies point at RELIC's copies, with the same stock count", async () => {
    const relic = await tenant("relic");
    const [item] = await rows<{ qty: number; v: string; c: string; k: string }>(
      `select i.quantity_on_hand::int as qty, v.tenant_id as v, c.tenant_id as c, k.tenant_id as k
       from public.inventory_items i
       join public.vendors v on v.id = i.vendor_id
       join public.inventory_categories c on c.id = i.category_id
       join public.vendor_catalog k on k.id = i.catalog_item_id
       where i.tenant_id = $1`,
      [relic],
    );
    expect(item).toEqual({ qty: 12, v: relic, c: relic, k: relic });
  });

  it("RELIC's PO and stock move now use RELIC's vendor and item; Wallflower's don't move", async () => {
    const relic = await tenant("relic");
    const wr = await tenant("wallflower_relic");
    const [po] = await rows<{ t: string }>(`select v.tenant_id as t from public.purchase_orders p join public.vendors v on v.id = p.vendor_id where p.id = $1`, [id.relicPO]);
    expect(po.t).toBe(relic);
    const [rt] = await rows<{ t: string }>(`select i.tenant_id as t from public.inventory_transactions x join public.inventory_items i on i.id = x.inventory_item_id where x.id = $1`, [id.relicTxn]);
    expect(rt.t).toBe(relic);
    const [wt] = await rows<{ item: string }>(`select inventory_item_id as item from public.inventory_transactions where id = $1`, [id.wrTxn]);
    expect(wt.item).toBe(id.oak);
    const [orig] = await rows<{ t: string }>(`select tenant_id as t from public.inventory_items where id = $1`, [id.oak]);
    expect(orig.t).toBe(wr);
  });

  it("a new catalog item's automatic inventory item lands in the site's workspace", async () => {
    const relic = await tenant("relic");
    const [vendor] = await rows<{ id: string }>(`select id from public.vendors where tenant_id = $1 limit 1`, [relic]);
    await as(garrett, "relic", () =>
      db.query(`insert into public.vendor_catalog (vendor_id, description) values ($1, 'Walnut 8/4')`, [vendor.id]),
    );
    const [item] = await rows<{ t: string }>(`select tenant_id as t from public.inventory_items where description = 'Walnut 8/4'`);
    expect(item.t).toBe(relic);
  });

  it("running the script again copies nothing twice", async () => {
    await db.exec(PHASE2A);
    const [{ n }] = await rows<{ n: number }>(`select count(*)::int as n from public.vendors`);
    expect(n).toBe(4);
  });
});

describe("each site sees only its workspace", () => {
  const projects = (who: Who, slug: string | null) =>
    as(who, slug, () => rows<{ project_name: string }>(`select project_name from public.custom_work order by project_name`)).then((r) =>
      r.map((x) => x.project_name),
    );
  const items = (who: Who, slug: string | null) =>
    as(who, slug, () => rows<{ n: number }>(`select count(*)::int as n from public.inventory_items`)).then((r) => r[0].n);

  it("RELIC site: RELIC's projects and its own inventory", async () => {
    expect(await projects(garrett, "relic")).toEqual(["Hidden Door"]);
    expect(await items(garrett, "relic")).toBe(3); // 2 copies + Walnut added on the RELIC site
  });

  it("Wallflower site: Wallflower's projects and inventory", async () => {
    expect(await projects(garrett, "wallflower_relic")).toEqual(["Bar", "Portal job"]);
    expect(await items(garrett, "wallflower_relic")).toBe(2);
  });

  it("non-members, or a request naming no workspace, see nothing", async () => {
    expect(await projects(stranger, "relic")).toEqual([]);
    expect(await projects(garrett, null)).toEqual([]);
  });

  it("new rows land in the site's workspace; another workspace's rows can't be written", async () => {
    await as(garrett, "relic", () => db.query(`insert into public.vendors (name) values ('Spectrum Paint')`));
    const [v] = await rows<{ slug: string }>(
      `select t.slug from public.vendors v join public.tenants t on t.id = v.tenant_id where v.name = 'Spectrum Paint'`,
    );
    expect(v.slug).toBe("relic");
    await expect(
      as(garrett, "relic", () => db.query(`insert into public.custom_work (project_name, client_name, entity) values ('X', 'C', 'wallflower_relic')`)),
    ).rejects.toThrow(/row-level security/);
    const updated = await as(garrett, "relic", () =>
      db.query(`update public.custom_work set project_name = 'Hacked' where id = $1`, [id.wrJob]),
    );
    expect(updated.affectedRows).toBe(0);
  });

  it("the shared Settings row is readable by members only", async () => {
    expect((await as(garrett, "relic", () => rows(`select id from public.settings`))).length).toBe(1);
    expect((await as(stranger, "relic", () => rows(`select id from public.settings`))).length).toBe(0);
  });
});

describe("public rules are untouched", () => {
  it("the client portal still reads portal-enabled projects", async () => {
    expect(await projects(anon, null)).toEqual(["Portal job"]);
  });

  it("the Wallflower request form still adds work orders", async () => {
    await as(anon, null, () => db.query(`insert into public.wallflower_work_orders (item_name) values ('Arch')`));
    const [wo] = await rows<{ slug: string }>(
      `select t.slug from public.wallflower_work_orders w join public.tenants t on t.id = w.tenant_id where w.item_name = 'Arch'`,
    );
    expect(wo.slug).toBe("wallflower_relic");
  });

  function projects(who: Who, slug: string | null) {
    return as(who, slug, () => rows<{ project_name: string }>(`select project_name from public.custom_work`)).then((r) =>
      r.map((x) => x.project_name),
    );
  }
});

describe("every row needs a workspace", () => {
  it("a server write that names no workspace and has nothing to go on is refused", async () => {
    await expect(as({ role: "service_role" }, null, () => db.query(`insert into public.vendors (name) values ('Nowhere')`))).rejects.toThrow(
      /null value in column "tenant_id"/,
    );
  });

  it("the server's writes land in the workspace it names", async () => {
    await as({ role: "service_role" }, "relic", () => db.query(`insert into public.task_notes (title) values ('From server')`));
    const [n] = await rows<{ slug: string }>(
      `select t.slug from public.task_notes x join public.tenants t on t.id = x.tenant_id where x.title = 'From server'`,
    );
    expect(n.slug).toBe("relic");
  });
});
