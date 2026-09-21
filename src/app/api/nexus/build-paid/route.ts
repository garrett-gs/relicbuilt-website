import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWRClient } from "@/lib/wr-supabase";
import { notifyNexusBuildLink } from "@/lib/notify-nexus-build-link";

// Receives a payment signal from Nexus when a custom build's invoice takes a
// payment (deposit / balance / paid-in-full). Records it against the linked
// Axiom work order and flags fabrication as greenlit on deposit or full
// payment. Auth: same shared key as the work-order intake (Bearer).
const API_KEY = process.env.WALLFLOWER_API_KEY || "wfrelic2026";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get("authorization")?.replace("Bearer ", "");
    if (key !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const b = await req.json();
    const {
      relic_build_id,
      relic_estimate_id, // optional — if Nexus includes it we skip the lookup
      invoice_number,
      amount,
      paid_to_date,
      build_total,
      milestone, // 'deposit' | 'balance' | 'paid_in_full'
      method,
      paid_at,
    } = b;

    if (!relic_build_id && !relic_estimate_id) {
      return NextResponse.json(
        { error: "relic_build_id or relic_estimate_id required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    // Map the payment to an Axiom estimate. Prefer relic_estimate_id if sent;
    // otherwise resolve it from Nexus's relic_builds row.
    let estimateId: string | null = relic_estimate_id || null;
    if (!estimateId && relic_build_id) {
      try {
        const wr = getWRClient();
        const { data: rb } = await wr
          .from("relic_builds")
          .select("relic_estimate_id")
          .eq("id", relic_build_id)
          .maybeSingle();
        estimateId = rb?.relic_estimate_id || null;
      } catch (e) {
        console.error("[build-paid] relic_builds lookup failed:", e);
      }
    }

    // Find the linked work order (to record the greenlight where the shop sees it).
    let workOrder: { id: string; notes: string | null } | null = null;
    if (estimateId) {
      const { data: wo } = await supabase
        .from("wallflower_work_orders")
        .select("id, notes")
        .eq("estimate_id", estimateId)
        .maybeSingle();
      workOrder = wo;
    }

    const greenlight = milestone === "deposit" || milestone === "paid_in_full";
    const stamp = new Date().toISOString();

    if (workOrder) {
      const note = `Payment via Nexus — ${milestone || "payment"}${method ? ` (${method})` : ""}, ${
        invoice_number || "invoice"
      }${greenlight ? " → fabrication greenlit" : ""}.`;
      await supabase
        .from("wallflower_work_orders")
        .update({
          notes: [workOrder.notes || "", note].filter(Boolean).join("\n"),
          updated_at: stamp,
        })
        .eq("id", workOrder.id);
    }

    // Payment IS approval: on deposit/paid-in-full, mark the design approved
    // and spin up the project if the client paid without approving each design
    // first. Idempotent — a no-op if it's already approved/linked.
    if (greenlight && estimateId) {
      try {
        const { data: est } = await supabase.from("estimates").select("*").eq("id", estimateId).single();
        const mat = (est?.line_items || []).reduce((s: number, li: { quantity?: number; unit_price?: number }) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
        const lab = (est?.labor_items || []).reduce((s: number, l: { cost?: number }) => s + (l.cost || 0), 0);
        const total = Math.round((mat + lab) * (1 + (est?.markup_percent || 0) / 100) * 100) / 100;
        if (est && est.proposal_status !== "approved") {
          await supabase.from("estimates").update({
            proposal_status: "approved",
            proposal_approved_at: paid_at || stamp,
            status: "accepted",
            notes: [est.notes || "", `Approved via payment (${invoice_number || "invoice"}) on ${new Date(paid_at || stamp).toLocaleDateString("en-US")}`].filter(Boolean).join("\n"),
            updated_at: stamp,
          }).eq("id", estimateId);
          // Fire estimate.approved back to Nexus so the quote item's relic_status
          // flips to 'approved' (single source of truth = Axiom).
          await notifyNexusBuildLink({
            estimateId,
            estimateNumber: est.estimate_number,
            proposalToken: est.proposal_token,
            relicBuildId: relic_build_id || undefined,
            estimateAmount: total,
            status: "approved",
            approvedAt: paid_at || stamp,
            approvedBy: "Payment",
            event: "approved",
          });
        }
        if (est && !est.custom_work_id) {
          const { data: proj } = await supabase.from("custom_work").insert({
            entity: est.entity || "wallflower_relic",
            project_name: est.project_name || est.estimate_number,
            client_name: est.client_name || "",
            client_email: est.client_email || null,
            client_phone: est.client_phone || null,
            customer_id: est.customer_id || null,
            quoted_amount: total,
            project_description: est.notes || null,
            inspiration_images: est.images || [],
            proposal_highlights: est.proposal_highlights || [],
            proposal_scope: est.proposal_scope || null,
            proposal_status: "approved",
            proposal_approved_at: paid_at || stamp,
            start_date: est.start_date || null,
            due_date: est.due_date || null,
            status: "in_progress",
          }).select("id").single();
          if (proj?.id) await supabase.from("estimates").update({ custom_work_id: proj.id }).eq("id", estimateId);
        }
      } catch (e) {
        console.error("[build-paid] approve-on-payment failed:", e);
      }
    }

    await supabase.from("activity_log").insert({
      action: "paid",
      entity: "work_order",
      entity_id: workOrder?.id ?? null,
      label: `Nexus payment (${milestone || "payment"}) on ${invoice_number || "invoice"}${
        greenlight ? " — fabrication greenlit" : ""
      }`,
      meta: {
        source: "nexus",
        relic_build_id: relic_build_id ?? null,
        estimate_id: estimateId,
        invoice_number: invoice_number ?? null,
        amount: amount ?? null,
        paid_to_date: paid_to_date ?? null,
        build_total: build_total ?? null,
        milestone: milestone ?? null,
        method: method ?? null,
        paid_at: paid_at ?? stamp,
      },
    });

    return NextResponse.json({
      ok: true,
      matched_estimate: estimateId,
      work_order_id: workOrder?.id ?? null,
      greenlit: greenlight,
    });
  } catch (err) {
    console.error("[build-paid] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
