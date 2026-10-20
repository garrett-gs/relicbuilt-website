import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Estimate } from "@/types/axiom";

export const runtime = "nodejs";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}
interface LineItem { quantity?: number; unit_price?: number }
interface LaborItem { cost?: number }
function calcTotal(est: { line_items?: LineItem[]; labor_items?: LaborItem[]; markup_percent?: number; adjustment?: number }) {
  const mat = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const lab = (est.labor_items || []).reduce((s, li) => s + (li.cost || 0), 0);
  const subtotal = mat + lab;
  const markup = subtotal * ((est.markup_percent || 0) / 100);
  return Math.round((subtotal + markup + (est.adjustment || 0)) * 100) / 100;
}

/**
 * Takes the client from the combined proposal to a single deposit invoice
 * covering the builds they've ACCEPTED so far (RELIC builds only — Wallflower
 * is paid in Nexus). Reuses an existing unpaid deposit if there is one,
 * re-sizing it to the current accepted set, so re-clicking Pay never stacks
 * duplicate invoices.
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: master } = await supabase.from("master_projects").select("*").eq("proposal_token", token).single();
    if (!master) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    const { data: estimatesRaw } = await supabase
      .from("estimates")
      .select("*")
      .eq("master_project_id", master.id)
      .eq("proposal_status", "approved");
    const accepted = (estimatesRaw || []) as Estimate[];
    const relic = accepted.filter((e) => e.entity === "relic" && e.custom_work_id);
    if (relic.length === 0) {
      // Nothing to collect here (all Wallflower, or nothing accepted yet).
      return NextResponse.json({ pay_url: null, message: "No deposit is collected here." });
    }

    const { data: settings } = await supabase.from("settings").select("deposit_percent").limit(1).single();
    const depPct = Number(relic.find((e) => e.deposit_percent != null)?.deposit_percent ?? settings?.deposit_percent ?? 50);
    const builds = relic.map((e) => ({ e, total: calcTotal(e) }));
    const acceptedTotal = builds.reduce((s, b) => s + b.total, 0);
    const depositAmount = Math.round(acceptedTotal * (depPct / 100) * 100) / 100;
    const projectIds = relic.map((e) => e.custom_work_id!) as string[];
    const anchorProject = projectIds[0];
    const anchorEstimateId = relic[0].id;
    const lineItems = builds.map((b) => ({
      item_number: "",
      description: `Deposit — ${depPct}% of ${b.e.project_name || b.e.estimate_number} (${money(b.total)})`,
      quantity: 1,
      unit_price: Math.round(b.total * (depPct / 100) * 100) / 100,
      unit: "ea",
    }));
    const notes = `Combined deposit — ${depPct}% across ${builds.length} ${builds.length === 1 ? "build" : "builds"} under ${master.name}. Balance ${100 - depPct}% due on completion.`;

    // Reuse an existing unpaid deposit under this master's accepted projects.
    const { data: existing } = await supabase
      .from("invoices")
      .select("id, status")
      .in("custom_work_id", projectIds)
      .eq("invoice_type", "deposit")
      .neq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from("invoices").update({
        subtotal: depositAmount,
        line_items: lineItems,
        description: `Deposit (${depPct}%) — ${master.name}`,
        notes,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      return NextResponse.json({ pay_url: `/pay/${existing.id}`, deposit: depositAmount });
    }

    const invNum = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: inv, error } = await supabase.from("invoices").insert({
      entity: "relic",
      invoice_number: invNum,
      invoice_type: "deposit",
      custom_work_id: anchorProject,
      estimate_id: anchorEstimateId,
      client_name: relic.find((e) => e.client_name)?.client_name || "",
      client_email: relic.find((e) => e.client_email)?.client_email || null,
      client_phone: relic.find((e) => e.client_phone)?.client_phone || null,
      description: `Deposit (${depPct}%) — ${master.name}`,
      subtotal: depositAmount,
      delivery_fee: 0,
      discount: 0,
      tax_rate: 0,
      line_items: lineItems,
      status: "unpaid",
      issued_date: new Date().toISOString().split("T")[0],
      notes,
      payments: [],
    }).select("id").single();
    if (error || !inv?.id) {
      return NextResponse.json({ error: "Could not create the deposit invoice." }, { status: 500 });
    }
    return NextResponse.json({ pay_url: `/pay/${inv.id}`, deposit: depositAmount });
  } catch (err) {
    console.error("[master-proposal/deposit] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
