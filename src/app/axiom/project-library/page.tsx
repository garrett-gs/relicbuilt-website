"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { useEntity } from "@/components/axiom/EntityProvider";
import { CustomWork, Estimate, BuildFile } from "@/types/axiom";
import { formatDate, cn } from "@/lib/utils";
import FileUpload from "@/components/ui/FileUpload";
import ImageUpload from "@/components/ui/ImageUpload";
import Link from "next/link";
import {
  Library, Search, ChevronDown, ChevronRight, FileText, ExternalLink,
  TrendingDown, TrendingUp, Minus, Link2, Save, Trash2,
} from "lucide-react";

// Whole-dollar + penny-precise currency. Materials/labor are penny-precise in
// the P&L, so default to money2 there.
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
const money2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

type ExpenseLite = { amount?: number | null; category?: string | null; custom_work_id?: string | null };

// ── Cost math (mirrors master-projects pnlOf, scoped to a single build) ──────

/** Estimated cost from the estimate(s) tagged to this build. Pre-markup — this
 *  is what we thought it would COST, not what we quoted. */
function estimatedCost(projectId: string, estimates: Estimate[]) {
  const linked = estimates.filter((e) => e.custom_work_id === projectId);
  const materials = linked.reduce(
    (s, e) => s + (e.line_items || []).reduce((a, li) => a + (li.quantity || 0) * (li.unit_price || 0), 0), 0);
  const labor = linked.reduce(
    (s, e) => s + (e.labor_items || []).reduce((a, l) => a + (l.cost || 0), 0), 0);
  return { materials, labor, total: materials + labor, hasEstimate: linked.length > 0 };
}

/** Actual cost pulled from the three places costs actually live:
 *   materials — project.materials[] + non-Labor expenses
 *   labor     — project.labor_log[] + Labor-category expenses  */
function actualCost(p: CustomWork, expenses: ExpenseLite[]) {
  const mine = expenses.filter((x) => x.custom_work_id === p.id);
  const matFromProject = (p.materials || []).reduce((s, m) => s + (m.cost || 0), 0);
  const matFromExpenses = mine.filter((x) => (x.category || "").toLowerCase() !== "labor").reduce((s, x) => s + (x.amount || 0), 0);
  const laborFromLog = (p.labor_log || []).reduce((s, l) => s + (l.cost || 0), 0);
  const laborFromExpenses = mine.filter((x) => (x.category || "").toLowerCase() === "labor").reduce((s, x) => s + (x.amount || 0), 0);
  const materials = matFromProject + matFromExpenses;
  const labor = laborFromLog + laborFromExpenses;
  return { materials, labor, total: materials + labor };
}

export default function ProjectLibraryPage() {
  const { userEmail } = useAuth();
  const { entity } = useEntity();
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [expenses, setExpenses] = useState<ExpenseLite[]>([]);
  const [files, setFiles] = useState<BuildFile[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: cw }, { data: est }, { data: exp }] = await Promise.all([
      axiom.from("custom_work").select("*").eq("entity", entity).order("updated_at", { ascending: false }),
      axiom.from("estimates").select("*").eq("entity", entity),
      axiom.from("expenses").select("amount, category, custom_work_id").eq("entity", entity),
    ]);
    const allProjects = cw || [];
    setProjects(allProjects);
    setEstimates(est || []);
    setExpenses(exp || []);
    // Documents for completed builds only — keyed by custom_work_id.
    const completeIds = allProjects.filter((p) => p.status === "complete").map((p) => p.id);
    if (completeIds.length) {
      const { data: bf } = await axiom.from("build_files").select("*").in("custom_work_id", completeIds);
      setFiles(bf || []);
    } else {
      setFiles([]);
    }
    setLoading(false);
  }, [entity]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const completed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .filter((p) => p.status === "complete")
      .filter((p) => !q || [p.project_name, p.client_name, p.company_name].some((f) => (f || "").toLowerCase().includes(q)));
  }, [projects, search]);

  const nameById = useCallback((id?: string) => projects.find((p) => p.id === id)?.project_name || "", [projects]);

  // Walk the previous_build_id chain this project belongs to, oldest → newest.
  const chainFor = useCallback((p: CustomWork): CustomWork[] => {
    const byId = new Map(projects.map((x) => [x.id, x]));
    // Walk back to the root.
    let root = p;
    const seen = new Set<string>([p.id]);
    while (root.previous_build_id && byId.has(root.previous_build_id) && !seen.has(root.previous_build_id)) {
      root = byId.get(root.previous_build_id)!;
      seen.add(root.id);
    }
    // Walk forward collecting successors.
    const chain: CustomWork[] = [root];
    let cur = root;
    const guard = new Set<string>([root.id]);
    for (;;) {
      const next = projects.find((x) => x.previous_build_id === cur.id && !guard.has(x.id));
      if (!next) break;
      chain.push(next);
      guard.add(next.id);
      cur = next;
    }
    return chain;
  }, [projects]);

  async function savePostmortem(id: string, text: string) {
    await axiom.from("custom_work").update({ postmortem: text, updated_at: new Date().toISOString() }).eq("id", id);
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, postmortem: text } : p)));
    await logActivity({ action: "updated", entity: "project", entity_id: id, label: `Postmortem updated on ${nameById(id)}`, user_name: userEmail });
  }

  async function savePreviousBuild(id: string, prevId: string) {
    const value = prevId || undefined;
    await axiom.from("custom_work").update({ previous_build_id: value || null, updated_at: new Date().toISOString() }).eq("id", id);
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, previous_build_id: value } : p)));
  }

  async function attachDocument(projectId: string, file: { url: string; name: string; type: string; size: number }) {
    const { data, error } = await axiom.from("build_files").insert({
      custom_work_id: projectId,
      file_url: file.url,
      file_name: file.name,
      file_type: file.type,
      label: "Project Document",
      uploaded_by: userEmail,
    }).select().single();
    if (error) { alert(`Could not attach document: ${error.message}`); return; }
    if (data) setFiles((prev) => [data as BuildFile, ...prev]);
    await logActivity({ action: "updated", entity: "project", entity_id: projectId, label: `Attached document "${file.name}" to ${nameById(projectId)}`, user_name: userEmail });
  }

  async function deleteDocument(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await axiom.from("build_files").delete().eq("id", id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function attachPhoto(projectId: string, url: string) {
    const ext = (url.split(".").pop() || "").toLowerCase().split(/[?#]/)[0];
    const mime = ext ? `image/${ext === "jpg" ? "jpeg" : ext}` : "image/jpeg";
    const { data, error } = await axiom.from("build_files").insert({
      custom_work_id: projectId,
      file_url: url,
      file_name: "Project Photo",
      file_type: mime,
      label: "Project Photo",
      uploaded_by: userEmail,
    }).select().single();
    if (error) { alert(`Could not add photo: ${error.message}`); return; }
    if (data) setFiles((prev) => [data as BuildFile, ...prev]);
    await logActivity({ action: "updated", entity: "project", entity_id: projectId, label: `Added a photo to ${nameById(projectId)}`, user_name: userEmail });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Library size={22} className="text-accent" />
        <h1 className="text-2xl font-bold">Project Library</h1>
      </div>
      <p className="text-sm text-muted mb-6">
        Completed builds with an estimated-vs-actual postmortem. Link a rebuild to its predecessor to see how it changed over time.
      </p>

      <div className="relative mb-5 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by project, client…"
          className="w-full bg-card border border-border pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : completed.length === 0 ? (
        <div className="border border-border bg-card p-8 text-center">
          <Library size={28} className="text-muted mx-auto mb-3" />
          <p className="text-sm text-muted">
            No completed projects yet. Mark a project <span className="text-foreground font-medium">Complete</span> on the
            {" "}<Link href="/axiom/projects" className="text-accent hover:underline">Projects</Link> board and it lands here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {completed.map((p) => (
            <LibraryCard
              key={p.id}
              project={p}
              estimates={estimates}
              expenses={expenses}
              files={files.filter((f) => f.custom_work_id === p.id)}
              chain={chainFor(p)}
              expanded={!!expanded[p.id]}
              onToggle={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
              candidates={projects.filter((x) => x.id !== p.id)}
              nameById={nameById}
              onSavePostmortem={savePostmortem}
              onSavePreviousBuild={savePreviousBuild}
              onAttachDocument={attachDocument}
              onDeleteDocument={deleteDocument}
              onAttachPhoto={attachPhoto}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── One completed project ────────────────────────────────────────────────────

function LibraryCard({
  project: p, estimates, expenses, files, chain, expanded, onToggle,
  candidates, nameById, onSavePostmortem, onSavePreviousBuild, onAttachDocument, onDeleteDocument, onAttachPhoto,
}: {
  project: CustomWork;
  estimates: Estimate[];
  expenses: ExpenseLite[];
  files: BuildFile[];
  chain: CustomWork[];
  expanded: boolean;
  onToggle: () => void;
  candidates: CustomWork[];
  nameById: (id?: string) => string;
  onSavePostmortem: (id: string, text: string) => Promise<void>;
  onSavePreviousBuild: (id: string, prevId: string) => Promise<void>;
  onAttachDocument: (projectId: string, file: { url: string; name: string; type: string; size: number }) => Promise<void>;
  onDeleteDocument: (id: string, name: string) => Promise<void>;
  onAttachPhoto: (projectId: string, url: string) => Promise<void>;
}) {
  const est = estimatedCost(p.id, estimates);
  const act = actualCost(p, expenses);
  const revenue = p.quoted_amount || 0;
  const profit = revenue - act.total;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const [notes, setNotes] = useState(p.postmortem || "");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  useEffect(() => { setNotes(p.postmortem || ""); }, [p.postmortem]);

  async function handleSaveNote() {
    setSavingNote(true); setNoteSaved(false);
    await onSavePostmortem(p.id, notes);
    setSavingNote(false); setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  const partOfChain = chain.length > 1;

  return (
    <div className="border border-border bg-card">
      {/* Header row */}
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-background/40">
        {expanded ? <ChevronDown size={16} className="text-muted shrink-0" /> : <ChevronRight size={16} className="text-muted shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{p.project_name}</span>
            {partOfChain && (
              <span className="text-[10px] uppercase tracking-wider text-accent border border-accent/40 px-1.5 py-0.5 rounded-sm shrink-0">
                Build {chain.findIndex((c) => c.id === p.id) + 1} of {chain.length}
              </span>
            )}
          </div>
          <span className="text-xs text-muted">
            {p.client_name || p.company_name || "—"}
            {p.due_date ? ` · ${formatDate(p.due_date)}` : p.updated_at ? ` · ${formatDate(p.updated_at)}` : ""}
            {p.unit_count ? ` · ${p.unit_count} unit${p.unit_count === 1 ? "" : "s"}` : ""}
          </span>
        </div>
        {/* Quick stat: total actual + margin */}
        <div className="text-right shrink-0">
          <div className="font-mono text-sm">{money(act.total)}</div>
          <VarianceBadge est={est.total} act={act.total} hasEstimate={est.hasEstimate} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-5">
          {/* P&L: estimated vs actual */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted border-l-2 border-accent pl-2 mb-2 mt-3">
              Estimated vs Actual
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted border-b border-border">
                    <th className="text-left py-1.5 font-medium"></th>
                    <th className="text-right py-1.5 font-medium w-28">Estimated</th>
                    <th className="text-right py-1.5 font-medium w-28">Actual</th>
                    <th className="text-right py-1.5 font-medium w-32">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  <PnlRow label="Materials" est={est.materials} act={act.materials} hasEstimate={est.hasEstimate} />
                  <PnlRow label="Labor" est={est.labor} act={act.labor} hasEstimate={est.hasEstimate} />
                  <tr className="border-t border-border font-bold">
                    <td className="py-2">Total Cost</td>
                    <td className="py-2 text-right font-mono">{est.hasEstimate ? money2(est.total) : "—"}</td>
                    <td className="py-2 text-right font-mono">{money2(act.total)}</td>
                    <td className="py-2 text-right"><VarianceCell est={est.total} act={act.total} hasEstimate={est.hasEstimate} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Revenue / profit */}
            <div className="flex flex-wrap gap-x-8 gap-y-1 mt-3 pt-3 border-t border-border text-sm">
              <span className="text-muted">Quoted <span className="font-mono text-foreground ml-1">{money2(revenue)}</span></span>
              <span className="text-muted">Profit <span className={cn("font-mono ml-1", profit >= 0 ? "text-green-500" : "text-red-500")}>{money2(profit)}</span></span>
              <span className="text-muted">Margin <span className={cn("font-mono ml-1", margin >= 0 ? "text-green-500" : "text-red-500")}>{margin.toFixed(1)}%</span></span>
            </div>
            {!est.hasEstimate && (
              <p className="text-xs text-muted italic mt-2">No estimate linked to this build — estimated figures unavailable.</p>
            )}
          </div>

          {/* Iteration comparison */}
          {partOfChain && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted border-l-2 border-accent pl-2 mb-2">
                Across Builds
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-muted border-b border-border">
                      <th className="text-left py-1.5 font-medium">Build</th>
                      <th className="text-right py-1.5 font-medium">Materials</th>
                      <th className="text-right py-1.5 font-medium">Labor</th>
                      <th className="text-right py-1.5 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chain.map((c, i) => {
                      const ca = actualCost(c, expenses);
                      const isThis = c.id === p.id;
                      return (
                        <tr key={c.id} className={cn("border-b border-border/40", isThis && "bg-accent/5")}>
                          <td className="py-1.5">
                            <span className="text-muted mr-1.5">#{i + 1}</span>
                            {isThis ? <span className="font-semibold">{c.project_name}</span> : (
                              <span>{c.project_name}</span>
                            )}
                            {c.due_date && <span className="text-xs text-muted ml-1.5">{formatDate(c.due_date)}</span>}
                          </td>
                          <td className="py-1.5 text-right font-mono">{money2(ca.materials)}</td>
                          <td className="py-1.5 text-right font-mono">{money2(ca.labor)}</td>
                          <td className="py-1.5 text-right font-mono font-semibold">{money2(ca.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted mt-1.5">Actual costs, oldest build first — watch materials and labor move as you refine the build.</p>
            </div>
          )}

          {/* Photos */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted border-l-2 border-accent pl-2 mb-2">
              Photos
            </h3>
            {files.filter((f) => (f.file_type || "").startsWith("image/")).length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-3">
                {files.filter((f) => (f.file_type || "").startsWith("image/")).map((f) => (
                  <div key={f.id} className="relative group aspect-square">
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.file_url} alt={f.file_name || "Project photo"} className="w-full h-full object-cover border border-border" />
                    </a>
                    <button onClick={() => onDeleteDocument(f.id, f.file_name || "Photo")}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-red-600" title="Delete photo">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <ImageUpload onUploaded={(url) => onAttachPhoto(p.id, url)} label="Add Photo" />
          </div>

          {/* Documents */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted border-l-2 border-accent pl-2 mb-2">
              Documents
            </h3>
            {files.filter((f) => !(f.file_type || "").startsWith("image/")).length === 0 ? (
              <p className="text-xs text-muted italic mb-2">No documents attached yet.</p>
            ) : (
              <div className="space-y-1 mb-2">
                {files.filter((f) => !(f.file_type || "").startsWith("image/")).map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-sm group">
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-foreground hover:text-accent flex-1 min-w-0">
                      <FileText size={14} className="text-muted group-hover:text-accent shrink-0" />
                      <span className="truncate">{f.file_name || "Document"}</span>
                      <ExternalLink size={12} className="text-muted opacity-0 group-hover:opacity-100 shrink-0" />
                    </a>
                    <button onClick={() => onDeleteDocument(f.id, f.file_name || "Document")}
                      className="text-muted hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100" title="Delete document">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <FileUpload onUploaded={(file) => onAttachDocument(p.id, file)} label="Add Document" />
          </div>

          {/* Link to previous build */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted border-l-2 border-accent pl-2 mb-2 flex items-center gap-1.5">
              <Link2 size={13} /> Iteration Of
            </h3>
            <select
              value={p.previous_build_id || ""}
              onChange={(e) => onSavePreviousBuild(p.id, e.target.value)}
              className="w-full max-w-md bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
            >
              <option value="">— Not a rebuild —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.project_name}{c.client_name ? ` · ${c.client_name}` : ""}</option>
              ))}
            </select>
            {p.previous_build_id && (
              <p className="text-xs text-muted mt-1.5">Previous build: <span className="text-foreground">{nameById(p.previous_build_id)}</span></p>
            )}
          </div>

          {/* Postmortem */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted border-l-2 border-accent pl-2 mb-2">
              Postmortem
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What changed this build? What worked, what to do differently next time, where the cost moved and why…"
              className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent resize-y"
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleSaveNote}
                disabled={savingNote || notes === (p.postmortem || "")}
                className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 text-sm rounded-sm disabled:opacity-50 hover:opacity-90"
              >
                <Save size={13} /> {savingNote ? "Saving…" : "Save Postmortem"}
              </button>
              {noteSaved && <span className="text-green-500 text-sm">Saved</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Variance helpers ─────────────────────────────────────────────────────────

function VarianceBadge({ est, act, hasEstimate }: { est: number; act: number; hasEstimate: boolean }) {
  if (!hasEstimate || est === 0) return <span className="text-[11px] text-muted">no estimate</span>;
  const diff = act - est;
  const pct = (diff / est) * 100;
  const over = diff > 0.005;
  const under = diff < -0.005;
  const Icon = over ? TrendingUp : under ? TrendingDown : Minus;
  return (
    <span className={cn("text-[11px] inline-flex items-center gap-0.5", over ? "text-red-500" : under ? "text-green-500" : "text-muted")}>
      <Icon size={11} /> {over ? "+" : ""}{pct.toFixed(0)}%
    </span>
  );
}

function VarianceCell({ est, act, hasEstimate }: { est: number; act: number; hasEstimate: boolean }) {
  if (!hasEstimate) return <span className="text-muted">—</span>;
  const diff = act - est;
  const pct = est !== 0 ? (diff / est) * 100 : 0;
  const over = diff > 0.005;
  const under = diff < -0.005;
  return (
    <span className={cn("font-mono", over ? "text-red-500" : under ? "text-green-500" : "text-muted")}>
      {over ? "+" : ""}{money2(diff)}{est !== 0 ? ` (${over ? "+" : ""}${pct.toFixed(0)}%)` : ""}
    </span>
  );
}

function PnlRow({ label, est, act, hasEstimate }: { label: string; est: number; act: number; hasEstimate: boolean }) {
  return (
    <tr className="border-b border-border/40">
      <td className="py-2 text-muted">{label}</td>
      <td className="py-2 text-right font-mono">{hasEstimate ? money2(est) : "—"}</td>
      <td className="py-2 text-right font-mono">{money2(act)}</td>
      <td className="py-2 text-right"><VarianceCell est={est} act={act} hasEstimate={hasEstimate} /></td>
    </tr>
  );
}
