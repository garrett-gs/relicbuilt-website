# Nexus ↔ Axiom — Custom-Build Portal & Sign-off Contract

The "scheme" for the custom-build sign-off round-trip. Axiom is the WR side.

## 1. Build-portal URL (what Nexus documents/links)

```
https://axiom.wallflower-relic.com/build/<estimate_id>?token=<proposal_token>
```

- `<estimate_id>` — Axiom `estimates.id`. Returned to Nexus at intake as `estimate_id`.
- `<proposal_token>` — the access secret (`prop_<uuid>`). Generated the moment the
  estimate is created, so the URL is stable from creation.
- Opening it lands the client on the live proposal/sign-off portal (quote + how it
  goes together + terms + signature). Before the proposal is finished/sent it shows
  a "being prepared" screen; once sent it's signable.

## 2. Axiom → Nexus webhook: the build link

Axiom POSTs the build URL to a Nexus endpoint **on estimate create** and again
**on approval (sign-off)**.

- **Target:** `https://mgwvpkezvuswvbkzwysx.supabase.co/functions/v1/relic-build-link`
  (default `{WR_SUPABASE_URL}/functions/v1/relic-build-link`; override with
  `NEXUS_BUILD_WEBHOOK_URL`). `axiom-webhook` at the same host is an accepted alias.
- **Auth:** `Authorization: Bearer <WR_SUPABASE_SERVICE_KEY or Nexus anon JWT>`
  (Supabase gateway) + `x-axiom-api-key: <RELIC_INBOUND_API_KEY>` (the shared secret
  the function verifies; Axiom falls back to `WALLFLOWER_API_KEY`). **Both sides must
  use the same `x-axiom-api-key` value.**
- **Method:** `POST`, `content-type: application/json`.
- **Body:**

```json
{
  "event": "estimate.created" | "estimate.updated" | "estimate.approved",
  "relic_build_id": "<uuid matching quotes.items[].relic_build_id, or null at create>",
  "build_url": "https://axiom.wallflower-relic.com/build/<estimate_id>?token=<token>",
  "estimate_id": "<uuid>",
  "estimate_number": "EST-2026-0123",
  "estimate_amount": 4500,
  "status": "draft" | "sent" | "approved" | "rejected",
  "approved_at": "<iso, present on estimate.approved>",
  "approved_by": "Client name",
  "wallflower_order_id": "<nexus WO id, on create>",
  "nexus_ref": { "type": "quote" | "order", "id": "...", "number": "..." }
}
```

- `estimate.created` fires from intake (`POST /api/wallflower`) after the estimate is
  spawned (`estimate_amount: 0`, `status: "draft"`, `relic_build_id` usually null →
  Nexus falls back to `build_url`). Carries `wallflower_order_id` + `nexus_ref`.
- `estimate.approved` fires on sign-off with `estimate_amount`, `approved_at`,
  `approved_by`, and `relic_build_id` (resolved from `relic_builds.relic_estimate_id`).
- Nexus stamps `approved_at` + `relic_status: "approved"` on the matching line item on
  `estimate.approved`, which releases both quote-sign and convert-to-order gates.
- Endpoint returns `{ "success": true, "updated": { "quotes": N, "orders": N } }`.

## 3. Sign-off approval callback (already live)

On sign-off, Axiom also calls the existing approval edge function
`{WR_SUPABASE_URL}/functions/v1/relic-approval-update` (auth: `Authorization: Bearer
<WR service key>` + `x-relic-api-key: <RELIC_TO_WALLFLOWER_API_KEY>`), body:

```json
{
  "nexus_ref": { "type": "quote"|"order", "id": "..." },
  "relic_build_id": "<relic_builds.id in WR DB>",
  "relic_estimate_id": "<axiom estimates.id>",
  "approved": true,
  "approved_amount": 0,
  "approved_at": "<ISO>",
  "approved_by": "<signer name>",
  "axiom_approval_id": "<uuid>",
  "estimate_number": "EST-2026-0123"
}
```

**This is the signal that gates Nexus's second approval.** The custom-build sign-off
in the Axiom portal = approval #1; Nexus, on receiving `approved: true`, unlocks the
quote acceptance = approval #2. For Wallflower/Nexus builds Axiom creates **no
invoice** — payment stays in Nexus, which reports it back via `POST /api/nexus/build-paid`.

## 4. Sign-off record captured (for audit)

`proposal_audit_events` row on sign: `signer_name`, `signer_email`, `ip_address`,
`user_agent`, `document_hash` (SHA-256 of the rendered proposal), a saved PDF
snapshot, and `event_type: "signed"`.

## 5. Env

Axiom (Vercel) already has `WR_SUPABASE_URL`, `WR_SUPABASE_SERVICE_KEY`, and
`RELIC_TO_WALLFLOWER_API_KEY` (used by the existing callbacks), so the build-link
webhook needs **no new secrets** — it goes live the moment Nexus stands up the
`relic-build-link` edge function. Optional overrides: `NEXUS_BUILD_WEBHOOK_URL`
(full endpoint if not the default edge fn), `AXIOM_PUBLIC_URL` (portal base;
defaults to `https://axiom.wallflower-relic.com`). Until the WR creds resolve an
endpoint, the webhook is a safe no-op.

## 6. Nexus side (their items 1–4)

- Receive the build-link webhook (§2), store `build_url` per line.
- Render a **"View Design"** button per line linking to `build_url`
  (in the `quotes.wallflower-relic.com` app).
- Gate quote acceptance (approval #2) on the sign-off approval (§3).
