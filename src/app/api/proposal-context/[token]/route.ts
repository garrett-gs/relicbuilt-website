import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Public endpoint the /proposal/[token] page calls to fetch everything
 * it needs in one shot, using the service role so no anon RLS policies
 * are required on estimates / customers / companies / settings.
 *
 * Returns:
 *   - estimate: the full row (the page needs all proposal fields)
 *   - settings: business info for the header (logo / phone / address)
 *   - clientCompany: linked-company display name if applicable
 *
 * Only returns data when proposal_token matches an existing estimate —
 * the token IS the access control. Nothing here is exposed publicly
 * unless the merchant explicitly clicked "Send Proposal" (which is
 * what creates the token).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await ctx.params;
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!,
    );

    const { data: estimate, error: estErr } = await supabase
      .from("estimates")
      .select("*")
      .eq("proposal_token", token)
      .single();

    if (estErr || !estimate) {
      return NextResponse.json({ estimate: null, settings: null, clientCompany: null });
    }

    let clientCompany: string | null = null;
    if (estimate.customer_id) {
      const { data: cust } = await supabase
        .from("customers")
        .select("company_id,company_name")
        .eq("id", estimate.customer_id)
        .single();
      if (cust?.company_name) {
        clientCompany = cust.company_name;
      } else if (cust?.company_id) {
        const { data: co } = await supabase
          .from("companies")
          .select("name")
          .eq("id", cust.company_id)
          .single();
        if (co?.name) clientCompany = co.name;
      }
    }

    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_email,biz_phone,biz_address,biz_city,biz_state,biz_zip,deposit_percent,terms_text")
      .limit(1)
      .single();

    return NextResponse.json({ estimate, settings: settings || null, clientCompany });
  } catch (err) {
    console.error("[proposal-context] error:", err);
    return NextResponse.json({ estimate: null, settings: null, clientCompany: null });
  }
}
