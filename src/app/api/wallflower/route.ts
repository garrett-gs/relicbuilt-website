import { NextRequest, NextResponse } from "next/server";
import { notifyWallflowerStatus } from "@/lib/wallflower-status";
import { notifyNewIntake } from "@/lib/notify-new-intake";
import { axiomAdmin, siteTenantId } from "@/lib/axiom-admin";

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
    // identifiers — we store them on the row so our outbound status webhook can
    // address the work order on Wallflower's side, and so a re-push updates the
    // same row instead of duplicating it.
    //
    // item_image_url is the item photo; reference_images is an array of
    // inspiration / reference photos ({ url, name, uploaded_at }). The images
    // live on Wallflower's public storage — we only persist the URLs.
    //
    // nexus_ref links this work order back to the originating Nexus quote/order:
    // { type: "quote" | "order", id, number }.
    //
    // billing_type / pricing_requested set the billing posture. "maintenance"
    // (or pricing_requested === false) means do the work but produce NO
    // customer-facing price — track cost only.
    //
    // mode: "create" | "update" is advisory; we key the upsert off whether a
    // row already exists for this wallflower_order_id in this workspace.
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
      item_image_url,
      reference_images,
      nexus_ref,
      billing_type,
      pricing_requested,
      request_type,
      client_name,
      client_email,
      client_phone,
      client_company,
      event_date,
      venue,
      occasion,
      mode,
    } = body;

    if (!item_name?.trim()) {
      return NextResponse.json({ error: "item_name is required" }, { status: 400 });
    }

    const isMaintenance = billing_type === "maintenance" || pricing_requested === false;
    const billingType: "billable" | "maintenance" = isMaintenance ? "maintenance" : "billable";

    // Intake category. Prefer the explicit request_type from Nexus; otherwise
    // derive: a Nexus quote (or an explicit pricing request) is a price request
    // to be estimated; everything else is work on existing inventory.
    const requestType: "quote_request" | "work_order" =
      request_type === "quote_request" || request_type === "work_order"
        ? request_type
        : nexus_ref?.type === "quote" || pricing_requested === true
          ? "quote_request"
          : "work_order";

    // Nexus sends status:"new"; the board's New column keys off "pending".
    const statusVal = !status || status === "new" ? "pending" : status;

    const supabase = axiomAdmin();

    // Only fields that map to real wallflower_work_orders columns. Extra
    // Nexus-side fields (priority, approved*, requested_by, inventory_*,
    // item_category) are intentionally not persisted — Nexus remains their
    // source of truth and no Axiom surface reads them yet.
    const row = {
      wallflower_order_id: wallflower_order_id || null,
      wallflower_order_number: wallflower_order_number || null,
      item_name: item_name.trim(),
      item_source: item_source || "custom",
      request_type: requestType,
      client_name: client_name || null,
      client_email: client_email || null,
      client_phone: client_phone || null,
      client_company: client_company || null,
      event_date: event_date || null,
      venue: venue || null,
      occasion: occasion || null,
      work_type: work_type || "Repair",
      scope: scope || "External",
      assigned_to: assigned_to || null,
      deadline: deadline || null,
      billing_type: billingType,
      description: description || null,
      quantity: quantity || 1,
      submitted_by: submitted_by || "Wallflower",
      item_image_url: item_image_url || null,
      reference_images: Array.isArray(reference_images) ? reference_images : [],
      nexus_ref:
        nexus_ref && typeof nexus_ref === "object" && nexus_ref.id ? nexus_ref : null,
    };

    // Upsert by wallflower_order_id: a Nexus re-push (mode:"update", or any
    // repeat of an order we've already seen) updates the existing work order
    // rather than creating a duplicate.
    let existing: { id: string } | null = null;
    if (wallflower_order_id) {
      const tenant = await siteTenantId(supabase);
      const { data: found } = await supabase
        .from("wallflower_work_orders")
        .select("id")
        .eq("wallflower_order_id", wallflower_order_id)
        .eq("tenant_id", tenant)
        .limit(1)
        .maybeSingle();
      existing = found ?? null;
    }

    const isUpdate = !!existing || mode === "update";
    let data: { id: string; wallflower_order_number: string | null } | null = null;

    if (existing) {
      const { data: updated, error } = await supabase
        .from("wallflower_work_orders")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id, wallflower_order_number")
        .single();
      if (error) {
        console.error("wallflower update error:", error);
        return NextResponse.json({ error: "Failed to update work order" }, { status: 500 });
      }
      data = updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("wallflower_work_orders")
        .insert({ ...row, status: statusVal })
        .select("id, wallflower_order_number")
        .single();
      if (error) {
        console.error("wallflower insert error:", error);
        return NextResponse.json({ error: "Failed to create work order" }, { status: 500 });
      }
      data = inserted;
    }

    // Acknowledge receipt to Wallflower so their dashboard flips from
    // "✓ Sent to RELIC" to a colored pill. Non-blocking.
    if (wallflower_order_id) {
      await notifyWallflowerStatus(supabase, { workOrderId: data.id }, "received");
    }

    // Alert the owner + add to daily reminders on first intake only — a re-push
    // update shouldn't re-ping. Best-effort; the helper swallows its own errors.
    if (!isUpdate) {
      const isQuote = requestType === "quote_request";
      await notifyNewIntake({
        kind: "work_order",
        title: `${isQuote ? "Quote request" : "Work order"}: ${item_name.trim()}${isMaintenance ? " — MAINTENANCE (no quote)" : ""}`,
        clientName: submitted_by || "Wallflower",
        summary: [
          isQuote
            ? "Custom price request — build an estimate and send the quote."
            : "Work order on existing inventory (repair / paint / alteration).",
          client_name ? `For: ${client_name}${client_company ? ` (${client_company})` : ""}${occasion ? ` — ${occasion}` : ""}${event_date ? `, ${event_date}` : ""}` : "",
          isMaintenance ? "Maintenance / cost-tracking only — do not produce a customer-facing price." : "",
          `Type: ${work_type || "Repair"} · Scope: ${scope || "External"}${quantity && quantity > 1 ? ` · Qty: ${quantity}` : ""}`,
          description || "",
        ].filter(Boolean).join("\n"),
      });
    }

    return NextResponse.json({
      ok: true,
      id: data.id,
      order_number: data.wallflower_order_number ?? data.id,
    });
  } catch (err) {
    console.error("wallflower API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
