import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { image_url } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

    const prompt = `You are a receipt parser. Analyze this receipt image and return a JSON object with these exact fields:
{
  "vendor": "store or supplier name as a string",
  "date": "YYYY-MM-DD format or null if not visible",
  "items": [
    { "description": "item name", "qty": 1, "unit_price": 0.00, "total": 0.00 }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00
}

Rules:
- qty must be a number (use 1 if not shown)
- unit_price and total must be numbers, no $ signs
- If the total for a line is shown, use that; otherwise calculate qty * unit_price
- If a field is not visible on the receipt, use null
- Return ONLY valid JSON, no markdown, no explanation`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: image_url, detail: "high" } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[parse-receipt] OpenAI error:", JSON.stringify(err));
      const message = err?.error?.message || err?.error?.code || JSON.stringify(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Empty response from OpenAI" }, { status: 500 });

    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[parse-receipt] error:", err);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
