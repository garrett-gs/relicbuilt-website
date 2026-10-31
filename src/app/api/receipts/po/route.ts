import { NextRequest, NextResponse } from "next/server";
import { SITE_ENTITY } from "@/lib/axiom-site";
import { siteTenantId } from "@/lib/axiom-admin";
import { syncInventoryUnitCost } from "@/lib/inventory-price-sync";
import { requireReceiptsSession } from "@/lib/receipts-session";
import type { PurchaseOrder } from "@/types/axiom";

// "Add to P.O." for the receipts app (see AddToPOModal's `api` source).
// GET  /api/receipts/po → { vendors, pos } (pending POs for this site's business)
// POST /api/receipts/po { po_id: "new" | id, vendor_id, vendor_name, item: { description, quantity, unit_price } }
//      → { po_number }
// The business comes from the deployment, never from the request.

const entity = () => SITE_ENTITY ?? "wallflower_relic";

export async function GET(req: NextRequest) {
  const s = await requireReceiptsSession(req);
  if (s instanceof NextResponse) return s;
  const tenantId = await siteTenantId(s.db);
  const [v, p] = await Promise.all([
    s.db.from("vendors").select("*").eq("tenant_id", tenantId).eq("status", "active").order("name"),
    s.db.from("purchase_orders").select("*").eq("status", "pending").eq("entity", entity()).order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ vendors: v.data ?? [], pos: p.data ?? [] });
}

export async function POST(req: NextRequest) {
  const s = await requireReceiptsSession(req);
  if (s instanceof NextResponse) return s;
  const b = (await req.json().catch(() => ({}))) as {
    po_id?: string;
    vendor_id?: string | null;
    vendor_name?: string;
    item?: { description?: string; quantity?: number; unit_price?: number };
  };
  const description = String(b.item?.description || "").trim();
  const quantity = Number(b.item?.quantity) || 1;
  const unit_price = Number(b.item?.unit_price) || 0;
  if (!description) return NextResponse.json({ error: "Describe the item." }, { status: 400 });
  const lineItem = { description, quantity, unit_price, unit: "each" };

  if (!b.po_id || b.po_id === "new") {
    const { data, error } = await s.db
      .from("purchase_orders")
      .insert({
        po_number: "PO-TEMP",
        entity: entity(),
        vendor_id: b.vendor_id || null,
        vendor_name: b.vendor_name || "Unknown Vendor",
        item_description: description,
        quantity,
        unit_price,
        line_items: [lineItem],
        status: "pending",
        attachments: [],
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Couldn't create the PO." }, { status: 500 });
    const po_number = `PO-${new Date().getFullYear()}-${String(data.id).slice(0, 4).toUpperCase()}`;
    await s.db.from("purchase_orders").update({ po_number }).eq("id", data.id);
    await syncInventoryUnitCost([lineItem], s.db, await siteTenantId(s.db));
    return NextResponse.json({ po_number });
  }

  const { data: po } = await s.db
    .from("purchase_orders")
    .select("*")
    .eq("id", b.po_id)
    .eq("status", "pending")
    .eq("entity", entity())
    .maybeSingle<PurchaseOrder>();
  if (!po) return NextResponse.json({ error: "That PO isn't open any more." }, { status: 404 });
  const norm = (x: string) => (x || "").trim().toLowerCase().replace(/\s+/g, " ");
  if ((po.line_items || []).some((li) => norm(li.description) === norm(description))) {
    return NextResponse.json({ error: "That item is already on this PO." }, { status: 409 });
  }
  const items = [...(po.line_items || []), lineItem];
  const { error } = await s.db
    .from("purchase_orders")
    .update({
      line_items: items,
      item_description: items.map((li) => li.description).join(", "),
      unit_price: items.reduce((sum, li) => sum + li.quantity * li.unit_price, 0),
    })
    .eq("id", po.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await syncInventoryUnitCost([lineItem], s.db, await siteTenantId(s.db));
  return NextResponse.json({ po_number: po.po_number });
}
