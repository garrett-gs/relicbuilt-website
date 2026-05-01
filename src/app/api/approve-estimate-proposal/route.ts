import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

interface EstimateLineItem { quantity?: number; unit_price?: number }
interface EstimateLaborItem { cost?: number }

function calcTotals(est: { line_items?: EstimateLineItem[]; labor_items?: EstimateLaborItem[]; markup_percent?: number }) {
  const materialTotal = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const laborTotal = (est.labor_items || []).reduce((s, l) => s + (l.cost || 0), 0);
  const subtotal = materialTotal + laborTotal;
  const markup = subtotal * ((est.markup_percent || 0) / 100);
  const total = Math.round((subtotal + markup) * 100) / 100;
  return { materialTotal, laborTotal, subtotal, markup, total };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, signatureName } = body;
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    if (!signatureName || typeof signatureName !== "string" || signatureName.trim().length < 2) {
      return NextResponse.json({ error: "Please enter your name to sign." }, { status: 400 });
    }

    // Service role bypasses RLS — needed because the client is unauthenticated
    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    // Look up estimate by proposal_token
    const { data: estimate, error: estErr } = await supabase
      .from("estimates")
      .select("*")
      .eq("proposal_token", token)
      .single();
    if (estErr || !estimate) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    // Already approved? — idempotent return
    if (estimate.proposal_status === "approved") {
      return NextResponse.json({
        already_approved: true,
        project_name: estimate.project_name,
        custom_work_id: estimate.custom_work_id,
      });
    }

    // Compute totals from the live estimate data
    const totals = calcTotals(estimate);
    const totalAmount = totals.total;

    // Load settings for default deposit % + biz info
    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_phone,deposit_percent")
      .limit(1)
      .single();

    const depositPct = estimate.deposit_percent ?? settings?.deposit_percent ?? 50;
    const depositAmount = Math.round(totalAmount * depositPct) / 100;
    const balanceAmount = Math.round((totalAmount - depositAmount) * 100) / 100;

    // ── Create the project (custom_work) ─────────────────────────────
    // This is what makes the estimate "real" — at this point it shows up
    // in the projects tab. Estimates that aren't accepted never become
    // projects.
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
          // Carry the proposal content onto the project so it stays visible
          proposal_highlights: estimate.proposal_highlights || [],
          proposal_scope: estimate.proposal_scope || null,
          proposal_images: estimate.images || [],
          proposal_images_included: estimate.proposal_images_included !== false,
          proposal_status: "approved",
          proposal_approved_at: new Date().toISOString(),
          status: "new",
        })
        .select()
        .single();
      if (projErr || !newProject) {
        console.error("[approve-estimate-proposal] project create failed:", projErr);
        return NextResponse.json({ error: `Could not create project: ${projErr?.message || "unknown"}` }, { status: 500 });
      }
      customWorkId = newProject.id;
    }

    // ── Create deposit and final invoices ────────────────────────────
    const y = new Date().getFullYear();
    const today = new Date().toISOString().split("T")[0];
    const depositInvoiceNum = `INV-${y}-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalInvoiceNum = `INV-${y}-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: depositInvoice, error: depErr } = await supabase
      .from("invoices")
      .insert({
        invoice_number: depositInvoiceNum,
        custom_work_id: customWorkId,
        client_name: estimate.client_name || "",
        description: `Deposit — ${estimate.project_name || estimate.estimate_number}`,
        subtotal: depositAmount > 0 ? depositAmount : totalAmount,
        issued_date: today,
        tax_rate: 0,
        status: "unpaid",
        invoice_type: "deposit",
      })
      .select()
      .single();
    if (depErr) {
      console.error("[approve-estimate-proposal] deposit invoice failed:", depErr);
      return NextResponse.json({ error: `Could not create deposit invoice: ${depErr.message}` }, { status: 500 });
    }

    if (balanceAmount > 0) {
      await supabase.from("invoices").insert({
        invoice_number: finalInvoiceNum,
        custom_work_id: customWorkId,
        client_name: estimate.client_name || "",
        description: `Balance — ${estimate.project_name || estimate.estimate_number}`,
        subtotal: balanceAmount,
        issued_date: today,
        tax_rate: 0,
        status: "unpaid",
        invoice_type: "final",
      });
    }

    // ── Mark estimate approved + link to the new project ──────────────
    await supabase
      .from("estimates")
      .update({
        proposal_status: "approved",
        proposal_approved_at: new Date().toISOString(),
        status: "accepted",
        custom_work_id: customWorkId,
        notes: [
          estimate.notes || "",
          `Signed by ${signatureName.trim()} on ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}`,
        ].filter(Boolean).join("\n"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", estimate.id);

    return NextResponse.json({
      success: true,
      project_name: estimate.project_name || estimate.estimate_number,
      custom_work_id: customWorkId,
      deposit_invoice_number: depositInvoice.invoice_number,
      deposit_amount: depositAmount,
      balance_amount: balanceAmount,
      total_amount: totalAmount,
      deposit_percent: depositPct,
      biz_name: settings?.biz_name || "RELIC",
    });
  } catch (err) {
    console.error("[approve-estimate-proposal] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
