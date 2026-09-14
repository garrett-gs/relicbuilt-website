import { NextRequest, NextResponse } from "next/server";
import { identifyCaller, AuthError } from "@/lib/assistant/identity";
import { extractProductFromUrl } from "@/lib/price-extract";

/**
 * Fetch a public product URL and extract its name/price/SKU so it can be added
 * to the catalog. Auth-gated to signed-in team members. The outbound fetch to
 * the product page carries nothing about the user.
 *
 * POST /api/axiom/price-from-url  { url }
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    try {
      await identifyCaller(token);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const { url } = await req.json();
    const result = await extractProductFromUrl(String(url || ""));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    return NextResponse.json({ product: result.product });
  } catch (err) {
    console.error("[price-from-url] error:", err);
    return NextResponse.json({ error: "Couldn't read that page." }, { status: 500 });
  }
}
