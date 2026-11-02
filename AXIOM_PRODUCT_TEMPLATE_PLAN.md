# Axiom Clean-Template & Config-Extraction Plan

Turning Axiom from a hardcoded two-business app (Wallflower RELIC + RELIC in one
database) into an **unbranded product** that deploys as one isolated instance per
company. This is Step 1 of the silo product model (see memory
`project_axiom_product_model`): the thing every later step — provisioning
pipeline, per-customer deploys — depends on.

Companion to `AXIOM_INTEGRATION_BRIEF.md` and `AXIOM_MCP_SERVER_SPEC.md`.

---

## 0. End state (the north star)

**One deployment = one company = one database = one `settings` row.** The code
carries zero knowledge of "Wallflower" or "RELIC." An instance is defined by:

| Layer | Holds | Why there |
|---|---|---|
| **Env** (per deployment) | Secrets + deployment identity: Supabase URL/keys, Stripe keys, Resend key, `NEXT_PUBLIC_SITE_URL`, brand name, owner email, feature flags | Set once at deploy; never in the DB; different per instance |
| **DB `settings` row** | Business identity + branding: name, address, phone, email, website, logo library, accent color, terms, venmo, deposit/reminder rules, team | Editable by the customer in-app; already per-instance today |
| **Code** | Behavior only — **no** brand literals, **no** `entity` branching, **no** hardcoded domains/colors/logos | The product |

What disappears entirely: the `BusinessEntity` union, the `entity` column
branching, the `relic_profile` dual-store, the business switcher, and every
`"wallflower_relic"` / `"relic"` / `relicbuilt.com` / `#5b642e` / `#b8963c`
literal baked into code.

What becomes an **optional module** (not deleted): the Nexus/VenueOS bridge and
the "WR collects in Nexus, Relic collects via Stripe" payment split — gated by a
config flag so Garrett's own WR instance keeps it and a generic customer never
sees it.

---

## 1. Why this is tractable

Both code inventories agree: identity is **already mostly centralized** through
`src/lib/entity-profile.ts` (`resolveEntityProfile`, `proposalBiz`,
`notificationsAddressFor`, `logoForPlacement`, `venmoLinks`) driven by the
`settings` row. The document templates (`invoice-html.ts`, `po-html.ts`,
`proposal-html.ts`) already take a resolved profile. The live accent is already
injected at runtime from settings in `EntityProvider`.

So this is **mostly a consolidation**, not a rewrite. The messy surface is:
1. A second code path for the second business (`entity === "relic"` branches + the `relic_profile` store).
2. ~Dozens of hardcoded *fallbacks* that duplicate what's already in `settings` (olive/gold hexes, `wr-logo-black.png`, `wallflower-relic.com`, `notifications@relicbuilt.com`).
3. Compile-time brand chrome (`layout.tsx` BRAND block, `manifest.json`).

---

## 2. Decisions to lock (recommended defaults in **bold**)

- **D1 — Config boundary:** the env/DB split in §0. **Recommend as written.**
- **D2 — Collapse the dual store:** fold `relic_profile` JSONB into the single flat
  `settings` shape; drop the `biz_*` vs `relic_profile` branching. **Recommend yes**
  — a one-company instance never needs two profiles.
- **D3 — Nexus + payment-split become an optional module** behind `NEXUS_CONNECTED`
  / a `paymentsMode` flag, not removed. **Recommend yes** (keeps WR's instance whole).
- **D4 — One Stripe account per instance:** retire `getStripe(entity)` and the
  `STRIPE_SECRET_KEY_RELIC` second key; each instance has its own single account.
  **Recommend yes.**
- **D5 — Theme model:** neutral base theme in `globals.css`; single accent injected
  at runtime from `settings.accent_color`; kill the gold/olive literals.
  **Recommend yes.**
- **D6 — RESOLVED (Garrett, 2026-11-01): the product is RELICON-branded; the
  customer adds their own branding in settings.**
  - **App chrome = fixed Relicon/Axiom branding** — login screen, sidebar
    "Axiom by Relicon" mark, "powered by Relicon." Constant on every instance;
    not customer-configurable. (Assets already exist: `/brand/shared/relicon-mark-on-dark.svg`,
    `powered-by-relicon-on-dark.svg`, `/brand/axiom/relicon-axiom-login-on-dark.svg`.)
  - **Customer branding lives in `settings`** (name, logo, accent, address, terms,
    venmo) and renders on their outward-facing **documents** — invoices, proposals,
    POs, emails to *their* clients — via `resolveInstanceProfile`.
  - **The public marketing site is NOT part of the product** — strip
    `src/app/page.tsx`, `src/components/layout/{Navbar,Footer}.tsx`,
    `src/app/contact/page.tsx` and the relicbuilt.com/Wallflower marketing brand
    out of the template. Axiom = the `/axiom` app only.
  - Sub-point (recommended default, say if you disagree): the customer's
    `accent_color` keeps tinting the **admin UI** too (that runtime injection in
    `EntityProvider` already exists and is cheap); the Relicon marks stay fixed
    regardless. So the shell is Relicon-branded but accented in the customer's color.
- **D7 — OPEN QUESTION:** does the existing combined deployment get **refactored in
  place** (and then deployed twice, once per business), or do we **fork a clean
  template repo**? Recommend refactor-in-place: the end state has no combined
  deployment anyway, and one codebase is far less to maintain across N instances.

---

## 3. Phased plan

Ordered so the **live WR+RELIC deployment keeps working** until the final cutover.
Phases A–B are pure refactors with no visible change; C–F build the single-instance
path; G is the shippable template.

### Phase A — Introduce the instance-config module *(low risk, no behavior change)*
Create `src/lib/instance-config.ts` as the single source of deployment identity,
reading env with **no WR/RELIC defaults**:
- brand display name, legal name, primary domain, `NEXT_PUBLIC_SITE_URL`
- owner email(s) (today defaulted to `garrett@relicbuilt.com` in `axiom-site.ts:31`)
- feature flags: `nexusConnected`, `paymentsMode`, marketing-site on/off
- derived: default theme color, email sender domain

Fold `src/lib/axiom-site.ts` into it. Keep `SITE_ENTITY` working as a thin alias
for now so nothing breaks.

### Phase B — Route hardcoded fallbacks through the resolver *(low risk)*
Kill the duplicated literals; on the WR instance the resolver returns the same
values, so **nothing changes visibly**. Targets from the inventory:
- **Email senders** bypassing `resolveEntityProfile`: `api/send-po/route.ts:28`,
  `api/notify-portal/route.ts:115`, `api/cron/daily-task-digest/route.ts:156`,
  `api/approve-proposal/route.ts:103`, `api/send-w9/route.ts:118`; and the
  `reply_to` / internal-recipient `garrett@relicbuilt.com` fallbacks
  (`approve-estimate-proposal:279,331`, `master-proposal/decision:228,252`,
  `send-proposal-email:226`, `cron/proposal-nudges:146`, `notify-payment-team.ts:72`,
  `notify-new-intake.ts:16`).
- **URL fallbacks** `|| "https://relicbuilt.com"` → config site URL:
  `invoice-html.ts:50`, `pay-invoice/route.ts:60`, `cron/daily-task-digest:125`,
  `approve-proposal:242`, `notify-new-intake.ts:68`, plus every `host || "relicbuilt.com"`.
- **Document brand fallbacks** (logo `wr-logo-black.png`, website `wallflower-relic.com`,
  footer, phone `(402) 235-8179`) in `invoice-html.ts:34-78`, `po-html.ts:55-66`,
  `proposal-html.ts:56-80`, `project-recap-html.ts`, `notify-new-intake.ts:121` →
  pull from the resolved profile / config default only.
- **Hardcoded secret fallback `wfrelic2026`**: `nexus/build-paid/route.ts:10`,
  `wallflower/route.ts:8`, `wallflower-status.ts:66`, `notify-nexus-build-link.ts:49`
  → require the env var (ties into the billing plan's bridge-secret unification).

### Phase C — Collapse the data model to one profile *(medium risk — data migration)*
- Rewrite `resolveEntityProfile(entity, settings)` → `resolveInstanceProfile(settings)`
  (drop the entity arg and the gold-vs-olive branch); same for `proposalBiz`
  (`entity-profile.ts:145-269`). Defaults come from config, not a second business.
- `src/app/axiom/settings/page.tsx`: drop `isRelicSite` branching and the
  `BIZ_KEY`/`RP_KEY` dual maps (`:128-145`); one store, one set of fields.
- Migrate any instance that used `relic_profile` into flat `settings` columns
  (only matters for RELIC's future instance). Keep the `branding` JSONB (logo
  library) as-is — it's already single-shape.
- `src/types/axiom.ts`: retire `RelicProfile` and `relic_access`; `Settings`
  becomes the one profile shape.

### Phase D — Remove the `entity` concept from app logic *(medium risk, wide but mechanical)*
One instance = one company, so rows aren't entity-split:
- Drop `.eq("entity", …)` scoping (~30 call sites listed in the inventory across
  `customers/invoices/projects/estimator/expenses/purchase-orders/...` and
  `lib/assistant/tools.ts`).
- Drop `|| "wallflower_relic"` insert stamps (~15 sites).
- Replace `entity === "relic"` behavioral branches: where it's cosmetic (logos,
  colors) it's already gone after C; where it's a real feature (deposit collected
  here vs Nexus) it moves to the `paymentsMode` flag (Phase E).
- `EntityProvider.tsx` → a single-brand **theme/profile provider** that keeps the
  runtime `--accent` injection (`:132-150`) but loses the switcher/second-entity
  logic. Remove the switcher UI in `Sidebar.tsx:182-207` and the `wallflowerOnly`
  nav gating.
- Reduce `BusinessEntity` (`types/axiom.ts:77`) to a single opaque tenant slug
  sourced from env, or remove it.

### Phase E — Modularize the Nexus bridge + payment split *(medium risk)*
Gate behind `nexusConnected` / `paymentsMode` so a generic instance has it OFF:
- `api/send-to-wr`, `api/nexus/build-paid`, `lib/sync-wallflower.ts`,
  `lib/notify-nexus-*`, the merged calendar (`lib/calendar-data.ts:123-149`,
  `calendar-feed/[token]:75`), notes "other side" (`notes/page.tsx`), and the
  "Relic collects deposit here / WR in Nexus" branches
  (`approve-estimate-proposal:197-293`, `master-proposal/deposit:43-64`).
- Stripe (D4): `lib/stripe.ts:13-28` → single `getStripe()`; one
  `STRIPE_SECRET_KEY` + one webhook secret (`stripe-webhook/route.ts`).

### Phase F — Fix the product chrome as Relicon-branded *(low–medium risk)* — per D6
The app shell is **constant Relicon/Axiom branding** (not per-instance); only the
customer's accent tints it and their brand shows on documents.
- `src/app/layout.tsx:9-27` BRAND block → collapse the `IS_RELIC` split into one
  fixed **Axiom by Relicon** brand (name/title/icons); drop the WR/RELIC variants.
- `public/manifest.json` (`name:"Axiom"`, `theme_color:#5b642e`) → fixed Relicon
  product values (neutral Relicon theme color, not olive).
- Favicon / app-icon / apple-touch set → one **Relicon/Axiom** icon set; delete the
  `-wr` variants and `relic-shield-gold.png` from the product. The customer's logo
  is a *document* asset (settings), never the app favicon.
- Keep the existing Relicon marks in `Sidebar.tsx:165,290` and `AxiomLogin.tsx:34`.
- `globals.css:16-18` → remove the `[data-entity="relic"]` gold override; accent is
  runtime-injected from `settings.accent_color` (keep the neutral base tokens).
- **Strip the marketing site** (D6): remove `src/app/page.tsx`,
  `src/components/layout/{Navbar,Footer}.tsx`, `src/app/contact/page.tsx` and the
  relicbuilt.com social/phone brand from the product template.

### Phase G — The shippable clean template *(the deliverable)*
- Seed/migration for an empty `settings` row with sane defaults.
- Neutral default theme + placeholder brand assets (generic "Axiom by Relicon").
- `.env.example` with the **full** per-instance var set and **no** WR/RELIC values;
  owner email required, no break-glass default.
- Smoke test: deploy with blank config → app runs, documents render with
  placeholders, no WR/RELIC string anywhere. Grep gate in CI: fail the build if
  `wallflower`, `relicbuilt`, `5b642e`, `b8963c`, or `wfrelic2026` appears outside
  `public/brand` and this plan.
- Hands off to Step 2 (provisioning pipeline).

---

## 4. Cutover (how the live businesses move)

End state has no combined deployment. Path:
1. Land Phases A–F in the repo (single-instance code path).
2. Stand up **two fresh instances** from the template: WR (Nexus module ON) and
   RELIC (Nexus OFF, its own Stripe account), each its own Supabase + Vercel + domain.
3. Migrate each business's data out of the shared DB (`mnkjjqtvgbrclmlppaid`) into
   its own instance; for RELIC, map `relic_profile` → flat `settings`.
4. Retire the combined deployment and the shared-DB tenancy machinery
   (`tenant_id`/RLS/`current_tenant_id`/roster-sync) — unnecessary once isolated.

## 5. Guardrails
- Phases A, B, F are safe on the live app (resolver returns identical values).
- C, D, E change shared behavior — stage them, and don't cut over the live
  businesses until their fresh instances are verified side-by-side.
- The CI grep gate (Phase G) is the regression guard against brand literals
  creeping back in.

## 6. Rough effort
A: 0.5d · B: 1–1.5d · C: 1.5–2d (+ migration) · D: 2–3d (wide, mechanical) ·
E: 1.5–2d · F: 1d · G: 1d. ≈ **9–12 focused days**, D being the long pole.
The exhaustive `file:line` location lists live in this session's two inventory
reports; this plan references representative anchors per cluster.
