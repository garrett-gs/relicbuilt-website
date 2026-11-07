// Fires the Nexus build-link webhook when an estimate is created from a
// Wallflower work order. Intake no longer auto-spawns an estimate, so the
// custom-build pricing loop is opened here instead — the moment someone
// actually starts pricing the work order. Thin wrapper so the browser never
// sees the Nexus service keys (they live inside notifyNexusBuildLink).

import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/api-auth";
import { axiomAdmin } from "@/lib/axiom-admin";
import { notifyNexusBuildLink } from "@/lib/notify-nexus-build-link";

export async function POST(req: NextRequest) {
  const auth = await requireTeamMember(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { estimateId, estimateNumber, proposalToken, workOrderId } = await req.json();
    if (!estimateId || !proposalToken) {
      return NextResponse.json({ error: "estimateId and proposalToken required" }, { status: 400 });
    }

    // Pull the originating work order's Wallflower order id + Nexus ref so the
    // webhook can address the build on Nexus's side.
    let wallflowerOrderId: string | null = null;
    let nexusRef: unknown = null;
    if (workOrderId) {
      const { data: wo } = await axiomAdmin()
        .from("wallflower_work_orders")
        .select("wallflower_order_id, nexus_ref")
        .eq("id", workOrderId)
        .maybeSingle();
      wallflowerOrderId = wo?.wallflower_order_id ?? null;
      nexusRef = wo?.nexus_ref ?? null;
    }

    await notifyNexusBuildLink({
      estimateId,
      estimateNumber,
      proposalToken,
      event: "created",
      status: "draft",
      estimateAmount: 0,
      wallflowerOrderId,
      nexusRef,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[wallflower/link-estimate] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
