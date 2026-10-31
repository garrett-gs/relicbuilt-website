import { NextRequest, NextResponse } from "next/server";
import { axiomAdmin } from "@/lib/axiom-admin";
import { requirePortal } from "@/lib/portal-server";

// POST /api/portal/{project|company}/<token>/comment
//   { custom_work_id, body, image_url?, is_change_request? }
// The project must be one this link opens; the author is the client on file.

type Ctx = { params: Promise<{ kind: string; token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const db = axiomAdmin();
  const p = await requirePortal(db, ctx.params);
  if (p instanceof NextResponse) return p;
  const b = (await req.json().catch(() => ({}))) as {
    custom_work_id?: string;
    body?: string;
    image_url?: string | null;
    is_change_request?: boolean;
  };
  const projectId = String(b.custom_work_id || "");
  if (!p.scope.projects.some((x) => x.id === projectId)) {
    return NextResponse.json({ error: "Unknown project" }, { status: 404 });
  }
  const body = String(b.body || "").trim().slice(0, 5000);
  const image = typeof b.image_url === "string" && /^https:\/\//.test(b.image_url) ? b.image_url : null;
  if (!body && !image) return NextResponse.json({ error: "Write a message or add a photo." }, { status: 400 });

  const { error } = await db.from("build_comments").insert({
    custom_work_id: projectId,
    author: p.scope.clientName(projectId),
    body: body || " ",
    is_change_request: !!b.is_change_request,
    image_url: image,
  });
  if (error) return NextResponse.json({ error: "Couldn't post your message." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
