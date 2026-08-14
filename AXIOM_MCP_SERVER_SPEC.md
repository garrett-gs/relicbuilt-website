# Axiom MCP Server — Build Spec

Build a Model Context Protocol server exposing Axiom projects and estimates as tools, so estimating can be done conversationally in Claude chat rather than through the web UI or code.

Written against `AXIOM_INTEGRATION_BRIEF.md`. Read that first; this spec assumes it.

---

## Scope

**In scope (v1):** create and read estimates, write line items and labor items, create projects, convert estimate → project, read back computed totals.

**Out of scope (v1):** estimate status changes, invoices, purchase orders, customers, proposals, payments, Nexus sync. See §7 for why status is excluded.

**Design stance:** this server is a careful writer, not a general database client. Every write replicates what the app does — document numbering, `updated_at`, activity logging — or it doesn't happen at all.

---

## 1. Runtime and connection

| Concern | Choice |
|---|---|
| Language | TypeScript |
| Transport | stdio (local) or HTTP+SSE (remote) — see §8 |
| Data client | `@supabase/supabase-js` v2, matching the app |
| Target | Axiom Supabase project only. Never the Nexus/VenueOS project. |

### Environment

```
AXIOM_SUPABASE_URL          # Axiom project URL
AXIOM_SUPABASE_ANON_KEY     # anon key
AXIOM_MCP_USER_EMAIL        # dedicated Axiom user for this server
AXIOM_MCP_USER_PASSWORD
```

**Authenticate as a dedicated user, not with the service-role key.**

The brief offers both. Use option 2 — sign in via `signInWithPassword` and act as `authenticated` under RLS. Reasons:

- Service-role bypasses RLS entirely. A bug in this server becomes an unconstrained write against production.
- Writes stay attributable. `activity_log` entries carry a real identity instead of "system."
- If the server is ever compromised or misconfigured, the blast radius is one revocable user account.

Create a dedicated Axiom user (e.g. `mcp@relicbuilt.com`) rather than reusing a personal login, so activity is distinguishable in the log.

Refresh the session on expiry; fail closed with a clear error if sign-in fails.

---

## 2. Shared helpers

Implement once, use everywhere.

### 2a. `generateEstimateNumber()`

Port from the app, with one fix:

```ts
const year = new Date().getFullYear();
const { data: latest } = await axiom.from("estimates")
  .select("estimate_number")
  .like("estimate_number", `EST-${year}-%`)
  .order("estimate_number", { ascending: false })
  .limit(1)
  .maybeSingle();          // NOT .single()
const lastNum = latest?.estimate_number
  ? parseInt(latest.estimate_number.split("-").pop() || "0", 10)
  : 0;
return `EST-${year}-${String(lastNum + 1).padStart(4, "0")}`;
```

The app uses `.single()`, which throws on zero rows — it fails on the first estimate of a new calendar year. Use `.maybeSingle()`.

`estimate_number` is `unique not null` with no DB sequence, so there is a race window. On insert, catch unique-violation (Postgres `23505`) and retry up to 3 times with a regenerated number.

### 2b. `calcTotals(line_items, labor_items, markup_percent)`

Mirror the app exactly:

```
materialTotal = Σ (quantity × unit_price)
laborTotal    = Σ cost
subtotal      = materialTotal + laborTotal
markupAmount  = subtotal × (markup_percent / 100)
total         = subtotal + markupAmount
```

Totals are **not stored**. Compute on read and include in every tool response — the whole point of chat-based estimating is seeing the number without opening the app.

Round to 2 decimals for display only; never write rounded values back.

Also return `margin_percent = markupAmount / total × 100` for convenience. A 50% markup yields 33.3% margin, and having both visible prevents confusing the two.

### 2c. `logActivity(...)`

Every create and update writes an `activity_log` row, matching `src/lib/activity.ts`. Use `action`, `entity`, `entity_id`, `label`, `user_name` (the MCP user email), and a `meta` object noting `source: "mcp"` so MCP-originated writes are filterable.

### 2d. `stampUpdatedAt()`

No DB trigger maintains `updated_at`. Every update sets it to `new Date().toISOString()`.

### 2e. Money validation

All money is decimal dollars (`numeric`), not integer cents. Reject non-finite numbers, negative `unit_price`, and negative `quantity` at the tool boundary with a clear message.

---

## 3. Tools — estimates

### `create_estimate`

Creates a draft estimate.

| Param | Type | Req | Notes |
|---|---|---|---|
| `project_name` | string | yes | |
| `client_name` | string | no | |
| `client_email` | string | no | |
| `client_phone` | string | no | |
| `customer_id` | uuid | no | FK → `customers` |
| `custom_work_id` | uuid | no | link to an existing project |
| `unit_count` | integer | no | see §6 |
| `markup_percent` | number | no | default 0 |
| `notes` | string | no | |

Behaviour: generate `estimate_number`, insert with `status: "draft"`, `line_items: []`, `labor_items: []`. Log activity. Return the full row plus computed totals.

Never accept `id`, `status`, or `estimate_number` as parameters. Status is out of scope; the other two are generated.

### `add_line_items`

Appends material line items to an existing estimate.

| Param | Type | Req |
|---|---|---|
| `estimate_id` | uuid | yes |
| `items` | array of `EstimateLineItem` | yes |

Each item: `item_number` (string), `description` (string), `quantity` (number), `unit_price` (number, dollars), `unit` (string, e.g. `ea`, `roll`, `ls`, `hr`).

Behaviour: read current `line_items`, append, write back, stamp `updated_at`, log activity, return updated estimate with recomputed totals.

`line_items` is JSONB with no DB-level validation — validate shape at the tool boundary. Reject items missing any of the five fields.

### `add_labor_items`

Same pattern for `labor_items`.

Each item: `description` (string), `hours` (number), `rate` (number, dollars/hr), `cost` (number, dollars).

**`cost` is stored directly, not derived.** Compute `hours × rate` server-side and use it; if a caller supplies a `cost` that disagrees with `hours × rate` by more than $0.01, reject with both figures in the error rather than silently picking one.

### `replace_estimate_items`

Full replacement of both arrays, for revision rather than accumulation.

| Param | Type | Req |
|---|---|---|
| `estimate_id` | uuid | yes |
| `line_items` | array | no |
| `labor_items` | array | no |
| `markup_percent` | number | no |

Only replaces arrays explicitly provided. Omitting `line_items` leaves it untouched — it does not clear it. Document this clearly; ambiguity here destroys estimates.

### `get_estimate`

By `estimate_id` or `estimate_number`. Returns the row plus `materialTotal`, `laborTotal`, `subtotal`, `markupAmount`, `total`, `margin_percent`.

### `list_estimates`

| Param | Type | Notes |
|---|---|---|
| `status` | string | optional filter |
| `client_name` | string | optional, partial match |
| `custom_work_id` | uuid | optional |
| `limit` | integer | default 20, max 50 |

Ordered `created_at` descending. Returns summary rows with computed `total` on each — enough to identify an estimate without a second call.

---

## 4. Tools — projects

### `create_project`

Inserts into `custom_work`.

| Param | Type | Req | Notes |
|---|---|---|---|
| `project_name` | string | yes | NOT NULL in DB |
| `client_name` | string | no | |
| `client_email` | string | no | |
| `client_phone` | string | no | |
| `customer_id` | uuid | no | |
| `project_description` | string | no | |
| `status` | enum | no | default `new` |
| `quoted_amount` | number | no | dollars |
| `unit_count` | integer | no | |
| `start_date` | ISO date | no | |
| `due_date` | ISO date | no | |
| `internal_notes` | string | no | |

`status` ∈ `new`, `in_review`, `quoted`, `in_progress`, `complete` — enforced by a DB CHECK constraint, so validate at the boundary to return a useful error instead of a Postgres one.

Do not accept `portal_enabled`, `portal_token`, or any `proposal_*` field. Those gate anonymous external access and belong in the UI.

### `get_project`

By id. Uses the PostgREST embed to include estimates:

```ts
await axiom.from("custom_work").select("*, estimates(*)").eq("id", id).single();
```

Compute and attach totals to each embedded estimate.

### `convert_estimate_to_project`

Two writes, no RPC exists.

1. Compute total via `calcTotals`
2. Insert `custom_work` with `quoted_amount = total`, carrying `project_name`, client fields, `customer_id`, `unit_count`
3. Update the estimate's `custom_work_id` to the new project id

**Not atomic.** If step 3 fails after step 2 succeeds, an orphan project exists. On step-3 failure, return an error naming the created project id and stating the estimate is still unlinked, so it can be fixed rather than silently duplicated. Do not auto-delete the project on failure.

Refuse if `custom_work_id` is already set — return the existing project instead of creating a second one.

---

## 5. Error handling

Return actionable errors, not raw Postgres.

| Condition | Response |
|---|---|
| Unique violation on `estimate_number` | Retry 3×, then fail naming the collision |
| CHECK constraint violation | Name the field and list valid values |
| Estimate not found | State the id searched |
| Auth failure | State that the MCP user could not sign in; do not leak env values |
| Row-level security denial | Distinguish from not-found — they look identical through PostgREST |

That last one matters: under RLS a denied read returns empty, indistinguishable from a missing row. If a read returns nothing and the caller supplied a well-formed uuid, say so explicitly rather than asserting the record doesn't exist.

---

## 6. `unit_count` — resolve before first write

`unit_count` exists on both `estimates` and `custom_work`, but `calcTotals` never references it. Two possible meanings:

**(a) Metadata.** Line items carry job-level quantities; `unit_count` is descriptive only. This spec assumes (a).

**(b) Multiplier applied somewhere in the UI** not captured in the brief. If so, entering job-level quantities *and* setting `unit_count` double-counts.

Verify by opening an existing multi-unit estimate in the app and checking whether the displayed total equals `Σ(qty × price)` or that times `unit_count`. Do not write a multi-unit estimate through MCP until this is settled.

> **Resolved:** the §10 acceptance test (unit_count 10) produced total $5,363.52, not $53,635.20 — `unit_count` is metadata (a).

---

## 7. Why status changes are excluded from v1

Setting `status` is a plain `UPDATE` under a CHECK constraint — there is no state machine. But the app's `persistEstimate` attaches side effects (lead advance/lost, and a `POST /api/wallflower-status` that mirrors status to Nexus). A raw PostgREST update performs none of these, so an estimate could read `sent` in Axiom while Nexus never hears about it.

Two acceptable v1 resolutions:

1. **Omit status writes.** Mark estimates sent in the UI. Simplest, and correct.
2. **Route through the app.** Add a thin authenticated Next.js API route wrapping `persistEstimate`, and have the MCP server call that rather than PostgREST.

Option 2 is the better end state and is the natural v2. Do not implement a raw status update.

> Note: the Leads feature (and its estimate→lead automation) was retired after this spec was written; the remaining `persistEstimate` side effect is the Wallflower/Nexus status mirror.

---

## 8. Transport

**Local (stdio)** — simplest, runs on the machine with Claude Desktop, credentials stay local. Start here.

**Remote (HTTP+SSE)** — needed for mobile or multi-machine use. If built, follow the pattern the brief describes for `/api/axiom/sync-wallflower`: verify the caller's bearer token with `auth.getUser(token)` before performing any write. Do not expose an unauthenticated write endpoint on the public internet.

---

## 9. Build order

1. Connection, auth, session refresh — verify with a read-only `list_estimates`
2. `calcTotals`, `generateEstimateNumber`, `logActivity`, `stampUpdatedAt`
3. `get_estimate`, `list_estimates`, `get_project` — reads only, verify against the UI
4. `create_estimate`
5. `add_line_items`, `add_labor_items`, `replace_estimate_items`
6. `create_project`
7. `convert_estimate_to_project`

Do not proceed past step 3 until a read through MCP matches what the Axiom UI displays for the same estimate, totals included. If they disagree, `calcTotals` or `unit_count` is wrong, and every subsequent write inherits the error.

> **Status:** steps 1–7 built and living in `axiom-mcp/`. Read gate passed (EST-2026-9704 → $3,811.50 matched the UI) and the §10 acceptance test passed to the cent.

---

## 10. Acceptance test — Kinetic Flame Columns

Build this estimate end to end through MCP, then open it in the Axiom UI and confirm it matches.

**Create estimate:** `project_name` "Kinetic Flame Columns", `unit_count` 10, `markup_percent` 50.

**Line items:**

| item_number | description | qty | unit_price | unit |
|---|---|---|---|---|
| RENT-BASE | Pipe & drape base, rental | 10 | 10.00 | ea |
| RENT-UPR | Upright pipe, rental | 10 | 10.00 | ea |
| FAB-HOOP | Shaping hoops, 1/4in round, rolled | 10 | 20.00 | set |
| FAB-COLR | Split shaft collars | 10 | 16.00 | pr |
| FAB-ARM | Spider arms, flat bar | 10 | 12.00 | set |
| MAT-SCRN | Phifer 3000739 brite aluminum screen 48in x 100ft | 6 | 161.78 | roll |
| MAT-HDW | Hog rings, tie wire | 10 | 15.00 | ea |
| TOOL | One-time tooling | 1 | 150.00 | ls |
| CONT | Contingency, 10% materials | 1 | 190.00 | ls |

**Labor items:**

| description | hours | rate | cost |
|---|---|---|---|
| Shop fabrication and mesh forming | 26 | 35.00 | 910.00 |
| Install and strike, on site | 12 | 35.00 | 420.00 |
| Rental pickup and return | 3 | 35.00 | 105.00 |

**Expected totals:**

```
materialTotal   2,140.68
laborTotal      1,435.00
subtotal        3,575.68
markupAmount    1,787.84
total           5,363.52
margin_percent      33.3
```

If the UI shows `total` × 10, `unit_count` is a multiplier and §6 resolved to (b) — stop and revise.
