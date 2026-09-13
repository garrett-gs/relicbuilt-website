// Public read endpoint for the /pay/[invoiceId] page. The invoices table
// only allows reads to authenticated users (see axiom-migration.sql), so
// the client-side anon SDK on the public Pay page can't pull the invoice
// directly — it gets back nothing and shows "Invoice not found." This
// route reads with the service key and returns only the fields the Pay
// page needs to render and authorize the Stripe redirect, so we don't
// leak payment history or anything sensitive.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveEntityProfile } from "@/lib/entity-profile";

export async function GET(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { invoiceId } = await params;
    if (!invoiceId) {
      return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from("invoices")
      .select("id,invoice_number,client_name,client_email,description,subtotal,delivery_fee,discount,tax_rate,status,entity")
      .eq("id", invoiceId)
      .maybeSingle();

    if (error) {
      console.error("[public-invoice] read failed:", error);
      return NextResponse.json({ error: "Could not load invoice" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Resolve the entity's public branding so the Pay page can wear the right
    // identity (Wallflower RELIC vs Relic).
    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_phone,relic_profile")
      .limit(1)
      .single();
    const p = resolveEntityProfile(data.entity, settings);
    const brand = {
      name: p.name,
      logoUrl: p.logoUrl,
      footer: p.footer,
      phone: p.phone || "",
      website: p.website || "",
    };

    return NextResponse.json({ invoice: data, brand });
  } catch (err) {
    console.error("[public-invoice] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
