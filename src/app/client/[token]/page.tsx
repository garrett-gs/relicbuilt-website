"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { axiom } from "@/lib/axiom-supabase";
import { Company, CustomWork, BuildFile, BuildComment, ApprovalRequest, ProposalHighlight } from "@/types/axiom";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp, MessageSquare, FileText, ImageIcon } from "lucide-react";

const STAGES = [
  { key: "consultation",  label: "Consultation" },
  { key: "design",        label: "Design" },
  { key: "approval",      label: "Approval" },
  { key: "fabrication",   label: "Fabrication" },
  { key: "finishing",     label: "Finishing" },
  { key: "delivery",      label: "Delivery" },
];

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_review: "In Review",
  quoted: "Quoted",
  in_progress: "In Progress",
  complete: "Complete",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400",
  in_review: "bg-yellow-500/20 text-yellow-400",
  quoted: "bg-purple-500/20 text-purple-400",
  in_progress: "bg-accent/20 text-accent",
  complete: "bg-green-500/20 text-green-400",
};

interface ProjectData {
  project: CustomWork;
  files: BuildFile[];
  comments: BuildComment[];
  approvals: ApprovalRequest[];
}

export default function ClientPortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [projectsData, setProjectsData] = useState<ProjectData[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newComments, setNewComments] = useState<Record<string, string>>({});
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: co } = await axiom
      .from("companies")
      .select("*")
      .eq("portal_token", token)
      .eq("portal_enabled", true)
      .single();

    if (!co) { setNotFound(true); setLoading(false); return; }
    setCompany(co);

    const { data: projects } = await axiom
      .from("custom_work")
      .select("*")
      .or(`company_id.eq.${co.id},company_name.eq.${co.name}`)
      .order("created_at", { ascending: false });

    if (!projects || projects.length === 0) {
      setProjectsData([]);
      setLoading(false);
      if (projects && projects.length === 0) setExpandedId(null);
      return;
    }

    const ids = projects.map((p: CustomWork) => p.id);

    const [filesRes, commentsRes, approvalsRes] = await Promise.all([
      axiom.from("build_files").select("*").in("custom_work_id", ids).order("created_at"),
      axiom.from("build_comments").select("*").in("custom_work_id", ids).order("created_at"),
      axiom.from("approval_requests").select("*").in("custom_work_id", ids).order("created_at", { ascending: false }),
    ]);

    const pd: ProjectData[] = projects.map((p: CustomWork) => ({
      project: p,
      files: (filesRes.data || []).filter((f: BuildFile) => f.custom_work_id === p.id),
      comments: (commentsRes.data || []).filter((c: BuildComment) => c.custom_work_id === p.id),
      approvals: (approvalsRes.data || []).filter((a: ApprovalRequest) => a.custom_work_id === p.id),
    }));

    setProjectsData(pd);
    // Auto-expand first active project
    const firstActive = pd.find((d) => d.project.status !== "complete");
    if (firstActive) setExpandedId(firstActive.project.id);
    else if (pd.length > 0) setExpandedId(pd[0].project.id);

    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function submitComment(projectId: string, clientName: string) {
    const text = newComments[projectId]?.trim();
    if (!text) return;
    await axiom.from("build_comments").insert({
      custom_work_id: projectId,
      author: clientName || "Client",
      body: text,
      is_change_request: false,
    });
    setNewComments((prev) => ({ ...prev, [projectId]: "" }));
    load();
  }

  async function respondToApproval(id: string, status: "approved" | "rejected") {
    await axiom.from("approval_requests").update({
      status,
      responded_at: new Date().toISOString(),
    }).eq("id", id);
    load();
  }

  const totalValue = projectsData.reduce((s, { project }) => s + (project.quoted_amount || 0), 0);
  const activeCount = projectsData.filter(({ project }) => project.status !== "complete").length;
  const completeCount = projectsData.filter(({ project }) => project.status === "complete").length;

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#e2e4e8" }}>
        <div className="text-center">
          <Image src="/logo-emblem.png" alt="Relic" width={48} height={48} className="mx-auto mb-4" />
          <h1 className="text-xl font-heading font-bold mb-2">Portal Not Found</h1>
          <p className="text-gray-700 text-sm">This portal link is invalid or has been disabled.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#e2e4e8" }}>
        <p className="text-gray-500 animate-pulse">Loading portal…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#e2e4e8" }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-emblem.png" alt="Relic" width={32} height={32} />
            <div>
              <p className="font-heading font-bold tracking-widest text-sm text-gray-900">R&ensp;E&ensp;L&ensp;I&ensp;C</p>
              <p className="text-xs text-gray-600">Client Portal</p>
            </div>
          </div>
          {company && (
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{company.name}</p>
              {company.industry && <p className="text-xs text-gray-600">{company.industry}</p>}
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-heading font-bold mb-1 text-gray-900">
            Welcome, {company?.name}
          </h1>
          <p className="text-gray-700 text-sm">Here&apos;s an overview of your projects with Relic.</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-white border border-gray-200 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Total Projects</p>
            <p className="text-3xl font-mono font-bold text-gray-900">{projectsData.length}</p>
          </div>
          <div className="bg-white border border-gray-200 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Active</p>
            <p className="text-3xl font-mono font-bold text-gray-900">{activeCount}</p>
          </div>
          <div className="bg-white border border-gray-200 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Completed</p>
            <p className="text-3xl font-mono font-bold text-gray-900">{completeCount}</p>
          </div>
          <div className="bg-white border border-gray-200 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Total Value</p>
            <p className="text-3xl font-mono font-bold" style={{ color: "var(--accent)" }}>
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(totalValue)}
            </p>
          </div>
        </div>

        {/* Projects */}
        <div className="space-y-4">
          {projectsData.map(({ project, files, comments, approvals }) => {
            const isOpen = expandedId === project.id;
            const stageIndex = STAGES.findIndex((s) => s.key === project.portal_stage);
            const pendingApprovals = approvals.filter((a) => a.status === "pending");

            return (
              <div key={project.id} className="border border-gray-200 bg-white">
                {/* Project header row */}
                <button
                  onClick={() => setExpandedId(isOpen ? null : project.id)}
                  className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="min-w-0">
                      <p className="font-heading font-bold text-base truncate text-gray-900">{project.project_name}</p>
                      {project.timeline && (
                        <p className="text-xs text-gray-500 mt-0.5">{project.timeline}</p>
                      )}
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 whitespace-nowrap", STATUS_COLORS[project.status] || "bg-muted/20 text-gray-500")}>
                      {STATUS_LABELS[project.status] || project.status}
                    </span>
                    {pendingApprovals.length > 0 && (
                      <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 whitespace-nowrap animate-pulse">
                        {pendingApprovals.length} Approval{pendingApprovals.length > 1 ? "s" : ""} Needed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {project.quoted_amount > 0 && (
                      <p className="text-sm font-mono font-semibold text-gray-900">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(project.quoted_amount)}
                      </p>
                    )}
                    <span className="text-gray-500">
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </span>
                  </div>
                </button>

                {/* Stage progress bar */}
                {project.portal_stage && (
                  <div className="px-6 pb-4 flex gap-1">
                    {STAGES.map((stage, i) => {
                      const done = i < stageIndex;
                      const cur = i === stageIndex;
                      return (
                        <div key={stage.key} className="flex-1 flex flex-col items-center gap-1">
                          <div className={cn(
                            "h-1.5 w-full rounded-full",
                            done ? "bg-accent" : cur ? "bg-accent/50" : "bg-border"
                          )} />
                          <p className={cn("text-[9px] tracking-wide", cur ? "text-accent" : "text-gray-500/50")}>
                            {stage.label}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Expanded content */}
                {isOpen && (
                  <div className="border-t border-gray-200 px-6 py-6 space-y-8">

                    {/* Pending approvals */}
                    {pendingApprovals.length > 0 && (
                      <div className="bg-accent/10 border border-accent/30 p-5">
                        <h3 className="text-xs uppercase tracking-wider text-accent mb-3">Action Required</h3>
                        <div className="space-y-4">
                          {pendingApprovals.map((a) => (
                            <div key={a.id}>
                              <p className="text-sm mb-3">{a.description}</p>
                              <div className="flex gap-3">
                                <button
                                  onClick={() => respondToApproval(a.id, "approved")}
                                  className="flex items-center gap-1.5 bg-accent text-white text-sm px-4 py-2 hover:bg-accent/80"
                                >
                                  <Check size={13} /> Approve
                                </button>
                                <button
                                  onClick={() => respondToApproval(a.id, "rejected")}
                                  className="text-sm border border-gray-300 text-gray-500 px-4 py-2 hover:text-gray-900"
                                >
                                  Request Changes
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    {project.project_description && (
                      <div>
                        <h3 className="text-xs uppercase tracking-wider text-gray-600 mb-3">Project Description</h3>
                        <p className="text-sm text-gray-500 leading-relaxed">{project.project_description}</p>
                      </div>
                    )}

                    {/* Proposal highlights */}
                    {project.proposal_highlights && project.proposal_highlights.length > 0 && (
                      <div>
                        <h3 className="text-xs uppercase tracking-wider text-gray-600 mb-4">Project Highlights</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(project.proposal_highlights as ProposalHighlight[]).map((h, i) => (
                            <div key={i} className="border-l-2 border-accent pl-4 py-1">
                              <p className="text-sm font-semibold mb-1">{h.title}</p>
                              <p className="text-sm text-gray-500 leading-relaxed">{h.body}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Gallery */}
                    {project.proposal_images && project.proposal_images.length > 0 && (
                      <div>
                        <h3 className="text-xs uppercase tracking-wider text-gray-600 mb-4 flex items-center gap-1.5">
                          <ImageIcon size={11} /> Gallery
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {(project.proposal_images as string[]).map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={url}
                                alt={`Project image ${i + 1}`}
                                className="w-full aspect-square object-cover border border-gray-200 hover:border-accent transition-colors"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Files */}
                    {files.length > 0 && (
                      <div>
                        <h3 className="text-xs uppercase tracking-wider text-gray-600 mb-3 flex items-center gap-1.5">
                          <FileText size={11} /> Drawings &amp; Files
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {files.map((f) => (
                            <a
                              key={f.id}
                              href={f.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-gray-50 border border-gray-200 p-3 hover:border-accent transition-colors"
                            >
                              <p className="text-sm font-medium truncate">{f.file_name || "File"}</p>
                              <p className="text-xs text-gray-500">{f.label || f.file_type || ""}</p>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Project details sidebar info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {project.budget_range && (
                        <div className="bg-gray-50 border border-gray-200 p-3">
                          <p className="text-xs text-gray-500 mb-1">Budget</p>
                          <p className="text-sm font-medium">{project.budget_range}</p>
                        </div>
                      )}
                      {project.timeline && (
                        <div className="bg-gray-50 border border-gray-200 p-3">
                          <p className="text-xs text-gray-500 mb-1">Timeline</p>
                          <p className="text-sm font-medium">{project.timeline}</p>
                        </div>
                      )}
                      {project.due_date && (
                        <div className="bg-gray-50 border border-gray-200 p-3">
                          <p className="text-xs text-gray-500 mb-1">Due Date</p>
                          <p className="text-sm font-medium">{new Date(project.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                        </div>
                      )}
                      {project.quoted_amount > 0 && (
                        <div className="bg-gray-50 border border-gray-200 p-3">
                          <p className="text-xs text-gray-500 mb-1">Quote</p>
                          <p className="text-sm font-medium font-mono">
                            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(project.quoted_amount)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Comments */}
                    <div>
                      <h3 className="text-xs uppercase tracking-wider text-gray-600 mb-3 flex items-center gap-1.5">
                        <MessageSquare size={11} /> Notes &amp; Comments
                      </h3>
                      <div className="space-y-2 mb-4">
                        {comments.length === 0 && (
                          <p className="text-gray-700 text-sm">No comments yet.</p>
                        )}
                        {comments.map((c) => (
                          <div
                            key={c.id}
                            className={cn(
                              "border p-3 text-sm",
                              c.is_change_request
                                ? "bg-amber-50 border-amber-300"
                                : "bg-white border-gray-300"
                            )}
                          >
                            {c.is_change_request && (
                              <span className="text-[10px] uppercase tracking-wider text-amber-600 block mb-1">Change Request</span>
                            )}
                            <p className="text-gray-900">{c.body}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {c.author} &middot; {new Date(c.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-3">
                        <input
                          value={newComments[project.id] || ""}
                          onChange={(e) => setNewComments((prev) => ({ ...prev, [project.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") submitComment(project.id, project.client_name); }}
                          placeholder="Leave a comment…"
                          className="flex-1 bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                        />
                        <button
                          onClick={() => submitComment(project.id, project.client_name)}
                          disabled={!newComments[project.id]?.trim()}
                          className="bg-accent text-white text-sm px-4 py-2 hover:bg-accent/80 disabled:opacity-40"
                        >
                          Send
                        </button>
                      </div>
                    </div>

                    {/* Approval history */}
                    {approvals.filter((a) => a.status !== "pending").length > 0 && (
                      <div>
                        <h3 className="text-xs uppercase tracking-wider text-gray-600 mb-3">Approval History</h3>
                        <div className="space-y-2">
                          {approvals.filter((a) => a.status !== "pending").map((a) => (
                            <div key={a.id} className="bg-gray-50 border border-gray-200 p-3 text-sm flex justify-between items-start gap-4">
                              <p className="text-sm">{a.description}</p>
                              <span className={cn(
                                "text-xs px-2 py-0.5 shrink-0",
                                a.status === "approved" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                              )}>
                                {a.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })}
        </div>

        {projectsData.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg font-heading mb-2">No projects yet</p>
            <p className="text-sm">Your projects will appear here once they&apos;re created.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-6 py-5 mt-16">
        <p className="text-center text-xs text-gray-500">
          R&ensp;E&ensp;L&ensp;I&ensp;C &middot; Custom Fabrications &middot; (402) 235-8179
        </p>
      </footer>
    </div>
  );
}
