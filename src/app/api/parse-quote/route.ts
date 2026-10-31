import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Parse a vendor quote (PDF or image) into material line items for an estimate.
// Uses Claude, which reads PDFs natively via a document content block.
export async function POST(req: NextRequest) {
  const auth = await requireTeamMember(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { file_base64, media_type } = await req.json();
    if (!file_base64) return NextResponse.json({ error: "file_base64 required" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    const mt = (media_type || "application/pdf") as string;
    const isPdf = mt === "application/pdf";
    const sourceBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file_base64 } }
      : { type: "image", source: { type: "base64", media_type: mt, data: file_base64 } };

    const prompt = `This is a supplier/vendor quote or estimate for materials. Extract every line item and return ONLY a JSON object (no markdown, no prose) with this exact shape:
{
  "vendor": "supplier name as a string, or null",
  "date": "YYYY-MM-DD or null",
  "items": [
    { "item_number": "SKU/part number as a string, or empty string", "description": "item description", "qty": 1, "unit": "ea", "unit_price": 0.00, "total": 0.00 }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00
}

Rules:
- One object per quoted line item. Include materials only (skip pure freight/handling lines unless they are the only charge).
- qty, unit_price, total must be plain numbers (no $, no commas).
- unit = the unit of measure shown (e.g. "ea", "bd ft", "sheet", "lf"); default "ea" if none.
- If a line's extended total is shown, use it; otherwise leave total as qty * unit_price.
- item_number is the vendor's SKU/part number if present, else an empty string.
- Use null for any top-level field not shown. Return ONLY the JSON object.`;

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
        messages: [
          {
            role: "user",
            content: [sourceBlock, { type: "text", text: prompt }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[parse-quote] Anthropic error:", JSON.stringify(err));
      return NextResponse.json({ error: err?.error?.message || "Could not read the quote." }, { status: 500 });
    }

    const data = await res.json();
    const text: string = (data.content || []).filter((b: { type?: string }) => b.type === "text").map((b: { text?: string }) => b.text || "").join("").trim();
    if (!text) return NextResponse.json({ error: "Empty response from the parser." }, { status: 500 });

    // Pull the JSON object out even if the model wraps it in fences/prose.
    const jsonStr = (() => {
      const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced) return fenced[1].trim();
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      return first >= 0 && last > first ? text.slice(first, last + 1) : text;
    })();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[parse-quote] JSON parse failed:", text.slice(0, 500));
      return NextResponse.json({ error: "Couldn't read line items from that file. Try a clearer copy." }, { status: 422 });
    }
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[parse-quote] error:", err);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
