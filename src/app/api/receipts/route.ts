import { NextRequest, NextResponse } from "next/server";
import { siteTenantId } from "@/lib/axiom-admin";
import { requireReceiptsSession } from "@/lib/receipts-session";

// GET  /api/receipts → { purchase_orders (open), receipts (latest 20) }
// POST /api/receipts { vendor, receipt_date, total, line_items, purchase_order_id, notes, image_url }
// Both need the PIN session (x-receipts-session).

export async function GET(req: NextRequest) {
  const s = await requireReceiptsSession(req);
  if (s instanceof NextResponse) return s;
  const tenantId = await siteTenantId(s.db);
  const [po, rec] = await Promise.all([
    s.db.from("purchase_orders").select("*").eq("tenant_id", tenantId).in("status", ["pending", "approved"]).order("created_at", { ascending: false }),
    s.db.from("receipts").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (po.error || rec.error) return NextResponse.json({ error: "Couldn't load receipts." }, { status: 500 });
  return NextResponse.json({ purchase_orders: po.data, receipts: rec.data });
}

export async function POST(req: NextRequest) {
  const s = await requireReceiptsSession(req);
  if (s instanceof NextResponse) return s;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { data, error } = await s.db
    .from("receipts")
    .insert({
      image_url: b.image_url || null,
      vendor: b.vendor || null,
      receipt_date: b.receipt_date || null,
      total: Number(b.total) || 0,
      line_items: Array.isArray(b.line_items) ? b.line_items : [],
      purchase_order_id: b.purchase_order_id || null,
      notes: b.notes || null,
      submitted_by: s.name, // from the session, not the request
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
