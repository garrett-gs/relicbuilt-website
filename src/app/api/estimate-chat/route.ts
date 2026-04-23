import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    const { messages, estimate } = await req.json();

    // ── Pull live context from Axiom ──────────────────────────
    // Use service role key if available (bypasses RLS), otherwise fall back to anon
    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const [
      { data: settings },
      { data: catalog },
      { data: vendorCatalog },
      { data: vendorList },
      { data: recentProjects },
      { data: recentReceipts },
    ] = await Promise.all([
      supabase.from("settings").select("biz_name, team_members, deposit_percent").limit(1).single(),
      supabase.from("inventory_items").select("*").eq("active", true).order("description").limit(500),
      supabase.from("vendor_catalog").select("*").eq("active", true).order("description").limit(500),
      supabase.from("vendors").select("id, name").eq("status", "active"),
      supabase.from("custom_work").select("project_name, quoted_amount, materials, labor_log, status").in("status", ["completed", "delivered"]).order("created_at", { ascending: false }).limit(15),
      supabase.from("receipts").select("vendor, total, line_items, receipt_date").order("receipt_date", { ascending: false }).limit(30),
    ]);

    // Build vendor lookup map
    const vendorMap = new Map((vendorList || []).map((v: { id: string; name: string }) => [v.id, v.name]));

    console.log("[estimate-chat] loaded context:", {
      inventoryCount: (catalog || []).length,
      vendorCatalogCount: (vendorCatalog || []).length,
      vendorCount: (vendorList || []).length,
    });

    // ── Build context strings ─────────────────────────────────

    const bizName = settings?.biz_name || "RELIC";

    const teamRates = (settings?.team_members || [])
      .filter((m: { hourly_rate?: number; name: string; role: string }) => m.hourly_rate)
      .map((m: { name: string; role: string; hourly_rate: number }) => `  - ${m.name} (${m.role}): $${m.hourly_rate}/hr`)
      .join("\n") || "  - No rates configured yet";

    const inventoryLines = (catalog || []).map((item) => {
      const vendor = item.vendor_id ? vendorMap.get(item.vendor_id) || "" : "";
      const price = item.unit_cost ? `$${item.unit_cost}/${item.unit}` : "no price";
      const sku = item.item_number ? ` | SKU: ${item.item_number}` : "";
      const vendorStr = vendor ? ` | ${vendor}` : "";
      const stock = item.quantity_on_hand > 0 ? ` (${item.quantity_on_hand} in stock)` : " (0 in stock)";
      return `  - ${item.description} | ${price}${sku}${vendorStr}${stock}`;
    }).join("\n") || "  - No inventory items yet";

    const vendorCatalogLines = (vendorCatalog || []).map((item) => {
      const vendor = item.vendor_id ? vendorMap.get(item.vendor_id) || "" : "";
      const price = item.unit_price ? `$${item.unit_price}/${item.unit}` : "no price";
      const sku = item.item_number ? ` | SKU: ${item.item_number}` : "";
      const cat = item.category ? ` | ${item.category}` : "";
      return `  - ${item.description} | ${price}${sku} | ${vendor}${cat}`;
    }).join("\n") || "  - No vendor catalog items yet";

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

## INVENTORY — Use These Prices First
These are materials we have on hand or have purchased before. **ALWAYS use these costs in your estimates.** Do NOT ask the user for pricing on anything that matches an item below. Use the unit_cost as your price.

${inventoryLines}

## VENDOR CATALOG — Additional Pricing Reference
These are items available from our vendors with known pricing. Use these if nothing matches in inventory above.

${vendorCatalogLines}

## Recent Project History (for cost reference)
${projectHistoryLines}

## Recent Material Receipts (real costs paid)
${receiptLines}

## CRITICAL RULES FOR PRICING
1. **Search inventory FIRST.** If a material matches or closely matches an inventory item, USE THAT PRICE. Do not ask the user what it costs.
2. **Search vendor catalog second.** If not in inventory but in the vendor catalog, use that price.
3. **Only ask the user for pricing** on materials that are NOT in inventory and NOT in the vendor catalog. When you do ask, be specific about which item you need a price for.
4. When you use an inventory/catalog price, mention it: "Using [item] at [price] from inventory."
5. For common hardware (screws, bolts, sandpaper, etc.) that isn't in inventory, estimate reasonable costs based on your knowledge — don't bother asking for every small item.

## MATCHING RULES — BE FLEXIBLE
Descriptions won't always match exactly. Use common sense:
- **Sheet goods**: "49 x 97" = "4x8" sheet (49"×97" is the actual size of a 4'×8' sheet). So "4x8 3/4 MDF" matches "49 X 97 3/4 MDF STANDARD".
- **Lumber**: "4/4 White Oak" matches any "4/4 OAK WHITE ..." entry. "Poplar" matches "4/4 POPLAR ...".
- **Thickness notation**: 3/4" = .75 = 0.75. 1/2" = .5. 4/4 = 1" rough / 25/32" surfaced.
- **Unit conversions**: board feet (bf) for hardwood, each (ea) for sheets, linear feet (lf) for moldings.
- If you see something in inventory that COULD reasonably be what the user wants, USE IT and mention what you matched. Don't ask for confirmation on obvious matches.
- Only ask for clarification if there's genuine ambiguity (e.g. multiple possible matches at different prices).

## IF INVENTORY APPEARS EMPTY
If the inventory section above shows "No inventory items yet" — that's a data issue, not real. Tell the user: "My inventory data isn't loading — check with Garrett." Do NOT ask them to give you prices for things they've already entered in the system.

## How You Work
1. Ask clarifying questions naturally — dimensions, materials, finish, complexity, timeline
2. Look up materials in inventory/catalog and use those costs automatically
3. Use team rates for labor calculations
4. Use project history to sanity-check your totals
5. When you have enough info, produce the estimate
6. Only ask for pricing on items you cannot find in inventory or catalog

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
- Use inventory/catalog prices — this is mandatory. Match items by description.
- Include the item_number from inventory/catalog when available
- Use real team rates for labor
- cost = hours × rate for each labor item
- markup_percent is applied to the subtotal
- Be thorough — include all materials, hardware, finish, delivery if applicable
- Note which items came from inventory vs. estimated in the notes field

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
