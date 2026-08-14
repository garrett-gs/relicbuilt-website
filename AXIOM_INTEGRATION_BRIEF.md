# Axiom Integration Brief

For an engineer writing an MCP server against the RELIC **Axiom** business‑operations portal. This describes how the system stores projects, estimates, and line items, and how to read/write them safely. No secrets or tokens are included — every credential referenced lives in environment variables you must supply yourself.

---

## 1. Stack and runtime

| Concern | Detail |
|---|---|
| Language | TypeScript |
| Framework | Next.js `16.2.1` (App Router), React `19.2.4` |
| Styling | Tailwind CSS v4 (irrelevant to the API) |
| Database | **Supabase** (PostgreSQL) — used via its auto‑generated **PostgREST** REST API, **Supabase Auth**, and **Storage** |
| Data client | `@supabase/supabase-js` v2 |
| Hosting | Hosted on **Vercel**, not local. Web app base URL: `https://relicbuilt.com` (also `https://www.relicbuilt.com`). The Axiom portal lives under the `/axiom/*` routes. |
| Mobile | A Capacitor wrapper (iOS) ships the same web app; no separate API. |

**There is no bespoke REST CRUD service for the core entities.** The browser talks **directly to Supabase PostgREST** through the `axiom` client under Row‑Level Security. A small set of Next.js **API routes** (`/api/*`) exist only for cross‑system or side‑effecting flows (proposals, payments, Nexus sync, email, etc.), not for ordinary create/read/update of projects and estimates.

### Two Supabase projects

- **Axiom (primary)** — all project/estimate/invoice/customer data. Env: `NEXT_PUBLIC_AXIOM_SUPABASE_URL`, `NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY`, and server‑side `SUPABASE_SERVICE_ROLE_KEY`. Client wrapper: `src/lib/axiom-supabase.ts` (exported as `axiom`).
- **Wallflower RELIC Nexus (VenueOS)** — a *separate* Supabase project reached only server‑side via `getWRClient()` (`src/lib/wr-supabase.ts`, env `WR_SUPABASE_URL` / `WR_SUPABASE_SERVICE_KEY`). Out of scope for project/estimate CRUD; relevant only if you mirror status or pull orders/quotes.

> An MCP server should point at the **Axiom** project’s Supabase URL. Everything below is in that database.

---

## 2. Data model — projects, estimates, line items

### ID generation

- **Primary keys** are `uuid`, generated **by the database** via `gen_random_uuid()` (column default). Do not supply `id` on insert.
- **Human‑readable numbers** (`estimate_number`, `invoice_number`, `po_number`) are generated **by application code**, not the DB. Format: `EST-<YYYY>-<NNNN>` (4‑digit zero‑padded, sequential within the year). Change orders use the `CO-` prefix. The app computes the next number by selecting the current max for that prefix+year and incrementing. **These columns are `unique not null`** — if your MCP server inserts estimates/invoices/POs directly, you must generate a unique number yourself or the insert will fail. There is a race window (no DB sequence); the app tolerates it because writes are low‑volume.

### Money

- Stored as PostgreSQL **`numeric`** = **decimal dollars** (e.g. `1250.00`), surfaced as a JS `number`. **Not integer cents.**
- Percent fields (`markup_percent`, `tax_rate`, `deposit_percent`) are **percentages**, e.g. `8.75` means 8.75%.
- **Totals are computed in the app, not stored on the estimate.** See §5. The only stored roll‑up is `custom_work.quoted_amount`, written when an estimate is converted to a project.

### Relationships

```
customers ──1:*──> custom_work (PROJECTS)  via custom_work.customer_id
custom_work ──1:*──> estimates             via estimates.custom_work_id
estimates ──embeds──> line_items[], labor_items[]   (JSONB, no child table)
custom_work ──1:*──> invoices | purchase_orders | expenses | tasks   via custom_work_id
```

- **Projects are the `custom_work` table.** (“Custom Work” and “Project” are the same entity.)
- **Line items and labor items are JSONB arrays embedded in the estimate row** — there is **no `line_items` table**. Same pattern for `invoices.line_items`.
- An estimate links to a project via `estimates.custom_work_id` (nullable — a draft estimate can exist before a project). Converting an estimate creates a `custom_work` row and then sets `custom_work_id` back on the estimate.

---

### 2a. `custom_work` (Projects)

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | — | `gen_random_uuid()` | PK, DB‑generated |
| `project_name` | text | **yes** | — | NOT NULL |
| `client_name` | text | no | — | |
| `client_email` | text | no | — | |
| `client_phone` | text | no | — | |
| `customer_id` | uuid | no | — | FK → `customers(id)` ON DELETE SET NULL |
| `company_id` | uuid | no | — | FK → `companies(id)` (TS type) |
| `company_name` | text | no | — | denormalized company name |
| `project_description` | text | no | — | |
| `budget_range` | text | no | — | |
| `timeline` | text | no | — | |
| `status` | text (enum) | no | `'new'` | one of `new`, `in_review`, `quoted`, `in_progress`, `complete` |
| `internal_notes` | text | no | — | |
| `quoted_amount` | numeric | no | `0` | dollars |
| `actual_cost` | numeric | no | `0` | dollars |
| `unit_count` | integer | no | — | (added later; TS type) |
| `materials` | jsonb | no | `[]` | `Material[]` |
| `labor_log` | jsonb | no | `[]` | `LaborEntry[]` |
| `punch_list` | jsonb | no | — | `ProjectPunchItem[]` (TS type) |
| `start_date` | date | no | — | ISO date string |
| `due_date` | date | no | — | ISO date string |
| `image_url` | text | no | — | |
| `inspiration_images` | text[] | no | `{}` | array of URLs |
| `folder_url` | text | no | — | |
| `proposal_*` | mixed | no | — | `proposal_highlights`, `proposal_scope`, `proposal_cost_section`, `proposal_images`, `proposal_images_included`, `proposal_token`, `proposal_status` (`draft`/`sent`/`approved`), `proposal_approved_at` |
| `portal_enabled` | boolean | no | `false` | gates anon portal read (RLS) |
| `portal_token` | text | no | — | `unique`; client portal link token |
| `portal_stage` | text (enum) | no | `'consultation'` | one of `consultation`, `design`, `approval`, `fabrication`, `finishing`, `delivery` |
| `checklist` | jsonb | no | — | `ProjectChecklist` (TS type) |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | **set by app code on update**, not a DB trigger |

### 2b. `estimates` (Estimates)

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | — | `gen_random_uuid()` | PK, DB‑generated |
| `estimate_number` | text | **yes** | — | `unique not null`; format `EST-YYYY-NNNN` (or `CO-…` for change orders); **app‑generated** |
| `project_name` | text | no | — | |
| `custom_work_id` | uuid | no | — | FK → `custom_work(id)` ON DELETE SET NULL |
| `customer_id` | uuid | no | — | FK → `customers(id)` (added later) |
| `vendor_id` | uuid | no | — | (TS type) |
| `vendor_name` | text | no | — | |
| `client_name` | text | no | — | |
| `client_email` | text | no | — | (added later) |
| `client_phone` | text | no | — | (added later) |
| `change_order_for_id` | uuid | no | — | self‑reference for change orders |
| `status` | text (enum) | no | `'draft'` | one of `draft`, `sent`, `accepted`, `rejected` |
| `line_items` | jsonb | no | `[]` | array of **EstimateLineItem** (below) |
| `labor_items` | jsonb | no | `[]` | array of **EstimateLaborItem** (below) |
| `markup_percent` | numeric | no | `0` | percent |
| `unit_count` | integer | no | — | multiplier for multi‑unit jobs (TS type) |
| `notes` | text | no | — | |
| `images` | text[] | no | — | inspiration images carried from a work order |
| `sales_notes` | jsonb | no | — | append‑only `SalesNote[]` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | **set by app code** |

### 2c. Line items — JSONB shapes (no table)

```ts
// estimates.line_items[]
interface EstimateLineItem {
  item_number: string;   // free text / catalog ref
  description: string;
  quantity: number;
  unit_price: number;    // dollars (decimal)
  unit: string;          // e.g. "ea", "bf", "hr"
}

// estimates.labor_items[]
interface EstimateLaborItem {
  description: string;
  hours: number;
  rate: number;          // dollars/hour
  cost: number;          // dollars — the app stores the extended cost directly
}
```

All fields are plain JSON with no DB‑level validation — integrity is the writer’s responsibility.

---

## 3. How records get created

**Mechanism: direct Supabase PostgREST calls** via `@supabase/supabase-js`, under RLS. There is no ORM and no custom CRUD endpoint for these entities. An MCP server has two equivalent options:

1. **Use `@supabase/supabase-js`** against the Axiom project URL (recommended — matches the app exactly).
2. **Hit PostgREST directly** at `<AXIOM_SUPABASE_URL>/rest/v1/<table>` with headers `apikey: <key>`, `Authorization: Bearer <jwt-or-service-key>`, `Content-Type: application/json`, and `Prefer: return=representation` to get the inserted row back.

### Create an estimate

**supabase-js (as used in `src/app/axiom/estimator/page.tsx`):**

```ts
const { data } = await axiom.from("estimates").insert({
  estimate_number,          // you generate this: "EST-2026-0001"
  project_name: "Walnut bar top",
  client_name: "402 Events",
  customer_id: customerId || null,
  change_order_for_id: null,
  status: "draft",
  line_items: [],
  labor_items: [],
  markup_percent: 0,
}).select().single();
```

**Equivalent PostgREST request:**

```http
POST /rest/v1/estimates HTTP/1.1
Host: <AXIOM_SUPABASE_URL host>
apikey: <anon-or-service-key>
Authorization: Bearer <user-jwt-or-service-key>
Content-Type: application/json
Prefer: return=representation

{
  "estimate_number": "EST-2026-0001",
  "project_name": "Walnut bar top",
  "client_name": "402 Events",
  "customer_id": null,
  "status": "draft",
  "line_items": [],
  "labor_items": [],
  "markup_percent": 0
}
```

**Response (201, single row):**

```json
[{
  "id": "7f9bd326-ddd0-46b2-9c13-787e8718c255",
  "estimate_number": "EST-2026-0001",
  "project_name": "Walnut bar top",
  "custom_work_id": null,
  "customer_id": null,
  "client_name": "402 Events",
  "status": "draft",
  "line_items": [],
  "labor_items": [],
  "markup_percent": 0,
  "notes": null,
  "created_at": "2026-08-12T14:03:11.220Z",
  "updated_at": "2026-08-12T14:03:11.220Z"
}]
```

Generate `estimate_number` the way the app does:

```ts
const year = new Date().getFullYear();
const { data: latest } = await axiom.from("estimates")
  .select("estimate_number")
  .like("estimate_number", `EST-${year}-%`)
  .order("estimate_number", { ascending: false })
  .limit(1).single();
const lastNum = latest?.estimate_number
  ? parseInt(latest.estimate_number.split("-").pop() || "0", 10) : 0;
const estimate_number = `EST-${year}-${String(lastNum + 1).padStart(4, "0")}`;
```

### Update an estimate (prefer the service wrapper — see §6)

```ts
await axiom.from("estimates")
  .update({ line_items, labor_items, markup_percent, updated_at: new Date().toISOString() })
  .eq("id", id);
```

Always set `updated_at` yourself — no DB trigger maintains it.

### Create a project (`custom_work`)

```ts
const { data } = await axiom.from("custom_work").insert({
  project_name: "Walnut bar top",
  client_name: "402 Events",
  client_email: "lauren@402events.com",
  client_phone: "402-555-0100",
  customer_id: customerId || undefined,
  quoted_amount: 1250.0,             // dollars — usually the computed estimate total
  project_description: "…",
  status: "new",
}).select().single();
```

### Convert an estimate → project

The app: (1) compute the total (§5), (2) `insert` a `custom_work` row with `quoted_amount = total`, (3) `update` the estimate’s `custom_work_id` to the new project id. Two writes; there is no single RPC.

### Read

```ts
// list working estimates
await axiom.from("estimates").select("*").order("created_at", { ascending: false });
// one project with related estimates (PostgREST embed via the FK)
await axiom.from("custom_work").select("*, estimates(*)").eq("id", projectId).single();
```

There are **no stored procedures / RPC functions** for these entities (`axiom.rpc(...)` is not used for projects/estimates). Cross‑system flows use Next.js API routes instead (e.g. `POST /api/wallflower-status`, `POST /api/send-to-wr`, `POST /api/approve-estimate-proposal`), which are side‑effect endpoints, not general CRUD.

---

## 4. Auth

- **Mechanism: Supabase Auth, email/password.** The browser signs in with `axiom.auth.signInWithPassword({ email, password })` (`src/components/axiom/AuthProvider.tsx`) and thereafter carries a Supabase user **JWT**.
- **Row‑Level Security is enforced on every table.** Policies:
  - `authenticated` role → **full access** (`for all … using (true) with check (true)`) on all business tables.
  - `anon` role → restricted: read `custom_work` only where `portal_enabled = true`, plus limited portal read/insert on `build_files`, `build_comments`, `approval_requests`, and read `settings`.
- **Credentials live in environment variables** (`.env.local` locally / Vercel project env in prod) — never in the repo:
  - `NEXT_PUBLIC_AXIOM_SUPABASE_URL` — Axiom project URL
  - `NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY` — anon (public) key; RLS still applies
  - `SUPABASE_SERVICE_ROLE_KEY` — **server‑only**, **bypasses RLS**
- **For an MCP server, pick one:**
  1. **Service‑role key** (server‑to‑server, headless): full read/write, bypasses RLS. Never expose it to a browser or ship it client‑side.
  2. **User session**: sign in a dedicated Axiom user (email/password) to obtain a JWT, then act as `authenticated` (full access under RLS). This keeps writes attributable and within policy.
- Server API routes that write (e.g. `/api/axiom/sync-wallflower`) follow a pattern worth copying: verify the caller’s `Authorization: Bearer <token>` with `auth.getUser(token)`, then perform the write with a `service_role` client. Adopt the same “authenticate the caller, then elevate to write” shape if you expose the MCP server to less‑trusted callers.

> Do not hard‑code keys. Read them from the MCP server’s own environment.

---

## 5. Business rules, validation, and side effects

### Enforced by the database (fires on any write, including direct DB access)

- **CHECK constraints (enums)** — writing an out‑of‑range value is rejected:
  - `custom_work.status` ∈ {new, in_review, quoted, in_progress, complete}
  - `custom_work.portal_stage` ∈ {consultation, design, approval, fabrication, finishing, delivery}
  - `estimates.status` ∈ {draft, sent, accepted, rejected}
  - `customers.type` ∈ {Individual, Business, Venue, Planner}
  - `invoices.status` ∈ {unpaid, partial, paid}; `purchase_orders.status` ∈ {pending, approved, rejected}; `tasks.status` ∈ {todo, in_progress, done}
- **NOT NULL / UNIQUE** — `custom_work.project_name`; `estimates.estimate_number` (unique); `invoices.invoice_number` (unique); `purchase_orders.po_number` (unique); `customers.name`; `companies.name`.
- **DB triggers that DO run on direct writes:** inserting/updating a `vendor_catalog` row auto‑creates/updates the matching `inventory_items` row (migration v22). (No such trigger exists for projects/estimates.)

### Enforced only by application code (BYPASSED by a direct DB write)

These are **not** DB triggers. If your MCP server writes straight to Supabase, you must replicate them or they won’t happen:

- **Computed totals** (`calcTotals`, `src/app/axiom/estimator/page.tsx`):
  ```
  materialTotal = Σ line_items[i].quantity * line_items[i].unit_price
  laborTotal    = Σ labor_items[i].cost
  subtotal      = materialTotal + laborTotal
  markupAmount  = subtotal * (markup_percent / 100)
  total         = subtotal + markupAmount
  ```
  Totals are **not stored on the estimate**; they’re derived on render and written to `custom_work.quoted_amount` only at conversion.
- **Estimate status side effects** (`persistEstimate`, `src/lib/estimate-actions.ts`):
  - `status → "sent"`: a linked lead (`leads.estimate_id = <id>`) is auto‑advanced to `"quoted"` (unless already quoted/lost).
  - `status → "rejected"`: the linked lead is auto‑marked `"lost"`.
  - **Any** status change fires `POST /api/wallflower-status` to mirror the status back to Wallflower Nexus (no‑ops if the estimate isn’t linked to a work order).
- **`updated_at`** is stamped by the app (`new Date().toISOString()`), not the DB.
- **Activity logging**: creates/updates/deletes write an `activity_log` row via `logActivity` (`src/lib/activity.ts`). Direct writes won’t log unless you insert the row too.
- **Number generation** (`estimate_number`/`invoice_number`/`po_number`) is app‑side and must be unique — generate it before insert.
- **Denormalized `customers.company_name`** is maintained by app code (contact creation, company rename, Nexus sync), not triggers — keep it in sync if you rename companies.

### Status “transitions”

There is **no state machine** — status is a free `UPDATE` constrained only by the CHECK enum. The *effects* above are what differ between values, so drive transitions through the service wrapper (§6) rather than a raw update when a lead or Nexus link may exist.

---

## 6. Existing client / service layer to wrap (don’t reimplement)

Reuse these rather than rebuilding equivalents:

| Module | Export | What it gives you |
|---|---|---|
| `src/lib/axiom-supabase.ts` | `axiom` | Lazily‑initialized Supabase client for the Axiom project (browser/anon). All CRUD goes through `axiom.from("<table>")…`. |
| `src/lib/estimate-actions.ts` | `persistEstimate(id, updates, userEmail)` | The correct way to update an estimate: performs the update **and** the status side effects (lead advance/lost, Nexus status mirror). **Use this instead of a raw `estimates` update.** |
| `src/lib/estimate-actions.ts` | `deleteEstimateById(id, userEmail)` | Delete + activity log. |
| `src/lib/activity.ts` | `logActivity({ action, entity, entity_id, label, user_name, meta })` | Append to `activity_log`. Call on every create/update/delete for parity with the UI. |
| `src/lib/wr-supabase.ts` | `getWRClient()` | Server‑side client for the **Nexus** project (service key). Only for order/quote lookups and status mirroring. |
| `src/types/axiom.ts` | `CustomWork`, `Estimate`, `EstimateLineItem`, `EstimateLaborItem`, `PortalStage`, … | Canonical TypeScript types for every entity — import these to stay in sync with the schema. |
| Next.js API routes (`src/app/api/*`) | HTTP endpoints | Cross‑system operations only: `wallflower-status`, `send-to-wr`, `sync-wallflower`, `nexus-search`, `approve-estimate-proposal`, `send-proposal-email`, `pay-invoice`, `send-po`, etc. Reuse these for their specific flows; they are **not** general CRUD. |

**Recommended MCP shape:** a thin server that (a) authenticates to the Axiom Supabase project (service‑role or a dedicated user), (b) does reads/inserts via PostgREST/`supabase-js`, and (c) for estimate **updates** replicates `persistEstimate`’s side‑effect logic (or, if running inside this codebase, calls it directly). Always: generate unique document numbers, set `updated_at`, write an `activity_log` entry, and treat money as decimal dollars.
