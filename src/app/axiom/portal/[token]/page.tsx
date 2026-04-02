"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { axiom } from "@/lib/axiom-supabase";
import { CustomWork, BuildFile, BuildComment, ApprovalRequest } from "@/types/axiom";
import Image from "next/image";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Check, MessageSquare } from "lucide-react";
import { notifyPortal } from "@/lib/notify-portal";

const STAGES = [
  { key: "consultation", label: "Consultation" },
  { key: "design", label: "Design & Drawings" },
  { key: "approval", label: "Client Approval" },
  { key: "fabrication", label: "Fabrication" },
  { key: "finishing", label: "Finishing" },
  { key: "delivery", label: "Delivery" },
];

export default function ClientPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [project, setProject] = useState<CustomWork | null>(null);
  const [files, setFiles] = useState<BuildFile[]>([]);
  const [comments, setComments] = useState<BuildComment[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isChangeRequest, setIsChangeRequest] = useState(false);

  const load = useCallback(async () => {
    const { data } = await axiom.from("custom_work").select("*").eq("portal_token", token).eq("portal_enabled", true).single();
    if (!data) { setNotFound(true); return; }
    setProject(data);

    const [f, c, a] = await Promise.all([
      axiom.from("build_files").select("*").eq("custom_work_id", data.id).order("created_at"),
      axiom.from("build_comments").select("*").eq("custom_work_id", data.id).order("created_at", { ascending: false }),
      axiom.from("approval_requests").select("*").eq("custom_work_id", data.id).order("created_at", { ascending: false }),
    ]);
    if (f.data) setFiles(f.data);
    if (c.data) setComments(c.data);
    if (a.data) setApprovals(a.data);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function submitComment() {
    if (!newComment.trim() || !project) return;
    await axiom.from("build_comments").insert({
      custom_work_id: project.id,
      author: project.client_name || "Client",
      body: newComment.trim(),
      is_change_request: isChangeRequest,
    });
    setNewComment("");
    setIsChangeRequest(false);
    notifyPortal({
      event: "client_comment",
      project_name: project.project_name,
      from_name: project.client_name || "Client",
      portal_url: window.location.href,
      message: newComment.trim(),
    });
    load();
  }

  async function respondToApproval(id: string, status: "approved" | "rejected", notes?: string) {
    await axiom.from("approval_requests").update({
      status,
      client_notes: notes,
      responded_at: new Date().toISOString(),
    }).eq("id", id);
    notifyPortal({
      event: "approval_response",
      project_name: project?.project_name || "Project",
      from_name: project?.client_name || "Client",
      portal_url: window.location.href,
      message: notes,
      extra: status === "approved" ? "✅ Approved" : "🔄 Changes Requested",
    });
    load();
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Image src="/logo-emblem.png" alt="Relic" width={48} height={48} className="h-12 w-12 mx-auto mb-4" />
          <h1 className="text-xl font-heading font-bold mb-2">Project Not Found</h1>
          <p className="text-muted text-sm">This portal link is invalid or has been disabled.</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted animate-pulse">Loading...</p></div>;
  }

  const currentStageIndex = STAGES.findIndex((s) => s.key === project.portal_stage);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Image src="/logo-emblem.png" alt="Relic" width={32} height={32} className="h-8 w-8" />
          <div>
            <h1 className="font-heading font-bold tracking-widest text-sm">R&ensp;E&ensp;L&ensp;I&ensp;C</h1>
            <p className="text-xs text-muted">Client Portal</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-heading font-bold mb-1">{project.project_name}</h2>
          <p className="text-muted">Welcome, {project.client_name?.split(" ")[0] || "Client"}</p>
        </div>

        {/* Stage progress */}
        <div className="bg-card border border-border p-6 mb-8">
          <h3 className="text-xs uppercase tracking-wider text-muted mb-4">Project Progress</h3>
          <div className="flex items-center gap-1">
            {STAGES.map((stage, i) => {
              const completed = i < currentStageIndex;
              const current = i === currentStageIndex;
              return (
                <div key={stage.key} className="flex-1 flex flex-col items-center">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs mb-2 border-2",
                      completed && "bg-accent border-accent text-background",
                      current && "border-accent text-accent",
                      !completed && !current && "border-border text-muted/30"
                    )}
                  >
                    {completed ? <Check size={14} /> : i + 1}
                  </div>
                  <p className={cn("text-[10px] text-center", current ? "text-accent font-medium" : "text-muted")}>{stage.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Approval requests */}
            {approvals.filter((a) => a.status === "pending").length > 0 && (
              <div className="bg-accent/10 border border-accent/30 p-6">
                <h3 className="text-sm uppercase tracking-wider text-accent mb-3">Approval Required</h3>
                {approvals.filter((a) => a.status === "pending").map((a) => (
                  <div key={a.id} className="mb-6">
                    <p className="text-sm mb-3">{a.description}</p>
                    {a.images && (a.images as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(a.images as string[]).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt="" className="h-32 w-32 object-cover border border-accent/30 rounded hover:border-accent transition-colors" />
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3">
                      <Button size="sm" onClick={() => respondToApproval(a.id, "approved")}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        const notes = prompt("Reason for declining (optional):");
                        respondToApproval(a.id, "rejected", notes || undefined);
                      }}>Request Changes</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Files */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-muted mb-3">Drawings & Files</h3>
              {files.length === 0 ? (
                <p className="text-muted text-sm bg-card border border-border p-4">No files uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {files.map((f) => (
                    <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer" className="bg-card border border-border p-3 hover:border-accent transition-colors">
                      <p className="text-sm font-medium truncate">{f.file_name || "File"}</p>
                      <p className="text-xs text-muted">{f.label || f.file_type || ""}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Comments */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-muted mb-3">
                <MessageSquare size={12} className="inline mr-1" /> Notes & Comments
              </h3>
              <div className="space-y-2 mb-4">
                {comments.map((c) => (
                  <div key={c.id} className={cn("border p-3 text-sm", c.is_change_request ? "bg-amber-500/5 border-amber-500/30" : "bg-card border-border")}>
                    {c.is_change_request && <span className="text-[10px] uppercase tracking-wider text-amber-500 block mb-1">Change Request</span>}
                    {c.body.trim() && <p>{c.body}</p>}
                    {c.image_url && (
                      <a href={c.image_url} target="_blank" rel="noopener noreferrer" className="block mt-2">
                        <img src={c.image_url} alt="Attachment" className="max-h-48 max-w-full object-contain border border-border rounded" />
                      </a>
                    )}
                    <p className="text-xs text-muted mt-1">{c.author} &middot; {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
                {comments.length === 0 && <p className="text-muted text-sm">No comments yet.</p>}
              </div>
              <div className="space-y-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Leave a comment or note..."
                  className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[80px] resize-y"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                    <input type="checkbox" checked={isChangeRequest} onChange={(e) => setIsChangeRequest(e.target.checked)} className="accent-accent" />
                    Mark as change request
                  </label>
                  <Button size="sm" onClick={submitComment} disabled={!newComment.trim()}>Submit</Button>
                </div>
              </div>
            </div>

            {/* Approval history */}
            {approvals.filter((a) => a.status !== "pending").length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted mb-3">Approval History</h3>
                <div className="space-y-2">
                  {approvals.filter((a) => a.status !== "pending").map((a) => (
                    <div key={a.id} className="bg-card border border-border p-3 text-sm flex justify-between">
                      <div>
                        <p>{a.description}</p>
                        {a.client_notes && <p className="text-xs text-muted mt-1">Note: {a.client_notes}</p>}
                      </div>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full self-start", a.status === "approved" ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500")}>
                        {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-card border border-border p-5">
              <h3 className="text-xs uppercase tracking-wider text-muted mb-3">Project Details</h3>
              <div className="space-y-3 text-sm">
                <div><span className="text-muted block text-xs">Client</span>{project.client_name}</div>
                {project.company_name && <div><span className="text-muted block text-xs">Company</span>{project.company_name}</div>}
                {project.budget_range && <div><span className="text-muted block text-xs">Budget</span>{project.budget_range}</div>}
                {project.timeline && <div><span className="text-muted block text-xs">Timeline</span>{project.timeline}</div>}
                {project.due_date && <div><span className="text-muted block text-xs">Due Date</span>{project.due_date}</div>}
              </div>
            </div>
            {project.project_description && (
              <div className="bg-card border border-border p-5">
                <h3 className="text-xs uppercase tracking-wider text-muted mb-3">Description</h3>
                <p className="text-sm text-muted leading-relaxed">{project.project_description}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 mt-12">
        <p className="text-center text-xs text-muted">R&ensp;E&ensp;L&ensp;I&ensp;C &middot; Custom Fabrications &middot; (402) 235-8179</p>
      </footer>
    </div>
  );
}
