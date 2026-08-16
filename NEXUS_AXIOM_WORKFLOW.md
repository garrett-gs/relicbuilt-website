# Nexus ↔ Axiom Workflow Spec

The operating model for the merged Wallflower RELIC system (Option B: keep both
front-ends, share identity + core data). Defines who owns what, the two product
tracks, and the end-to-end custom-build lifecycle with its data contracts. It's
a workflow/design spec — not an implementation plan.

Companion to `AXIOM_INTEGRATION_BRIEF.md`.

---

## 1. The two systems, at a glance

- **Axiom** — the build side **and the design/approval surface**. Fabrication,
  custom-build profiles, estimating, markup/margin, the **design proposal**
  (scope + images + schedule + **pricing** + final drawing), and the
  **customer's design+price approval**. Materials/shop inventory too.
- **Nexus (VenueOS)** — the sales/CRM side **and the money surface**. Identity
  (people/customers/companies), quotes/orders, the rentable inventory catalog,
  rental pricing, and **invoicing + payment**.

Both are customer-facing, but at **different moments**:
- **Axiom** presents the design proposal and collects the **design + price
  approval** (customer touch #1).
- **Nexus** sends the **invoice** and collects **payment** (customer touch #2).

They share identity and cross-reference each other's records.

## 2. Ownership map (source of truth)

| Concern | Owner | Notes |
|---|---|---|
| People / customers / companies | **Nexus** | Front-of-house CRM; Axiom consumes |
| Work orders | **Axiom** | Requestable from either side, stored here |
| Custom-build profile / spec / drawing | **Axiom** | Full detail lives here |
| Estimate · markup · margin · **build price** | **Axiom** | All build pricing decided here |
| **Design proposal + design/price approval** | **Axiom** | Customer approves design *and* price here |
| **Invoicing + payment** | **Nexus** | Money is collected here (build-only or mixed) |
| Quotes / orders | **Nexus** | The sales record the invoice is built from |
| Rentable finished-goods inventory | **Nexus** | Catalog, availability, bookings |
| **Rental price** | **Nexus** | Set once Nexus owns the item |
| Materials / shop supplies inventory | **Axiom** | Fabrication concern — Nexus never sees it |

**Pricing split:** Axiom prices *creation & sale* (and shows it on the proposal
so it's approved with the design); Nexus prices *rental* and *collects payment*.

## 3. Two product tracks (they share an order)

**Rentals** — Nexus owns the catalog and rents it to clients. Simple path.

**Custom builds** — requested → designed, estimated & priced in Axiom → approved
(design+price) in Axiom → invoiced & paid in Nexus → built → (typically) become
rentable Nexus inventory.

A single job can carry **both** rentals and a custom build. Either way the
**payment goes through Nexus** — the approved build amount lands on the Nexus
invoice alongside any rentals.

## 4. Inventory model

Nexus is the single inventory owner, fed from **two sources**:

1. **Purchased** — buy a ready-made rentable item → straight into Nexus. **No
   Axiom involvement.**
2. **Custom build** — after it's built/sold, Axiom **creates** the inventory
   record and hands it to Nexus, which **owns** it and sets its rental price.

New inventory of type (2) is **born in Axiom, lives in Nexus**.

## 5. Custom-build lifecycle

Design + price are approved in Axiom; money is collected in Nexus; fabrication
follows payment (or deposit).

| # | State | Owner | What happens | Crosses over |
|---|---|---|---|---|
| 1 | **Requested** | Nexus (or Axiom) | Custom-build request created; if from a quote it carries `nexus_ref` | Nexus → Axiom: customer, description, qty, deadline, images, **originating quote** |
| 2 | **Design + estimate** | Axiom | Build profile, final drawing, scope, schedule; estimate + markup/margin → **price** | internal to Axiom |
| 3 | **Design proposal sent** | Axiom → customer | Proposal (scope + images + schedule + **price** + drawing) sent for approval | — (customer-facing in Axiom) |
| 4 | **Design + price APPROVED** | Axiom | Customer approves the design *and* the price in one step | Axiom → Nexus: **approval event + approved amount** |
| 5 | **Approved → invoice** | Nexus | Nexus notates approved, adds the amount to the invoice/order (with rentals if mixed) | — |
| 6 | **Payment** | Nexus → customer | Invoice sent, customer **pays in Nexus** | Nexus → Axiom: **paid / deposit** signal → greenlight |
| 7 | **Building** | Axiom | Fabrication starts after payment/deposit | Axiom → Nexus: build status |
| 8 | **Delivered** | Axiom / Nexus | Item goes out for the event | — |
| 9 | **→ Inventory** *(typical)* | Nexus (record created by Axiom) | Becomes rentable Nexus inventory; Nexus sets rental price | Axiom creates the record → Nexus owns |

### Two customer approvals (don't conflate them)
- **#4 Design + price approval (Axiom)** — the customer signs off on *what*
  we're building and *what it costs*, together, in Axiom. Price rides with the
  design on purpose: approving a design without the number leads to balking and
  re-drawn variations after the fact.
- **#6 Payment (Nexus)** — the customer pays the invoice in Nexus. Build-only or
  mixed, money always flows through Nexus.

### Terminus edge cases
- **Rented** custom build → returns → becomes inventory (step 9). Typical.
- **Sold outright** → client keeps it → **does not** become inventory.

## 6. Data contracts (what crosses the boundary)

**Nexus → Axiom**
- *Custom-build request:* customer (shared id), description/project name,
  quantity, deadline, reference images, and the **originating quote** (`nexus_ref`).
- *Paid / deposit signal:* payment received in Nexus → greenlight fabrication.

**Axiom → Nexus**
- *Price-back:* the priced build line onto the Nexus quote (already built —
  `relic_builds` + a `quotes.items[]` entry keyed by `relic_build_id`).
- *Approval event:* when the customer approves the Axiom design proposal, push
  **"approved" + the approved amount** so Nexus marks it approved and moves it
  onto the invoice.
- *Build status:* fabrication status, for display in Nexus.
- *New inventory record:* on completion, Axiom creates the finished-good record
  Nexus will own.

**Stays in Axiom only:** full build profile, spec, drawing, estimate line items,
markup, margin, materials inventory. (Nexus sees the sellable price + approval,
not the internal cost breakdown.)

## 7. Design proposal (Axiom, customer-facing)

The document the customer approves. Contains:
- Scope of work
- Images
- Schedule (optional)
- **Pricing** (so design + price are approved together)
- The final drawing (from the bar designer / parts studio / an upload)

The existing Axiom `/proposal/[token]` flow is the base — it already does scope,
images, pricing, and approval. New bits: surface the **final drawing** and an
optional **schedule**, and on approval fire the **approval event to Nexus**.

## 8. What exists today vs. what's new

Already wired:
- Work orders flow Nexus → Axiom (`wallflower_work_orders`), storing `nexus_ref`.
- Price-back: Axiom estimate → build line on the Nexus quote (gated by
  `NEXUS_QUOTE_AUTOPUSH`, now live).
- Status webhook Axiom → Nexus (`relic-status-update`), carrying `relic_work_order_id`.
- Nexus queue: Rental / Build / Mixed badge + filter, derived from `relic_build_id`.

New pieces this model needs:
1. **Design proposal enrichment** — final drawing + optional schedule on the
   Axiom proposal.
2. **Approval → Nexus handoff** — on Axiom proposal approval, push approved +
   amount; Nexus marks approved and adds it to the invoice.
3. **Invoice + payment in Nexus** — Nexus builds the invoice from the approved
   amount (+ rentals) and collects payment; sends a paid/deposit signal back.
4. **Paid → build greenlight** — Axiom starts fabrication on the paid/deposit signal.
5. **Inventory creation hand-off** — Axiom creates the finished-good record; Nexus owns it.

## 9. Fallback: Axiom-only proposal with pricing

For a rare **Axiom-only** job that never touches Nexus, the full Axiom proposal
(with pricing *and* a direct pay path) is kept as a **siloed fallback** — gated
off by default (same pattern as `NEXUS_QUOTE_AUTOPUSH`) so it's a deliberate
choice, never the accidental default. Standard jobs: design+price approval in
Axiom, invoice + payment in Nexus.

## 10. Open / deferred
- Auth: two user pools today; unify vs. federate — decide during the merge build.
- Shared identity layer: one DB vs. two-DBs-linked (Option B sub-choice).
- Exact handoff target for the approval — the Nexus quote → order → invoice path
  (a `venueos-7c` question).
