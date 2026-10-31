import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { billingPatch } from "@/lib/relicon-billing";
import { as as asWho, createDb, sql, type Who } from "./testdb";

// Phases 1, 2a, 2b, the storage rules, then supabase/tenancy-phase3.sql.

const GARRETT = "11111111-1111-4111-8111-111111111111";
const garrett: Who = { sub: GARRETT, email: "garrett@relicbuilt.com", role: "authenticated" };
const anon: Who = { role: "anon" };
const service: Who = { role: "service_role" };

let db: PGlite;
const as = <T,>(who: Who, slug: string | null, fn: () => Promise<T>) => asWho(db, who, slug, fn);
const setAccess = (slug: string, access: string) => db.query(`update public.tenants set access = $1 where slug = $2`, [access, slug]);
const relicJob = crypto.randomUUID();

beforeAll(async () => {
  db = await createDb();
  await db.query(`insert into auth.users (id, email) values ($1, 'garrett@relicbuilt.com')`, [GARRETT]);
  await db.query(`insert into public.settings (team_members) values ($1)`, [
    JSON.stringify([{ name: "Garrett", email: "garrett@relicbuilt.com", role: "superadmin" }]),
  ]);
  await db.query(`insert into public.custom_work (id, project_name, client_name, entity) values ($1, 'Hidden Door', 'C', 'relic')`, [relicJob]);
  await db.exec(`
    alter table public.wallflower_work_orders enable row level security;
    create policy "Public intake insert" on public.wallflower_work_orders for insert to anon with check (true);
    create policy portal_images_insert on storage.objects for insert to authenticated with check (bucket_id = 'portal-images');
    create policy portal_images_select on storage.objects for select to authenticated using (bucket_id = 'portal-images');
  `);
  for (const f of ["tenancy-phase1.sql", "tenancy-phase2a.sql", "tenancy-phase2b.sql", "tenancy-phase3.sql"]) await db.exec(sql(f));
});

const projects = (slug: string) =>
  as(garrett, slug, () => db.query<{ project_name: string }>(`select project_name from public.custom_work`)).then((r) =>
    r.rows.map((x) => x.project_name),
  );

describe("full access", () => {
  it("is the starting state, and the team can work normally", async () => {
    const { rows } = await db.query<{ access: string }>(`select access from public.tenants order by slug`);
    expect(rows.map((r) => r.access)).toEqual(["full", "full"]);
    await as(garrett, "relic", () => db.query(`insert into public.vendors (name) values ('HDL')`));
    const r = await as(garrett, "relic", () => db.query(`update public.custom_work set project_name = 'Hidden Door' where id = $1`, [relicJob]));
    expect(r.affectedRows).toBe(1);
  });
});

describe("read_only", () => {
  beforeAll(() => setAccess("relic", "read_only"));

  it("the team still sees everything", async () => {
    expect(await projects("relic")).toEqual(["Hidden Door"]);
  });

  it("but can't add, change or delete", async () => {
    await expect(as(garrett, "relic", () => db.query(`insert into public.vendors (name) values ('Woodcraft')`))).rejects.toThrow(
      /row-level security/,
    );
    const upd = await as(garrett, "relic", () => db.query(`update public.custom_work set project_name = 'Changed' where id = $1`, [relicJob]));
    expect(upd.affectedRows).toBe(0);
    const del = await as(garrett, "relic", () => db.query(`delete from public.custom_work where id = $1`, [relicJob]));
    expect(del.affectedRows).toBe(0);
    await expect(
      as(garrett, "relic", () => db.query(`insert into storage.objects (bucket_id, name) values ('portal-images', 'x.png')`)),
    ).rejects.toThrow(/row-level security/);
  });

  it("only that workspace: Wallflower carries on", async () => {
    await as(garrett, "wallflower_relic", () => db.query(`insert into public.vendors (name) values ('Spectrum')`));
    await as(garrett, "wallflower_relic", () =>
      db.query(`insert into storage.objects (bucket_id, name) values ('portal-images', 'ok.png')`),
    );
  });

  it("the server (payments, portals, sync) isn't blocked", async () => {
    await as(service, "relic", () => db.query(`insert into public.task_notes (title) values ('From server')`));
  });

  it("the Wallflower request form isn't blocked either", async () => {
    await setAccess("wallflower_relic", "read_only");
    await as(anon, null, () => db.query(`insert into public.wallflower_work_orders (item_name) values ('Arch')`));
    await setAccess("wallflower_relic", "full");
  });
});

describe("none (canceled)", () => {
  beforeAll(() => setAccess("relic", "none"));

  it("hides the workspace from the team", async () => {
    expect(await projects("relic")).toEqual([]);
    const s = await as(garrett, "relic", () => db.query(`select id from public.settings`));
    expect(s.rows).toHaveLength(0);
  });

  it("paying again brings everything back", async () => {
    await setAccess("relic", "full");
    expect(await projects("relic")).toEqual(["Hidden Door"]);
  });
});

describe("billingPatch (what Axiom stores from Relicon)", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const e = { status: "active", access: "full" as const, products: ["nexus", "axiom"], grace_ends_at: null, trial_days_left: null };

  it("copies access and status", () => {
    expect(billingPatch(e, now)).toMatchObject({ access: "full", billing_status: "active", trial_ends_at: null });
    expect(billingPatch({ ...e, status: "read_only", access: "read_only" }, now).access).toBe("read_only");
  });

  it("a plan without Axiom means no Axiom", () => {
    expect(billingPatch({ ...e, products: ["nexus"] }, now).access).toBe("none");
  });

  it("turns trial days left into an end date", () => {
    expect(billingPatch({ ...e, status: "trialing", trial_days_left: 3 }, now).trial_ends_at).toBe("2026-11-04T12:00:00.000Z");
  });
});
