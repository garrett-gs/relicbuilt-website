import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    const { messages, estimate } = await req.json();

    // ── Pull live context from Axiom ──────────────────────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const [
      { data: settings },
      { data: catalog },
      { data: recentProjects },
      { data: recentReceipts },
    ] = await Promise.all([
      supabase.from("settings").select("biz_name, team_members, deposit_percent").limit(1).single(),
      supabase.from("inventory_items").select("*, vendors(name)").eq("active", true).order("description").limit(200),
      supabase.from("custom_work").select("project_name, quoted_amount, materials, labor_log, status").in("status", ["completed", "delivered"]).order("created_at", { ascending: false }).limit(15),
      supabase.from("receipts").select("vendor, total, line_items, receipt_date").order("receipt_date", { ascending: false }).limit(30),
    ]);

    // ── Build context strings ─────────────────────────────────

    const bizName = settings?.biz_name || "RELIC";

    const teamRates = (settings?.team_members || [])
      .filter((m: { hourly_rate?: number; name: string; role: string }) => m.hourly_rate)
      .map((m: { name: string; role: string; hourly_rate: number }) => `  - ${m.name} (${m.role}): $${m.hourly_rate}/hr`)
      .join("\n") || "  - No rates configured yet";

    const catalogLines = (catalog || []).map((item) => {
      const vendor = (item.vendors as { name: string } | null)?.name || "";
      const price = item.unit_cost ? `$${item.unit_cost}/${item.unit}` : "no price";
      const sku = item.item_number ? ` | SKU: ${item.item_number}` : "";
      const vendorStr = vendor ? ` | ${vendor}` : "";
      const stock = item.quantity_on_hand > 0 ? ` (${item.quantity_on_hand} in stock)` : "";
      return `  - ${item.description} | ${price}${sku}${vendorStr}${stock}`;
    }).join("\n") || "  - No inventory items yet";

    const projectHistoryLines = (recentProjects || []).map((p) => {
      const matTotal = (p.materials || []).reduce((s: number, m: { cost?: number }) => s + (m.cost || 0), 0);
      const laborTotal = (p.labor_log || []).reduce((s: number, l: { cost?: number }) => s + (l.cost || 0), 0);
      return `  - "${p.project_name}": quoted $${p.quoted_amount || 0}, actual materials $${matTotal.toFixed(0)}, actual labor $${laborTotal.toFixed(0)}`;
    }).join("\n") || "  - No completed projects yet";

    const receiptLines = (recentReceipts || []).map((r) => {
      const items = (r.line_items || []).slice(0, 3).map((li: { description: string; total: number }) => `${li.description} ($${li.total})`).join(", ");
      return `  - ${r.vendor || "Unknown"} | $${r.total || 0} total${items ? ` | Items: ${items}` : ""}`;
    }).join("\n") || "  - No receipts yet";

    // ── Current estimate context ──────────────────────────────
    const currentEstimate = estimate ? `
## Current Estimate Being Built
Project: ${estimate.project_name || "Untitled"}
Client: ${estimate.client_name || "—"}
Current line items: ${(estimate.line_items || []).length}
Current labor items: ${(estimate.labor_items || []).length}
Current markup: ${estimate.markup_percent || 0}%
` : "";

    // ── System prompt ─────────────────────────────────────────
    const systemPrompt = `You are the AI estimator for ${bizName}, a custom woodworking and metalworks shop. You help build accurate project estimates by having a natural conversation with the team.

Your goal is to understand the project scope through conversation, then produce a complete structured estimate when you have enough information.

${currentEstimate}

## Team Labor Rates
${teamRates}

## Material Catalog (your actual priced inventory)
${catalogLines}

## Recent Project History (for cost reference)
${projectHistoryLines}

## Recent Material Receipts (real costs paid)
${receiptLines}

## How You Work
1. Ask clarifying questions naturally — dimensions, materials, finish, complexity, timeline
2. Reference catalog items by their actual prices when you can
3. Use team rates for labor calculations
4. Use project history to sanity-check your totals
5. When you have enough info, produce the estimate

## Producing an Estimate
When ready, include this block ANYWHERE in your response (can follow your explanation):

<estimate_data>
{
  "line_items": [
    { "description": "Item description", "quantity": 1, "unit": "ea", "unit_price": 0.00, "item_number": "" }
  ],
  "labor_items": [
    { "description": "Labor type (e.g. Welding, Woodworking)", "hours": 0, "rate": 0, "cost": 0 }
  ],
  "markup_percent": 20,
  "notes": "Any notes about assumptions or scope"
}
</estimate_data>

Rules for the estimate block:
- Use real catalog prices where items match
- Use real team rates for labor
- cost = hours × rate for each labor item
- markup_percent is applied to the subtotal
- Be thorough — include all materials, hardware, finish, delivery if applicable
- If you're not sure about something, note it in the notes field

Keep your tone direct and professional. You're talking to a craftsman, not a client.`;

    // ── Call Claude ───────────────────────────────────────────
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[estimate-chat] Anthropic error:", err);
      const msg = err?.error?.message || JSON.stringify(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || "";

    // ── Parse estimate block if present ──────────────────────
    let estimateData = null;
    const match = content.match(/<estimate_data>([\s\S]*?)<\/estimate_data>/);
    if (match) {
      try {
        estimateData = JSON.parse(match[1].trim());
      } catch {
        console.warn("[estimate-chat] Could not parse estimate_data block");
      }
    }

    // Return response with estimate block stripped from display text
    const displayText = content.replace(/<estimate_data>[\s\S]*?<\/estimate_data>/g, "").trim();

    return NextResponse.json({
      message: displayText,
      estimateData,
    });
  } catch (err) {
    console.error("[estimate-chat] error:", err);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
