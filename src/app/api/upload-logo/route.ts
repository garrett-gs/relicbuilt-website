import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTeamMember } from "@/lib/api-auth";

// Uploads a business logo to the public `branding` storage bucket and returns
// its public URL, which Settings stores on the entity's identity (logo_url).
// Runs with the service role so no per-bucket storage policy is needed.
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);

export async function POST(req: NextRequest) {
  const auth = await requireTeamMember(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const entity = (form.get("entity") || "wallflower_relic").toString().replace(/[^a-z_]/g, "") || "wallflower_relic";
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Logo is too large (max 5 MB)." }, { status: 400 });
    }
    const type = file.type || "image/png";
    if (!ALLOWED.has(type)) {
      return NextResponse.json({ error: "Use a PNG, JPG, SVG, or WebP image." }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const ext = type === "image/svg+xml" ? "svg" : type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
    // Timestamped path so a new upload busts any cached copy of the old one.
    const path = `logos/${entity}-${Date.now()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage.from("branding").upload(path, buf, {
      contentType: type,
      upsert: true,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }
}
