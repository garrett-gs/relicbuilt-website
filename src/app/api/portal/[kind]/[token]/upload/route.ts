import { NextRequest, NextResponse } from "next/server";
import { axiomAdmin } from "@/lib/axiom-admin";
import { requirePortal } from "@/lib/portal-server";

// POST /api/portal/{project|company}/<token>/upload (multipart "file") → { url }
// A photo a client attaches to a comment or approval response.

type Ctx = { params: Promise<{ kind: string; token: string }> };
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: Ctx) {
  const db = axiomAdmin();
  const p = await requirePortal(db, ctx.params);
  if (p instanceof NextResponse) return p;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo was sent." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Send a photo." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too large." }, { status: 413 });

  const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
  const path = `portal/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await db.storage.from("portal-images").upload(path, file, { contentType: file.type });
  if (error) return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  return NextResponse.json({ url: db.storage.from("portal-images").getPublicUrl(path).data.publicUrl });
}
