import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const { invoiceId } = await req.json();
    if (!invoiceId) {
      return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

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

    // Calculate invoice total
    const total =
      invoice.subtotal +
      invoice.delivery_fee -
      invoice.discount +
      (invoice.subtotal * invoice.tax_rate) / 100;

    const baseCents = Math.round(total * 100);
    const feeCents = Math.round(total * 0.029 * 100 + 30);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://relicbuilt.com";
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
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
              name: "Card Processing Fee (2.9% + $0.30)",
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
        fee_cents: feeCents.toString(),
        base_cents: baseCents.toString(),
      },
      payment_intent_data: {
        metadata: {
          invoice_id: invoiceId,
          fee_cents: feeCents.toString(),
          base_cents: baseCents.toString(),
        },
      },
    });

    const feeAmount = feeCents / 100;
    const totalAmount = total + feeAmount;

    return NextResponse.json({
      url: session.url,
      base_amount: total,
      fee_amount: feeAmount,
      total_amount: totalAmount,
    });
  } catch (err) {
    console.error("pay-invoice error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
