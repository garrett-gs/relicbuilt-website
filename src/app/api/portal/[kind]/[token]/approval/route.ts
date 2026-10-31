import { NextRequest, NextResponse } from "next/server";
import { axiomAdmin } from "@/lib/axiom-admin";
import { requirePortal } from "@/lib/portal-server";

// POST /api/portal/{project|company}/<token>/approval
//   { id, status: "approved" | "rejected", notes?, image? }
// Only approvals on a project this link opens.

type Ctx = { params: Promise<{ kind: string; token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const db = axiomAdmin();
  const p = await requirePortal(db, ctx.params);
  if (p instanceof NextResponse) return p;
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: string; notes?: string; image?: string };
  if (b.status !== "approved" && b.status !== "rejected") {
    return NextResponse.json({ error: "Approve or request changes." }, { status: 400 });
  }
  const ids = p.scope.projects.map((x) => x.id);
  const image = typeof b.image === "string" && /^https:\/\//.test(b.image) ? b.image : null;
  const { data, error } = await db
    .from("approval_requests")
    .update({
      status: b.status,
      client_notes: String(b.notes || "").trim().slice(0, 5000) || null,
      response_images: image ? [image] : [],
      responded_at: new Date().toISOString(),
    })
    .eq("id", String(b.id || ""))
    .in("custom_work_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .select("id");
  if (error) return NextResponse.json({ error: "Couldn't save your response." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Unknown approval" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
