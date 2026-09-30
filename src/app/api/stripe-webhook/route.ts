import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

/**
 * Server-side Stripe webhook — the backstop that confirms a payment even if
 * the payer never lands back on the /pay/<id>/success page (closed the tab,
 * flaky redirect, etc.). On `checkout.session.completed` it hands off to the
 * existing, idempotent /api/confirm-payment, which marks the invoice paid,
 * emails the client receipt, and alerts the team — a no-op if the success
 * page already did it.
 *
 * Payments run through TWO Stripe accounts (Wallflower + Relic), each with its
 * own signing secret. We verify against whichever secret matches:
 *   - STRIPE_WEBHOOK_SECRET        (Wallflower RELIC)
 *   - STRIPE_WEBHOOK_SECRET_RELIC  (Relic)
 * Point BOTH Stripe dashboards' webhooks at this same URL.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // Raw body is required for signature verification — do not JSON.parse first.
  const raw = await req.text();

  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_RELIC,
  ].filter(Boolean) as string[];
  if (secrets.length === 0) {
    console.error("[stripe-webhook] no signing secret configured (STRIPE_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRET_RELIC)");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Any Stripe instance can verify a signature; the key isn't used for it.
  const stripe = getStripe();
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(raw, sig, secret);
      break;
    } catch {
      /* try the next account's secret */
    }
  }
  if (!event) {
    console.error("[stripe-webhook] signature verification failed against all configured secrets");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoice_id;
    if (invoiceId && session.id) {
      // Reuse the exact, idempotent confirmation path the success page uses.
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("host") || "relicbuilt.com";
      const base = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;
      try {
        const res = await fetch(`${base}/api/confirm-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, invoiceId }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error("[stripe-webhook] confirm-payment failed:", res.status, t.slice(0, 200));
        }
      } catch (e) {
        console.error("[stripe-webhook] confirm-payment call error:", e);
      }
    } else {
      console.warn("[stripe-webhook] checkout.session.completed missing invoice_id metadata:", session.id);
    }
  }

  // Always ack so Stripe doesn't retry on events we don't act on.
  return NextResponse.json({ received: true });
}
