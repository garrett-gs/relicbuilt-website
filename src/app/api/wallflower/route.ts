import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const API_KEY = process.env.WALLFLOWER_API_KEY || "wf-relic-2026";

export async function POST(req: NextRequest) {
  try {
    // Verify API key
    const authHeader = req.headers.get("authorization");
    const key = authHeader?.replace("Bearer ", "");
    if (key !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { item_name, item_source, work_type, scope, assigned_to, deadline, status, description, quantity, submitted_by } = body;

    if (!item_name?.trim()) {
      return NextResponse.json({ error: "item_name is required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from("wallflower_work_orders")
      .insert({
        item_name: item_name.trim(),
        item_source: item_source || "custom",
        work_type: work_type || "Repair",
        scope: scope || "External",
        assigned_to: assigned_to || null,
        deadline: deadline || null,
        status: status || "pending",
        description: description || null,
        quantity: quantity || 1,
        submitted_by: submitted_by || "Wallflower",
      })
      .select()
      .single();

    if (error) {
      console.error("wallflower submit error:", error);
      return NextResponse.json({ error: "Failed to create work order" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("wallflower API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
