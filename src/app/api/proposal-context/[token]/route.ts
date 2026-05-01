import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Public endpoint that the /proposal/[token] page calls to resolve
 * additional context (linked company, etc.) using the service role
 * so we don't have to expose the customers/companies tables to anon
 * RLS reads.
 *
 * Returns minimal display data only — never sensitive PII.
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

    const { data: estimate } = await supabase
      .from("estimates")
      .select("id,customer_id")
      .eq("proposal_token", token)
      .single();

    if (!estimate) return NextResponse.json({ clientCompany: null });

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

    return NextResponse.json({ clientCompany });
  } catch (err) {
    console.error("[proposal-context] error:", err);
    return NextResponse.json({ clientCompany: null });
  }
}
