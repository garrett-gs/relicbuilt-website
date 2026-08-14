# Nexus ↔ Axiom Workflow Spec

The operating model for the merged Wallflower RELIC system (Option B: keep both
front-ends, share identity + core data). This defines who owns what, the two
product tracks, and the end-to-end custom-build lifecycle with its data
contracts. It's a workflow/design spec — not an implementation plan.

Companion to `AXIOM_INTEGRATION_BRIEF.md`.

---

## 1. The two systems, at a glance

- **Nexus (VenueOS)** — front-of-house. Sales, quotes/orders, the rentable
  inventory catalog, rental pricing, client-facing everything.
- **Axiom** — back-of-house. Fabrication, custom-build profiles, estimating,
  markup/margin, materials/shop-supply inventory, finance (invoices/POs).

Both stay in use. They share identity (people/customers/companies) and
cross-reference each other's records.

## 2. Ownership map (source of truth)

| Entity | Owner | Notes |
|---|---|---|
| People / customers / companies | **Nexus** | Front-of-house CRM; Axiom consumes |
| Work orders | **Axiom** | Requestable from either side, stored here |
| Custom-build profile / spec | **Axiom** | Full detail lives here, never copied to Nexus |
| Estimate · markup · margin · **sale price** | **Axiom** | All build pricing decided here |
| Quotes / orders / the sale | **Nexus** | Client buys here |
| Rentable finished-goods inventory | **Nexus** | The catalog, availability, bookings |
| **Rental price** | **Nexus** | Set once Nexus owns the item |
| Materials / shop supplies inventory | **Axiom** | Fabrication concern — Nexus never sees it |

**Pricing split:** Axiom prices *creation & sale*; Nexus prices *rental*.

## 3. Two product tracks (they share an order)

**Rentals** — Nexus owns the catalog and rents it to clients. Simple path.

**Custom builds** — requested → built & priced in Axiom → sold in Nexus →
(typically) become rentable Nexus inventory afterward.

A single Nexus order can carry **both** rental items and custom-build items. On
such mixed orders, the custom-build's approval **status is shown in Nexus**
alongside the rentals, even though the sign-off happens in Axiom.

## 4. Inventory model

Nexus is the single inventory owner, fed from **two sources**:

1. **Purchased** — buy a ready-made rentable item → straight into Nexus. Nexus
   sells/rents it. **No Axiom involvement.**
2. **Custom build** — after it's sold/rented the first time, Axiom **creates**
   the inventory record and hands it to Nexus, which **owns** it and sets its
   rental price.

New inventory of type (2) is **born in Axiom, lives in Nexus** — same push
direction as the sale price.

## 5. Custom-build lifecycle (sell-then-build)

The normal path. "Built" = spec + price are produced in Axiom; **physical
fabrication happens after the client commits.**

| # | State | Owner | What happens | Crosses over |
|---|---|---|---|---|
| 1 | **Requested** | Nexus (or Axiom) | Custom-build request created | Nexus → Axiom: customer, description, qty, deadline, images |
| 2 | **Scoping / estimating** | Axiom | Build profile + scope + estimate; markup & margin set | internal to Axiom |
| 3 | **Priced** | Axiom → Nexus | Sellable summary pushed | Axiom → Nexus: **total (post-markup) + title + description + reference link** |
| 4 | **Quoted** | Nexus | Salesperson quotes the client (with rental items if mixed) | — |
| 5 | **Sold** (accepted / paid) | Nexus | Client commits & pays | Nexus → Axiom: "sold" signal |
| 6 | **Sign-off → build greenlit** | Axiom | *Separate* Axiom sign-off starts the active work order | Axiom → Nexus: **status shown in Nexus** |
| 7 | **Building** | Axiom | Fabrication | status updates → Nexus |
| 8 | **Delivered** | Axiom / Nexus | Item goes out for the event | — |
| 9 | **→ Inventory** *(typical, not universal)* | Nexus (record created by Axiom) | Item becomes rentable Nexus inventory; Nexus sets rental price | Axiom creates the record → Nexus owns |

### Two acceptances (don't conflate them)
- **#5 Sales acceptance (Nexus)** — the client pays. This is the trigger.
- **#6 Fabrication sign-off (Axiom)** — a *separate* "we're taking it on,
  greenlight the build" that opens the active work order. Its **status is
  surfaced in Nexus** (critical on mixed orders).

### Terminus edge cases
- **Rented** custom build → returns → becomes inventory (step 9). Typical.
- **Sold outright** → client keeps it → **does not** become inventory. Step 9
  is skipped.

## 6. Data contracts (what crosses the boundary)

**Nexus → Axiom**
- *Custom-build request:* customer (shared id), description/project name,
  quantity, deadline, reference images.
- *Sold signal:* the client accepted/paid → greenlight (drives Axiom sign-off).

**Axiom → Nexus**
- *Sellable summary (the "price-back"):* total post-markup price, custom-build
  title, description/project name, and a **reference/deep-link** to the Axiom
  build (detail stays in Axiom — Nexus is kept lean, by design).
- *Status:* fabrication sign-off + build status, for display in Nexus.
- *New inventory record:* on completion, Axiom creates the finished-good record
  Nexus will own (Nexus then sets the rental price).

**Stays in Axiom only:** full build profile, spec, estimate line items, markup,
margin, materials inventory.

## 7. What exists today vs. what's new

Already wired:
- Work orders flow Nexus → Axiom (`wallflower_work_orders`, `wallflower_order_id`).
- Work orders originate in Axiom too (most do).
- Axiom work orders reference live Nexus quotes/orders (`nexus_ref`).
- Estimate **status** mirrors Axiom → Nexus (`/api/wallflower-status`).

The new pieces this workflow needs:
1. **Price-back to Nexus** — push total + title + description + reference when
   the Axiom estimate finalizes (today only *status* flows back).
2. **Custom-build request intake** — a first-class request from Nexus that lands
   as an Axiom work order in the "requested" state.
3. **Fabrication sign-off state + status surfacing** — the separate Axiom
   sign-off, its status shown in Nexus.
4. **Inventory creation hand-off** — Axiom creates the finished-good record on
   completion; Nexus owns it and sets rental price.

## 8. Open / deferred (not blocking the workflow)
- Auth: two user pools today; unify vs. federate — decide during the merge build.
- Whether the shared identity layer is one DB or two-DBs-linked (Option B
  sub-choice); see `AXIOM_INTEGRATION_BRIEF.md`.
- Exact request/response transport (Axiom already has a server-side Nexus
  client; lean toward Axiom pushing).
