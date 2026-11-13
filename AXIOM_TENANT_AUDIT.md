# Axiom Tenant Audit — tenant-specific hardcoding

**Status:** audit only. No code changed. Review before the fix phase.
**Date:** 2026-11-12

## Executive summary

Axiom carries business-specific content in three forms:

1. **Hardcoded fallback content** in the code — when a tenant setting is empty, the app falls back to **Wallflower RELIC** name/phone/footer/logo/colors instead of a neutral placeholder. (`src/lib/entity-profile.ts`, every document generator, several pages.)
2. **A two-tenant model baked into the code** — the entire app is written around exactly two hardcoded businesses, `wallflower_relic` and `relic`, as a TypeScript union, in RLS policies, table names, and an `/api/wallflower` Nexus integration. This is architecture, not content, and is the real productization work (the silo / per-account instance model already decided in `project_axiom_product_model`).
3. **Business assets and seed data** — Wallflower logos/icons in `public/`, and DB migration defaults that seed `RELIC` / `(402) 235-8179`.

The Terms & Conditions bug is a specific instance of #1 plus a **no-single-source-of-truth** problem: the Settings form, invoices, and proposals each read/write Terms from a *different* field, and pages cache settings in memory at mount. Details in **Root cause** below.

---

## Root cause — Terms & Conditions bug (Step 2)

**Symptom:** updated Terms in Settings, saved, refreshed, a generated invoice still showed the old Terms.

**There is no single source of truth for Terms.** Each surface uses a different field:

| Surface | Reads Terms from | Evidence |
| --- | --- | --- |
| Settings → Terms editor (write) | `settings.terms_text` — and, after a change made during this work, `relic_profile.terms` on the RELIC site | `src/app/axiom/settings/page.tsx:738` |
| Invoice HTML | the `terms` arg, which callers set to `settings.terms_text` | `src/app/axiom/invoices/page.tsx:384,695`; `src/app/api/cron/invoice-reminders/route.ts:93`; rendered at `src/lib/invoice-html.ts:175` |
| Proposal HTML | `relic_profile.terms || settings.terms_text` for RELIC (entity-specific precedence), else `settings.terms_text` | `src/lib/entity-profile.ts:260`; rendered at `src/lib/proposal-html.ts:233,534` |

So:

- **RELIC proposals** read `relic_profile.terms` first. The Settings box historically wrote `settings.terms_text`. Editing Terms updated `terms_text` but proposals kept rendering the stale `relic_profile.terms` → **old terms**. (This was partially patched during recent work by making the RELIC Settings editor write `relic_profile.terms` and copying the value across — but that **split the sources further**, see next point.)
- **Invoices** read `settings.terms_text` directly and are **not** entity-aware. After the recent patch, the RELIC Settings editor writes `relic_profile.terms`, leaving `terms_text` stale — so now an edit can update proposals while **invoices still render the old `terms_text`**. The two surfaces disagree.
- **Client-side staleness compounds it:** pages load `bizSettings`/`settings` once at mount (e.g. `src/app/axiom/invoices/page.tsx`). Editing Settings in one place and generating a document elsewhere without a full reload renders from the in-memory copy. Combined with the service-worker app-shell cache, a "refresh" may not refetch.

**No per-document snapshot is involved.** The `invoices` table has no `terms` column; `invoice.notes` is a separate per-invoice "payment terms" line, not the T&C. So the stale text comes from reading the wrong live field, not from a snapshot copied onto the invoice.

**Fix direction (for later):** one tenant Terms field, read **live** at generation time by every generator (invoice, proposal, PO, recap), with no entity-specific precedence; the Settings form writes that same field; document generators fetch settings server-side at render rather than trusting a client snapshot; empty Terms renders nothing (or a "set your terms" prompt), never fallback text.

---

## Findings (Step 3)

Categories: **branding**, **legal**, **pricing**, **contact**, **structural** (two-tenant architecture), **asset**.

### Contact info (phone / address / domain)

| File | Line | Hardcoded | Category | Proposed fix |
| --- | --- | --- | --- | --- |
| `src/lib/entity-profile.ts` | 199 | `footer: "Wallflower RELIC · (402) 235-8179 · wallflower-relic.com"` | contact/branding | Build footer from tenant settings; empty → blank |
| `src/lib/entity-profile.ts` | 196–197, 200, 205 | website `wallflower-relic.com`, logo URL, `fromName`, accent default | branding | Tenant settings; neutral defaults |
| `src/lib/invoice-html.ts` | 57 | footer fallback `Wallflower RELIC · (402) 235-8179 · …` | contact | Use tenant footer; empty → blank |
| `src/lib/proposal-html.ts` | 238, 599 | footer fallback `Wallflower RELIC Creative Rentals… (402) 235-8179` | contact | Tenant footer |
| `src/lib/po-html.ts` | 62 | footer fallback `Wallflower RELIC · (402) 235-8179 · …` | contact | Tenant footer |
| `src/lib/project-recap-html.ts` | 386 | footer `Wallflower RELIC · (402) 235-8179 · …` | contact | Tenant footer |
| `src/app/pay/[invoiceId]/page.tsx` | 59–61 | brand `Wallflower RELIC`, logo URL, `phone: "(402) 235-8179"` | contact/branding | Load from invoice's tenant; neutral until loaded |
| `src/app/pay/[invoiceId]/success/page.tsx` | 135 | `brand?.name || "Wallflower RELIC"` | branding | Neutral fallback |
| `src/app/contact/page.tsx` | 62 | `(402) 235-8179` | contact | Marketing site — tenant/site config |
| `src/app/new-client/page.tsx` | 159–160 | `call us at (402) 235-8179` | contact | Tenant setting |
| `src/components/layout/Footer.tsx` | 110 | `(402) 235-8179` | contact | Marketing site config |
| `src/app/approve/[token]/page.tsx` | 99–349 | logo, `Wallflower RELIC`, `(402) 235-8179`, `wallflower-relic.com` (multiple) | branding/contact | Load the document's tenant profile |
| `src/app/client/[token]/page.tsx` | 567 | `Wallflower RELIC · (402) 235-8179` | contact | Tenant profile |
| `src/app/axiom/portal/[token]/page.tsx` | 93, 112–114, 283 | `wr-emblem.png`, `WALLFLOWER RELIC`, phone | branding/contact | Tenant profile |
| `src/app/api/w9/route.ts` | 18 | "US Central (Omaha)" timezone comment/logic | other | Tenant timezone setting |

### Branding (names / logos / colors)

| File | Line | Hardcoded | Category | Proposed fix |
| --- | --- | --- | --- | --- |
| `src/lib/entity-profile.ts` | 153, 176–180 | RELIC name default `"RELIC"`, gold `#b8963c`, bar colors | branding | Tenant settings; neutral default palette |
| `src/lib/entity-profile.ts` | 186–209 | Wallflower default block (name, olive `#5b642e`, `#454d23`, from-name) | branding | Tenant settings; generic default |
| `src/lib/proposal-html.ts` | 57–58, 318–319, 642 | accent `#5b642e` / `#454d23` fallbacks | branding | From tenant; neutral default |
| `src/lib/invoice-html.ts` | 58, 60 | accent `#5b642e`, bar `#454d23` | branding | Tenant palette |
| `src/lib/notify-new-intake.ts` | 120, 129 | `#5b642e` olive in email template | branding | Tenant palette |
| `src/lib/project-recap-html.ts` | 39, 146 | `#454d23`, `#5b642e` | branding | Tenant palette |
| `src/lib/po-html.ts` | 66, 94, 132, 158, 167 | `#5b642e` throughout PO template | branding | Tenant palette |
| `src/app/layout.tsx` | 19–23 | `axiom.relicbuilt.com`, `Wallflower RELIC`, title `…Custom Woodworking & Metalworks` | branding | Site/tenant metadata config |
| `src/app/about/page.tsx` | 41–46 | Wallflower RELIC marketing copy | branding | Marketing site, separate from product |
| `src/app/axiom/inventory/page.tsx` | 323 | `Wallflower RELIC — Inventory Take Sheet` | branding | Tenant name |
| `src/app/axiom/estimator/page.tsx` | 3674 | `{entity === "relic" ? "RELIC" : "Wallflower RELIC"}` | branding | Tenant name |
| `src/app/axiom/calendar/page.tsx` | 87 | `"Relic" : "Wallflower RELIC"` label | branding | Tenant name |
| `public/` assets | — | `wr-logo-black.png`, `wr-emblem*.png`, `logo-full/emblem.png`, `icon-*-wr*.png`, `apple-touch-icon-wr*.png`, `relic-shield-gold.png`, `manifest.json` | asset | Move to per-tenant uploaded branding; ship a neutral default icon set |

### Legal (terms / warranty / fees / deposit rules)

| File | Line | Hardcoded | Category | Proposed fix |
| --- | --- | --- | --- | --- |
| `src/lib/entity-profile.ts` | 260 | `relic_profile.terms || terms_text` — entity-specific Terms precedence | legal | Single live tenant Terms field (see Root cause) |
| `src/app/axiom/settings/page.tsx` | 738 | Terms editor target field (now split RELIC vs other) | legal | Write the one canonical Terms field |
| `src/lib/po-html.ts` | 12–36 | `LIBERTY_HARDWOODS_STANDING` + `VENDOR_STANDING_INSTRUCTIONS` keyed to a specific vendor id/name | legal/contact | Move to per-vendor record field (vendor "standing instructions") in DB |
| `src/lib/proposal-html.ts` | 517, 521 | `Deposit (X%) — to schedule & begin work` / `Balance (…%) — due on completion` wording | legal | Tenant-configurable payment-terms wording |
| DB `deposit_percent` default 50 | `supabase/axiom-migration.sql:13` | default deposit rule | legal/pricing | Keep as generic default (acceptable) |

> No `1.5%` late-fee, `90-day` warranty, or `100% upfront`/`nonrefundable` strings are hardcoded in the product code (the 1.5%/late-fee logic is tenant data via `late_fee_apr`; the "1.5% per month" wording lives only in the tenant's saved Terms text, not in code).

### Pricing (tax / rates / defaults)

| File | Line | Hardcoded | Category | Proposed fix |
| --- | --- | --- | --- | --- |
| `src/lib/assistant/tools.ts` | 358 | tax_rate "defaults to 8.75" | pricing | Tenant default tax rate |
| `src/lib/estimate-import.ts` | 60 | labor rate fallback `60` | pricing | Tenant default labor rate |
| `supabase/axiom-migration.sql` | 11, 13, 18 | `accent_color #c4a24d`, `deposit_percent 50`, `categories {Woodworking,…}` seed | pricing/branding | Generic defaults are fine; brand color should be neutral |
| `src/lib/tenancy/phase1.test.ts` | 53–54, 156 | test data `Garrett/Misty Schmidt`, emails, rates | other (tests) | Fine in tests; rename to generic fixtures for a clean product |

### Structural — the two-tenant model (architecture, not content)

This is the bulk of the ~1,000 `wallflower`/`relic` hits. It is the productization work itself, not line-level content edits. Representative evidence:

| Area | Evidence | Proposed fix |
| --- | --- | --- |
| Entity union hardcoded to two businesses | `src/types/axiom.ts:75` (`BusinessEntity`); `src/lib/axiom-site.ts` (`SITE_ENTITY`) | Replace with per-account tenant id; the silo/per-instance model in `project_axiom_product_model` |
| `wallflower_relic` as the default entity everywhere | `src/app/axiom/projects/page.tsx:466,1641,2865`; `estimator:1959,1970,2253`; `api/approve-estimate-proposal:152`; `api/upload-logo:20` | Derive tenant from session/site, no literal default |
| RLS policies gate on `entity = 'wallflower_relic' OR has_relic_access()` | `supabase/axiom-migration-v38.sql:22–33`, `v39.sql:23–24` | Tenant-scoped RLS (generic `current_tenant_id()`), per the tenancy work |
| Nexus integration named `/api/wallflower`, `wallflower_work_orders`, `relic-build-link`, status webhooks | `src/app/api/wallflower/*`, `src/lib/wallflower-status.ts`, `src/lib/notify-nexus-build-link.ts` | Generic "intake"/"external integration" naming + per-tenant config; keep as Wallflower's integration config in DB |
| Seed inserts a Wallflower/RELIC settings row | `supabase/axiom-migration.sql:7,23` (`biz_name default 'RELIC'`, `insert … values ('RELIC')`) | Seed an empty/neutral tenant; Wallflower becomes tenant #1 as data |

### Assets

- `public/` holds Wallflower/RELIC-specific icons, logos, emblems, and `manifest.json` (name/theme). Ship a neutral default icon/manifest in the base product and serve tenant branding from uploaded assets (the `branding` settings + `/api/upload-logo` already exist for this).

---

## Recommended fix-phase order (for review — not yet actioned)

1. **Terms single-source-of-truth** (fixes the reported bug): one tenant Terms field read live by every generator; Settings writes it; drop the entity precedence; render nothing when empty.
2. **Neutralize fallbacks** in `entity-profile.ts` and the five generators (`invoice-html`, `proposal-html`, `po-html`, `project-recap-html`, `notify-new-intake`): empty setting → blank/placeholder, never Wallflower content.
3. **Read settings live at generation** (server-side) so client staleness/SW cache can't serve old content.
4. **Per-vendor standing instructions** out of `po-html.ts` into the vendor record.
5. **Neutral default palette + default asset set**; tenant branding from uploads.
6. **Tenant model** (largest): collapse the hardcoded `wallflower_relic`/`relic` entity system into per-account tenancy/silo — the separate productization project; Wallflower RELIC becomes tenant #1 as data, not code.

**Guardrail to add:** a lint/CI check that fails the build on the literal strings `Wallflower`, `(402) 235-8179`, `wallflower-relic.com`, and the specific hex brand colors outside of tenant-seed data, so business content can't creep back into the base product.
