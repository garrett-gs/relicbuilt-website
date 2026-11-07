import { NextRequest, NextResponse } from "next/server";
import type { Estimate } from "@/types/axiom";
import { axiomAdmin } from "@/lib/axiom-admin";

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

    const supabase = axiomAdmin();

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
    const depPct = Number(relic.find((e) => e.deposit_percent != null)?.deposit_percent ?? settings?.deposit_percent ?? 100);
    const isFull = depPct >= 100;
    const builds = relic.map((e) => ({ e, total: calcTotal(e) }));
    const acceptedTotal = Math.round(builds.reduce((s, b) => s + b.total, 0) * 100) / 100;
    // Amount due up front (combined deposit); the invoice itself is the full
    // combined total and the balance stays on it.
    const depositAmount = Math.round(acceptedTotal * (depPct / 100) * 100) / 100;
    const balanceAmount = Math.round((acceptedTotal - depositAmount) * 100) / 100;
    const projectIds = relic.map((e) => e.custom_work_id!) as string[];
    const anchorProject = projectIds[0];
    const anchorEstimateId = relic[0].id;
    // One line per build at its FULL total; the deposit/balance split is carried
    // by deposit_amount, not by shrinking the line items.
    const lineItems = builds.map((b) => ({
      item_number: "",
      description: `${b.e.project_name || b.e.estimate_number} — project total (${money(b.total)})`,
      quantity: 1,
      unit_price: b.total,
      unit: "ea",
    }));
    const notes = isFull
      ? `Combined total across ${builds.length} ${builds.length === 1 ? "build" : "builds"} under ${master.name}. Payment due in full.`
      : `Combined — ${builds.length} ${builds.length === 1 ? "build" : "builds"} under ${master.name}. ${depPct}% deposit (${money(depositAmount)}) due now; balance ${money(balanceAmount)} due on completion.`;

    // Reuse an existing unpaid invoice under this master's accepted projects.
    const { data: existing } = await supabase
      .from("invoices")
      .select("id, status")
      .in("custom_work_id", projectIds)
      .in("invoice_type", ["standard", "deposit", "full"])
      .neq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from("invoices").update({
        subtotal: acceptedTotal,
        ...(isFull ? {} : { deposit_amount: depositAmount }),
        line_items: lineItems,
        description: master.name,
        notes,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      return NextResponse.json({ pay_url: `/pay/${existing.id}`, deposit: depositAmount });
    }

    const invNum = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: inv, error } = await supabase.from("invoices").insert({
      entity: "relic",
      invoice_number: invNum,
      invoice_type: "standard",
      custom_work_id: anchorProject,
      estimate_id: anchorEstimateId,
      client_name: relic.find((e) => e.client_name)?.client_name || "",
      client_email: relic.find((e) => e.client_email)?.client_email || null,
      client_phone: relic.find((e) => e.client_phone)?.client_phone || null,
      description: master.name,
      subtotal: acceptedTotal,
      ...(isFull ? {} : { deposit_amount: depositAmount }),
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
