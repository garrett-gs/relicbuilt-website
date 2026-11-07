import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { axiomAdmin } from "@/lib/axiom-admin";
import { amountDueNow } from "@/lib/invoice-balance";

// Stripe's merchant fees, mirrored on the customer side:
//   Card: 2.9% + $0.30 (uncapped)
//   ACH (us_bank_account): 0.8%, capped at $5.00
// We charge the customer the actual processing fee so the merchant
// stays whole on the base amount. The client picks the method on our
// pay page first; we restrict payment_method_types on the Stripe
// session to just that one so they can't switch mid-checkout and
// underpay the fee.
const ACH_FEE_RATE = 0.008;
const ACH_FEE_CAP_CENTS = 500; // $5.00
const CARD_FEE_RATE = 0.029;
const CARD_FEE_FLAT_CENTS = 30;

function computeFeeCents(baseCents: number, method: "card" | "ach"): number {
  if (method === "ach") {
    return Math.min(Math.round(baseCents * ACH_FEE_RATE), ACH_FEE_CAP_CENTS);
  }
  return Math.round(baseCents * CARD_FEE_RATE) + CARD_FEE_FLAT_CENTS;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invoiceId } = body;
    const method: "card" | "ach" = body?.method === "ach" ? "ach" : "card";
    if (!invoiceId) {
      return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
    }

    const supabase = axiomAdmin();

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (error || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status === "paid") {
      return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 });
    }

    // Charge the amount due NOW: the still-unpaid deposit portion while the
    // deposit isn't covered, otherwise the remaining balance. The invoice
    // total is always the full project amount; the deposit is a partial
    // payment against it and the balance stays on the same invoice.
    const total = amountDueNow(invoice);
    if (total <= 0) {
      return NextResponse.json({ error: "Nothing is currently due on this invoice." }, { status: 400 });
    }

    const baseCents = Math.round(total * 100);
    const feeCents = computeFeeCents(baseCents, method);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://relicbuilt.com";
    // Route payment to the account that owns this invoice's entity. If a Relic
    // invoice has no Relic Stripe key yet, refuse rather than bill Wallflower.
    let stripe;
    try {
      stripe = getStripe(invoice.entity);
    } catch {
      return NextResponse.json(
        { error: "Online payment isn't set up for this business yet." },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Restrict to the method the client picked on our page so the fee
      // we just stamped into the line items matches what actually gets
      // processed. ACH uses Stripe's instant bank verification (Plaid)
      // plus a microdeposit fallback — funds settle in ~3-5 business days.
      payment_method_types: method === "ach" ? ["us_bank_account"] : ["card"],
      payment_method_options: method === "ach" ? {
        us_bank_account: {
          verification_method: "instant",
        },
      } : undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: invoice.description || "Invoice Payment",
            },
            unit_amount: baseCents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: method === "ach"
                ? "Processing Fee (0.8%, max $5 — ACH)"
                : "Processing Fee (2.9% + $0.30 — Card)",
            },
            unit_amount: feeCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/pay/${invoiceId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/pay/${invoiceId}`,
      ...(invoice.client_email ? { customer_email: invoice.client_email } : {}),
      metadata: {
        invoice_id: invoiceId,
        method,
        fee_cents: feeCents.toString(),
        base_cents: baseCents.toString(),
      },
      payment_intent_data: {
        metadata: {
          invoice_id: invoiceId,
          method,
          fee_cents: feeCents.toString(),
          base_cents: baseCents.toString(),
        },
      },
    });

    const feeAmount = feeCents / 100;
    const totalAmount = total + feeAmount;

    return NextResponse.json({
      url: session.url,
      method,
      base_amount: total,
      fee_amount: feeAmount,
      total_amount: totalAmount,
    });
  } catch (err) {
    console.error("pay-invoice error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
