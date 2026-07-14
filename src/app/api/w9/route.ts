import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { W9_BASE64 } from "@/lib/w9-base64";

export const runtime = "nodejs";

/**
 * Serves Wallflower RELIC's signed W-9 with TODAY's date stamped on the
 * signature line. Generated fresh on each request (never stored), so the
 * date always reflects when the client grabbed it. Linked from the pay page.
 */
export async function GET() {
  try {
    const doc = await PDFDocument.load(Buffer.from(W9_BASE64, "base64"));
    const page = doc.getPages()[0];
    const font = await doc.embedFont(StandardFonts.Helvetica);

    // MM/DD/YYYY in US Central (Omaha) so late-night requests don't roll to
    // the next UTC day.
    const today = new Date().toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    // Just right of the "Date" label (x≈401), on the signature line (y≈197).
    page.drawText(today, { x: 408, y: 197, size: 11, font, color: rgb(0, 0, 0) });

    const out = await doc.save();
    return new NextResponse(Buffer.from(out), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Wallflower-RELIC-W9.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[w9] generation failed:", err);
    return NextResponse.json({ error: "Could not generate W-9" }, { status: 500 });
  }
}
