import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWRClient } from "@/lib/wr-supabase";

/**
 * Search Wallflower RELIC Nexus orders/quotes so an Axiom work order can
 * reference one. Server-side because Nexus is reached with the service-role
 * key. Auth-gated: the caller must pass their Axiom session token.
 *
 * GET /api/axiom/nexus-search?type=order|quote&q=<text>
 */
export async function GET(req: NextRequest) {
  try {
    const axiomUrl = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!;

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const authClient = createClient(axiomUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const q = (searchParams.get("q") || "").trim();
    if (type !== "order" && type !== "quote") {
      return NextResponse.json({ error: "type must be 'order' or 'quote'" }, { status: 400 });
    }

    const table = type === "order" ? "orders" : "quotes";
    const numCol = type === "order" ? "order_number" : "quote_number";

    const wr = getWRClient();
    let query = wr
      .from(table)
      .select(`id, ${numCol}, client_name, event_type, event_date, total`)
      .order("created_at", { ascending: false })
      .limit(12);
    if (q) {
      const safe = q.replace(/[%,]/g, "");
      query = query.or(`${numCol}.ilike.%${safe}%,client_name.ilike.%${safe}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("nexus-search error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as Record<string, unknown>[];
    const results = rows.map((r) => ({
      id: String(r.id),
      number: String(r[numCol] ?? ""),
      client_name: (r.client_name as string) ?? "",
      event_type: (r.event_type as string) ?? "",
      event_date: (r.event_date as string) ?? "",
      total: (r.total as number) ?? 0,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("nexus-search exception:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
