import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyWallflowerStatus } from "@/lib/wallflower-status";

const API_KEY = process.env.WALLFLOWER_API_KEY || "wfrelic2026";

export async function POST(req: NextRequest) {
  try {
    // Verify API key
    const authHeader = req.headers.get("authorization");
    const key = authHeader?.replace("Bearer ", "");
    if (key !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    // wallflower_order_id / wallflower_order_number are the Wallflower-side
    // identifiers — we store them on the row so our outbound status webhook
    // can address the work order on Wallflower's side. The other fields not
    // listed here (item_image_url, inventory_id, etc.) come through the
    // payload but aren't part of this status flow, so we ignore them.
    const {
      wallflower_order_id,
      wallflower_order_number,
      item_name,
      item_source,
      work_type,
      scope,
      assigned_to,
      deadline,
      status,
      description,
      quantity,
      submitted_by,
    } = body;

    if (!item_name?.trim()) {
      return NextResponse.json({ error: "item_name is required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from("wallflower_work_orders")
      .insert({
        wallflower_order_id: wallflower_order_id || null,
        wallflower_order_number: wallflower_order_number || null,
        item_name: item_name.trim(),
        item_source: item_source || "custom",
        work_type: work_type || "Repair",
        scope: scope || "External",
        assigned_to: assigned_to || null,
        deadline: deadline || null,
        status: status || "pending",
        description: description || null,
        quantity: quantity || 1,
        submitted_by: submitted_by || "Wallflower",
      })
      .select()
      .single();

    if (error) {
      console.error("wallflower submit error:", error);
      return NextResponse.json({ error: "Failed to create work order" }, { status: 500 });
    }

    // Acknowledge receipt to Wallflower with a "received" status so their
    // dashboard flips from "✓ Sent to RELIC" to a colored pill. Non-blocking.
    if (wallflower_order_id) {
      await notifyWallflowerStatus(supabase, { workOrderId: data.id }, "received");
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("wallflower API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
