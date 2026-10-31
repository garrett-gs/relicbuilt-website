import { NextRequest, NextResponse } from "next/server";
import { composeClientAddress } from "@/lib/proposal-html";
import { axiomAdmin } from "@/lib/axiom-admin";

/**
 * Public endpoint the /proposal/master/[token] page calls. Returns the master
 * project, every estimate grouped under it, business settings, and the client's
 * company / address — all via the service role, so no anon RLS is required.
 * The master's proposal_token IS the access control.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await ctx.params;
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const supabase = axiomAdmin();

    const { data: master, error: mErr } = await supabase
      .from("master_projects")
      .select("*")
      .eq("proposal_token", token)
      .single();

    if (mErr || !master) {
      return NextResponse.json({ master: null, builds: null, settings: null });
    }

    // Every estimate grouped under this master, oldest first.
    const { data: estimates } = await supabase
      .from("estimates")
      .select("*")
      .eq("master_project_id", master.id)
      .order("created_at", { ascending: true });
    const builds = estimates || [];

    // Client company / address come from the first build's linked customer
    // (all builds in a master share one client).
    let clientCompany: string | null = null;
    let clientAddress: string | null = null;
    const customerId = builds.find((b) => b.customer_id)?.customer_id || master.customer_id || null;
    if (customerId) {
      const { data: cust } = await supabase
        .from("customers")
        .select("company_id,company_name,address")
        .eq("id", customerId)
        .single();
      clientAddress = composeClientAddress(cust) || null;
      if (cust?.company_name) {
        clientCompany = cust.company_name;
      } else if (cust?.company_id) {
        const { data: co } = await supabase.from("companies").select("name").eq("id", cust.company_id).single();
        if (co?.name) clientCompany = co.name;
      }
    }

    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_email,biz_phone,biz_address,biz_city,biz_state,biz_zip,deposit_percent,terms_text,relic_profile")
      .limit(1)
      .single();

    return NextResponse.json({ master, builds, settings: settings || null, clientCompany, clientAddress });
  } catch (err) {
    console.error("[master-proposal-context] error:", err);
    return NextResponse.json({ master: null, builds: null, settings: null });
  }
}
