import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    // Convert file to base64
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mediaType = file.type === "application/pdf" ? "application/pdf" : (file.type || "image/jpeg");

    // Load existing inventory for matching
    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: existingItems } = await supabase
      .from("inventory_items")
      .select("id, item_number, description, unit, unit_cost, quantity_on_hand")
      .eq("active", true);

    const inventoryList = (existingItems || []).map((item) => {
      const sku = item.item_number ? `SKU:${item.item_number} | ` : "";
      return `  - ${sku}${item.description} | $${item.unit_cost}/${item.unit} (${item.quantity_on_hand} on hand)`;
    }).join("\n") || "  (no items)";

    // Build Claude message with the document
    const content: Array<Record<string, unknown>> = [];

    if (mediaType === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      });
    } else {
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      });
    }

    content.push({
      type: "text",
      text: `Extract ALL line items / materials from this document (vendor estimate, quote, invoice, or price list). For each item found, provide:
- item_number (SKU/part number if visible)
- description
- quantity (default to 1 if not specified)
- unit_price (per unit cost)
- unit (ea, bf, sqft, lf, etc.)

Then compare each extracted item against our current inventory below and mark whether it's a MATCH or NEW.

## Our Current Inventory
${inventoryList}

## Matching Rules
- Match by item_number/SKU first (exact match)
- If no SKU match, match by description similarity (the description doesn't have to be exact — "White Oak 4/4" matches "White Oak 4/4 #1C")
- Mark as MATCH if the item clearly refers to the same product, even with slightly different wording
- Mark as NEW if there's no reasonable match

Return a JSON array with this exact format:
<scan_results>
[
  {
    "item_number": "string or null",
    "description": "string",
    "quantity": number,
    "unit_price": number,
    "unit": "string",
    "status": "match" or "new",
    "matched_inventory_id": "uuid or null (if match)",
    "matched_description": "string or null (the inventory item it matched to)",
    "notes": "string or null (any relevant notes, price differences, etc.)"
  }
]
</scan_results>

Important:
- Extract EVERY line item, not just materials — include hardware, finishes, etc.
- If a price isn't shown, set unit_price to 0 and note it
- Preserve the original description from the document
- If an inventory match exists but at a DIFFERENT price, note the price difference`,
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[scan-to-inventory] Anthropic error:", err);
      return NextResponse.json({ error: err?.error?.message || "Failed to parse document" }, { status: 500 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    // Parse the results
    const match = text.match(/<scan_results>([\s\S]*?)<\/scan_results>/);
    if (!match) {
      return NextResponse.json({ error: "Could not extract items from document", raw: text }, { status: 422 });
    }

    let items;
    try {
      items = JSON.parse(match[1].trim());
    } catch {
      return NextResponse.json({ error: "Could not parse extracted items", raw: match[1] }, { status: 422 });
    }

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[scan-to-inventory] error:", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
