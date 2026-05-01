import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface EstimateLineItem { quantity?: number; unit_price?: number }
interface EstimateLaborItem { cost?: number }

function calcTotal(est: { line_items?: EstimateLineItem[]; labor_items?: EstimateLaborItem[]; markup_percent?: number }) {
  const materialTotal = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const laborTotal = (est.labor_items || []).reduce((s, l) => s + (l.cost || 0), 0);
  const subtotal = materialTotal + laborTotal;
  const markup = subtotal * ((est.markup_percent || 0) / 100);
  return Math.round((subtotal + markup) * 100) / 100;
}

/**
 * Garrett presses "Mark Deposit Paid" in the estimator. This is the moment
 * an accepted proposal becomes a real project — the custom_work row is
 * created here, the deposit invoice is linked to it and marked paid, and
 * the estimate is stamped with deposit_paid_at.
 *
 * Until this is called, the projects tab does NOT show the estimate. The
 * goal: the projects tab only contains jobs the client has paid to start.
 */
export async function POST(req: NextRequest) {
  try {
    const { estimate_id } = await req.json();
    if (!estimate_id) {
      return NextResponse.json({ error: "estimate_id required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: estimate, error: estErr } = await supabase
      .from("estimates")
      .select("*")
      .eq("id", estimate_id)
      .single();
    if (estErr || !estimate) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    if (estimate.proposal_status !== "approved") {
      return NextResponse.json({ error: "Proposal hasn't been accepted by the client yet." }, { status: 400 });
    }
    if (estimate.deposit_paid_at && estimate.custom_work_id) {
      // Already done — return existing data so caller stays in sync
      return NextResponse.json({
        success: true,
        already_paid: true,
        custom_work_id: estimate.custom_work_id,
        deposit_paid_at: estimate.deposit_paid_at,
        project_name: estimate.project_name || estimate.estimate_number,
      });
    }

    const totalAmount = calcTotal(estimate);

    // ── Create the project (custom_work) ─────────────────────────────
    let customWorkId = estimate.custom_work_id;
    if (!customWorkId) {
      const { data: newProject, error: projErr } = await supabase
        .from("custom_work")
        .insert({
          project_name: estimate.project_name || "Untitled Project",
          client_name: estimate.client_name || "",
          customer_id: estimate.customer_id || null,
          quoted_amount: totalAmount,
          project_description: estimate.notes || null,
          inspiration_images: estimate.images || [],
          proposal_highlights: estimate.proposal_highlights || [],
          proposal_scope: estimate.proposal_scope || null,
          proposal_images: estimate.images || [],
          proposal_images_included: estimate.proposal_images_included !== false,
          proposal_status: "approved",
          proposal_approved_at: estimate.proposal_approved_at || new Date().toISOString(),
          status: "in_progress",
        })
        .select()
        .single();
      if (projErr || !newProject) {
        console.error("[mark-deposit-paid] project create failed:", projErr);
        return NextResponse.json({ error: `Could not create project: ${projErr?.message || "unknown"}` }, { status: 500 });
      }
      customWorkId = newProject.id;
    }

    // ── Mark the deposit invoice paid + link it to the project ───────
    const { data: depositInvoice } = await supabase
      .from("invoices")
      .select("id, payments, subtotal, status")
      .eq("client_name", estimate.client_name || "")
      .eq("invoice_type", "deposit")
      .like("description", `%${estimate.project_name || estimate.estimate_number}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (depositInvoice) {
      const existingPayments = depositInvoice.payments || [];
      await supabase.from("invoices").update({
        custom_work_id: customWorkId,
        status: "paid",
        payments: [
          ...existingPayments,
          {
            amount: depositInvoice.subtotal,
            method: "Marked Paid",
            date: new Date().toISOString().split("T")[0],
            note: "Deposit confirmed in Axiom",
            created_at: new Date().toISOString(),
          },
        ],
      }).eq("id", depositInvoice.id);
    }

    // Also link the balance invoice to the new project
    const { data: balanceInvoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("client_name", estimate.client_name || "")
      .eq("invoice_type", "final")
      .like("description", `%${estimate.project_name || estimate.estimate_number}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (balanceInvoice) {
      await supabase.from("invoices").update({ custom_work_id: customWorkId }).eq("id", balanceInvoice.id);
    }

    // ── Update the estimate ──────────────────────────────────────────
    const paidAt = new Date().toISOString();
    await supabase.from("estimates").update({
      deposit_paid_at: paidAt,
      custom_work_id: customWorkId,
      updated_at: paidAt,
    }).eq("id", estimate_id);

    return NextResponse.json({
      success: true,
      custom_work_id: customWorkId,
      deposit_paid_at: paidAt,
      project_name: estimate.project_name || estimate.estimate_number,
    });
  } catch (err) {
    console.error("[mark-deposit-paid] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
