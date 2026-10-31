import { NextRequest, NextResponse } from "next/server";
import { requireReceiptsSession } from "@/lib/receipts-session";

// POST /api/receipts/upload (multipart "file") → { url } of the stored photo.

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const s = await requireReceiptsSession(req);
  if (s instanceof NextResponse) return s;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo was sent." }, { status: 400 });
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Send a photo of the receipt." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too large." }, { status: 413 });

  const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await s.db.storage.from("receipts").upload(path, file, { contentType: file.type });
  if (error) return NextResponse.json({ error: "Upload failed: " + error.message }, { status: 500 });
  const { data } = s.db.storage.from("receipts").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
