import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWRClient } from "@/lib/wr-supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { estimate_id } = body;
    if (!estimate_id) {
      return NextResponse.json({ error: "estimate_id required" }, { status: 400 });
    }

    // Fetch the estimate from RELIC Axiom
    const axiomUrl = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!;
    const axiomKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!;
    const axiom = createClient(axiomUrl, axiomKey);

    const { data: estimate, error: estErr } = await axiom
      .from("estimates")
      .select("*")
      .eq("id", estimate_id)
      .single();

    if (estErr || !estimate) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    // If there's a linked project, grab images and build files
    let mainImage = "";
    let allImages: string[] = [];
    let buildFiles: { name: string; url: string; type: string }[] = [];
    let projectDescription = "";

    if (estimate.custom_work_id) {
      const { data: project } = await axiom
        .from("custom_work")
        .select("image_url, inspiration_images, project_description")
        .eq("id", estimate.custom_work_id)
        .single();

      if (project) {
        mainImage = project.image_url || "";
        allImages = project.inspiration_images || [];
        if (mainImage) allImages.unshift(mainImage);
        projectDescription = project.project_description || "";
      }

      const { data: files } = await axiom
        .from("build_files")
        .select("file_name, file_url, file_type")
        .eq("custom_work_id", estimate.custom_work_id);

      if (files) {
        buildFiles = files.map((f) => ({
          name: f.file_name,
          url: f.file_url,
          type: f.file_type || "file",
        }));
      }
    }

    // Calculate total price for the build
    const lineItems = estimate.line_items || [];
    const laborItems = estimate.labor_items || [];
    const markupPct = estimate.markup_percent || 0;

    const materialTotal = lineItems.reduce(
      (s: number, li: { quantity: number; unit_price: number }) =>
        s + (li.quantity || 0) * (li.unit_price || 0),
      0
    );
    const laborTotal = laborItems.reduce(
      (s: number, l: { cost: number }) => s + (l.cost || 0),
      0
    );
    const subtotal = materialTotal + laborTotal;
    const markupAmount = subtotal * (markupPct / 100);
    const total = subtotal + markupAmount;

    // Push to WR's relic_builds table
    const wr = getWRClient();

    const payload = {
      relic_estimate_id: estimate.id,
      estimate_number: estimate.estimate_number,
      project_name: estimate.project_name || estimate.estimate_number,
      description: projectDescription || estimate.notes || "",
      line_items: lineItems,
      labor_items: laborItems,
      markup_percent: markupPct,
      material_total: materialTotal,
      labor_total: laborTotal,
      total,
      image_url: mainImage || null,
      images: allImages,
      files: buildFiles,
      status: estimate.status,
      sent_at: new Date().toISOString(),
    };

    // Upsert — if already sent, update it
    const { data: wrData, error: wrErr } = await wr
      .from("relic_builds")
      .upsert(payload, { onConflict: "relic_estimate_id" })
      .select("id")
      .single();

    if (wrErr) {
      console.error("WR upsert error:", wrErr);
      return NextResponse.json(
        { error: `Failed to send to WR: ${wrErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, wr_id: wrData.id });
  } catch (err) {
    console.error("send-to-wr error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
