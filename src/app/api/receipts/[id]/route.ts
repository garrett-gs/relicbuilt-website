import { NextRequest, NextResponse } from "next/server";
import { siteTenantId } from "@/lib/axiom-admin";
import { requireReceiptsSession } from "@/lib/receipts-session";

// PATCH  /api/receipts/:id { purchase_order_id } → link a receipt to a PO
// DELETE /api/receipts/:id

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const s = await requireReceiptsSession(req);
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  const { purchase_order_id } = (await req.json().catch(() => ({}))) as { purchase_order_id?: string | null };
  const { error, count } = await s.db
    .from("receipts")
    .update({ purchase_order_id: purchase_order_id || null }, { count: "exact" })
    .eq("id", id)
    .eq("tenant_id", await siteTenantId(s.db));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const s = await requireReceiptsSession(req);
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  const { error } = await s.db.from("receipts").delete().eq("id", id).eq("tenant_id", await siteTenantId(s.db));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
