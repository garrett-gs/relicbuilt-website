# Passdown — Axiom multi-tenant productization (for Claude Desktop)

You're picking up work on **Axiom**, a business-management app being turned into a sellable multi-tenant SaaS. A repo audit is **done**; this briefs you to execute the fix phase. Read this top to bottom before touching code.

**Repo:** `relicbuilt-website` (Next.js App Router). **Full findings:** `AXIOM_TENANT_AUDIT.md` in the repo root — read it; this passdown summarizes and adds the operational context it doesn't.

---

## Mission

Base product code must contain **zero business-specific content**. Everything business-specific (name, logo, colors, phone, address, terms, tax/deposit defaults, vendor rules) is a **tenant-configurable input stored per account**. "Wallflower RELIC" becomes **tenant #1 whose data lives in the database, not the code.**

**Rules for every fix:**
- Settings are read **live at document-generation time** (prefer server-side fetch, not a client snapshot loaded at mount).
- Already-issued documents may keep a snapshot **only on purpose and clearly labeled**.
- Empty settings render a **neutral placeholder or required-field prompt — never Wallflower content.**
- Don't invent new business content; move existing content to settings, make it a generic default, or delete it.

---

## Current state

- **Audit complete**, written to `AXIOM_TENANT_AUDIT.md` (table: file, line, what's hardcoded, category, proposed fix).
- **No product code has been changed** for this effort yet — the user asked to review the audit first. **Get explicit approval per phase before editing.**
- The user (business owner, non-engineer on the code but very hands-on) will test in the live app and wants plain-language status, not jargon.

---

## Root cause you must fix first — Terms & Conditions

**Symptom:** edited Terms in Settings, saved, refreshed → a generated invoice still showed old Terms.

**Cause: no single source of truth.** Each surface reads a *different* field:
- Invoices → `settings.terms_text` (`src/app/axiom/invoices/page.tsx:384,695`; rendered `src/lib/invoice-html.ts:175`).
- Proposals (RELIC) → `relic_profile.terms || settings.terms_text` — entity-specific precedence (`src/lib/entity-profile.ts:260`; rendered `src/lib/proposal-html.ts:233,534`).
- Settings editor writes `settings.terms_text` (and, after a recent patch, `relic_profile.terms` on the RELIC site — which *split the sources further*).

So an edit updates one field while a document renders from another; client pages also cache settings at mount and a service worker caches the shell, so "refresh" may not refetch. **No per-document snapshot exists** (the `invoices` table has no terms column; `invoice.notes` is a separate payment-terms line).

**Fix:** one tenant Terms field, read live by **every** generator (invoice, proposal, PO, recap), Settings writes that same field, drop the entity precedence, empty → render nothing.

---

## Fix-phase order (from the audit — confirm with the user before each)

1. **Terms single-source-of-truth** (fixes the reported bug).
2. **Neutralize fallbacks** in `src/lib/entity-profile.ts` and the five generators: `invoice-html.ts`, `proposal-html.ts`, `po-html.ts`, `project-recap-html.ts`, `notify-new-intake.ts`. Empty setting → blank/placeholder, never "Wallflower RELIC / (402) 235-8179 / wallflower-relic.com / #5b642e".
3. **Read settings live server-side** at generation, so client/SW staleness can't serve old content.
4. **Per-vendor standing instructions** out of `po-html.ts:12–36` (Liberty Hardwoods hardcode) into the vendor record.
5. **Neutral default palette + default asset set** (`public/` has Wallflower logos/icons/manifest); tenant branding via the existing `branding` settings + `/api/upload-logo`.
6. **Tenant model** (largest, separate project): collapse the hardcoded `wallflower_relic`/`relic` entity union, RLS policies, and `/api/wallflower` naming into per-account tenancy. The decision of record is the **silo / one-isolated-instance-per-company** model (see the user's memory `project_axiom_product_model`), which supersedes the shared-DB tenancy.

Suggested guardrail: a CI/lint check that fails the build if `Wallflower`, `(402) 235-8179`, `wallflower-relic.com`, or the brand hex colors appear outside tenant-seed data.

---

## How Axiom ships (operational context you won't otherwise have)

- **This is NOT the Next.js you know.** `AGENTS.md` warns the version has breaking changes — **read `node_modules/next/dist/docs/` before writing framework code.**
- **Two deployments from one repo:**
  - `main` branch → **`axiom.relicbuilt.com`** (RELIC company, `SITE_ENTITY=relic`).
  - `wallflower-release` branch → **`axiom.wallflower-relic.com`** (Wallflower, `SITE_ENTITY=wallflower_relic`).
  - Vercel auto-deploys on push. To ship to Wallflower: `git push origin main:wallflower-release` (fast-forward). Verify a deploy: `curl https://<host>/sw.js | grep BUILD_VERSION` vs `git rev-parse HEAD`.
- **Shared Supabase DB** (project `mnkjjqtvgbrclmlppaid`) currently holds BOTH companies as tenants, with RLS. Env: `NEXT_PUBLIC_AXIOM_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY` in `.env.local`.
- **DDL cannot run via the app/PostgREST.** Schema changes go to the user as SQL to paste into the Supabase SQL editor. The user strongly prefers SQL/long copy delivered via clipboard (`pbcopy`), not files to open.
- **Estimate numbers are globally unique** across both tenants in the shared `estimates` table; compute the next number from the global max via `/api/next-estimate-number` (service role), not a tenant-scoped client query — a tenant-scoped "max+1" collides with the other company's numbers.
- **Auto-update:** the app polls the deploy SHA every ~2 min and shows a "new version ready — Reload" pill; a reload clears the service worker + Cache Storage. If the user reports "my change isn't showing," it's often the SW cache — have them click the pill or unregister the SW once.

## Gotchas / guardrails

- **Classifier-gated actions** (in the user's Claude Code harness): writes to shared settings, roster/permissions, bulk deletes, and production deploys (`git push … wallflower-release`) are blocked for the assistant and must be run **by the user** (they can run a command with a `!` prefix, or paste SQL). Plan for handing those off.
- **Verify before deploying:** run `npx tsc --noEmit` and `npm run build`. Both must pass.
- **The user tests live.** After a change, deploy to the right branch(es) and tell them exactly what to click.
- **Don't widen scope.** The audit is phased on purpose; do one phase, get it confirmed, move on.

## Key files map

| Concern | File |
| --- | --- |
| Entity identity + all fallbacks | `src/lib/entity-profile.ts` |
| Invoice HTML | `src/lib/invoice-html.ts` |
| Proposal HTML | `src/lib/proposal-html.ts` |
| Purchase-order HTML + vendor hardcode | `src/lib/po-html.ts` |
| Project recap HTML | `src/lib/project-recap-html.ts` |
| New-intake notification email | `src/lib/notify-new-intake.ts` |
| Settings UI (Terms editor, branding) | `src/app/axiom/settings/page.tsx` |
| Site/tenant constants | `src/lib/axiom-site.ts`, `src/types/axiom.ts` (`BusinessEntity`) |
| DB defaults / seed / RLS | `supabase/axiom-migration*.sql` |
| Branded assets | `public/` (`wr-*`, `logo-*`, `icon-*`, `manifest.json`) |

---

## Your first move

1. Read `AXIOM_TENANT_AUDIT.md`.
2. Confirm with the user which phase to start (recommend **Phase 1: Terms SSOT**).
3. Propose the concrete change for that phase (files, approach, any SQL) and get a yes before editing.
4. Implement → `tsc` + `build` → deploy to the correct branch(es) → tell the user what to verify.
