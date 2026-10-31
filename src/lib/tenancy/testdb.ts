import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// An in-memory copy of the live Axiom schema (supabase/schema-snapshot.sql)
// with a small stand-in for Supabase auth, for testing the tenancy scripts.

const root = join(__dirname, "..", "..", "..");
export const sql = (file: string) => readFileSync(join(root, "supabase", file), "utf8");

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
  create function auth.role() returns text language sql stable as $$
    select auth.jwt() ->> 'role'
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SHIM);
  await db.exec(sql("schema-snapshot.sql"));
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
  return db;
}

export interface Who {
  sub?: string;
  email?: string;
  role: "authenticated" | "anon" | "service_role";
}

/** Run `fn` as a caller (signed-in user, anon, or the service key) whose site names `slug`. */
export async function as<T>(db: PGlite, who: Who, slug: string | null, fn: () => Promise<T>): Promise<T> {
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
