import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * The client portals, served by the server so the public key needs no access
 * to projects, files, comments or approvals. A portal link's token is the
 * only key: it opens one project (/axiom/portal/<token>) or every project of
 * one company (/client/<token>), and only the fields a client should see.
 */

export type PortalKind = "project" | "company";
export const isPortalKind = (k: string): k is PortalKind => k === "project" || k === "company";

// What a client sees of a project — no costs, labor, materials or notes.
export const PROJECT_FIELDS =
  "id,project_name,client_name,company_name,project_description,status,portal_stage,budget_range,timeline,due_date,quoted_amount,proposal_highlights,proposal_images,created_at";
const COMPANY_FIELDS = "id,name,industry";
const FILE_FIELDS = "id,custom_work_id,file_url,file_name,file_type,label,created_at";
const COMMENT_FIELDS = "id,custom_work_id,author,body,is_change_request,image_url,created_at";
const APPROVAL_FIELDS = "id,custom_work_id,description,status,client_notes,images,response_images,responded_at,created_at";

type Row = Record<string, unknown> & { id: string };

export interface PortalScope {
  company: Row | null;
  projects: Row[];
  /** Name to sign the client's comments and notifications with, per project. */
  clientName: (projectId: string) => string;
}

const TOKEN = /^[A-Za-z0-9_-]{8,200}$/;

/** The projects a portal link opens, or null if the link isn't live. */
export async function portalScope(db: SupabaseClient, kind: PortalKind, token: string): Promise<PortalScope | null> {
  if (!TOKEN.test(token)) return null;

  if (kind === "project") {
    const { data } = await db
      .from("custom_work")
      .select(PROJECT_FIELDS)
      .eq("portal_token", token)
      .eq("portal_enabled", true)
      .maybeSingle<Row>();
    if (!data) return null;
    return { company: null, projects: [data], clientName: () => String(data.client_name || "Client") };
  }

  const { data: company } = await db
    .from("companies")
    .select(`${COMPANY_FIELDS},tenant_id`)
    .eq("portal_token", token)
    .eq("portal_enabled", true)
    .maybeSingle<Row & { name: string; tenant_id: string }>();
  if (!company) return null;
  // Same rule the page used: the company's projects, by link or by name, in
  // the company's own workspace.
  const { data: projects } = await db
    .from("custom_work")
    .select(PROJECT_FIELDS)
    .eq("tenant_id", company.tenant_id)
    .or(`company_id.eq.${company.id},company_name.eq."${company.name.replace(/"/g, '\\"')}"`)
    .order("created_at", { ascending: false });
  const list = (projects || []) as Row[];
  const { tenant_id: _omit, ...publicCompany } = company;
  void _omit;
  return {
    company: publicCompany as Row,
    projects: list,
    clientName: (id) => String(list.find((p) => p.id === id)?.client_name || company.name || "Client"),
  };
}

export async function portalContent(db: SupabaseClient, scope: PortalScope) {
  const ids = scope.projects.map((p) => p.id);
  if (ids.length === 0) return { company: scope.company, projects: [] };
  const [files, comments, approvals] = await Promise.all([
    db.from("build_files").select(FILE_FIELDS).in("custom_work_id", ids).order("created_at"),
    db.from("build_comments").select(COMMENT_FIELDS).in("custom_work_id", ids).order("created_at"),
    db.from("approval_requests").select(APPROVAL_FIELDS).in("custom_work_id", ids).order("created_at", { ascending: false }),
  ]);
  const of = (rows: Row[] | null, id: string) => (rows || []).filter((r) => r.custom_work_id === id);
  return {
    company: scope.company,
    projects: scope.projects.map((project) => ({
      project,
      files: of(files.data as Row[] | null, project.id),
      comments: of(comments.data as Row[] | null, project.id),
      approvals: of(approvals.data as Row[] | null, project.id),
    })),
  };
}

/** Resolves the portal from the route params, or the 404 to send. */
export async function requirePortal(
  db: SupabaseClient,
  params: Promise<{ kind: string; token: string }>,
): Promise<{ scope: PortalScope; kind: PortalKind } | NextResponse> {
  const { kind, token } = await params;
  const scope = isPortalKind(kind) ? await portalScope(db, kind, token) : null;
  if (!scope) return NextResponse.json({ error: "This portal link isn't active." }, { status: 404 });
  return { scope, kind: kind as PortalKind };
}
