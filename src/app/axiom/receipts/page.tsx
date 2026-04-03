"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { CustomWork } from "@/types/axiom";
import { Camera, ExternalLink, Trash2, ShoppingCart, Search, X } from "lucide-react";
import AddToPOModal, { AddToPOItem } from "@/components/ui/AddToPOModal";

interface LineItem {
  description: string;
  qty: number;
  unit_price: number;
  total: number;
}

interface ReceiptRecord {
  id: string;
  image_url?: string;
  vendor?: string;
  receipt_date?: string;
  total?: number;
  line_items: LineItem[];
  project_id?: string;
  project_name?: string;
  notes?: string;
  submitted_by?: string;
  created_at: string;
}

const money = (n: number) => `$${(n || 0).toFixed(2)}`;

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addingTo, setAddingTo] = useState<Record<string, "materials" | "labor" | "done">>({});
  const [poItem, setPoItem] = useState<AddToPOItem | null>(null);

  const load = useCallback(async () => {
    const [{ data: rec }, { data: pw }] = await Promise.all([
      axiom.from("receipts").select("*").order("created_at", { ascending: false }),
      axiom.from("custom_work").select("id,project_name").order("project_name"),
    ]);
    if (rec) setReceipts(rec as ReceiptRecord[]);
    if (pw) setProjects(pw as CustomWork[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addToProject(r: ReceiptRecord, type: "materials" | "labor") {
    if (!r.project_id) return;
    setAddingTo((prev) => ({ ...prev, [r.id + type]: type }));
    const { data: project } = await axiom.from("custom_work").select("materials,labor_log").eq("id", r.project_id).single();
    if (!project) { setAddingTo((prev) => ({ ...prev, [r.id + type]: "done" })); return; }
    const date = r.receipt_date || new Date().toISOString().split("T")[0];
    if (type === "materials") {
      const updated = [...(project.materials || []), { description: r.vendor || "Receipt", vendor: r.vendor || "", cost: r.total || 0, receipt_id: r.id }];
      await axiom.from("custom_work").update({ materials: updated }).eq("id", r.project_id);
    } else {
      const updated = [...(project.labor_log || []), { date, description: r.vendor || "Receipt", hours: 0, rate: 0, cost: r.total || 0 }];
      await axiom.from("custom_work").update({ labor_log: updated }).eq("id", r.project_id);
    }
    setAddingTo((prev) => ({ ...prev, [r.id + type]: "done" }));
  }

  async function linkProject(r: ReceiptRecord, projectId: string) {
    const proj = projects.find((p) => p.id === projectId);
    await axiom.from("receipts").update({ project_id: projectId || null, project_name: proj?.project_name || null }).eq("id", r.id);
    setReceipts((prev) => prev.map((x) => x.id === r.id ? { ...x, project_id: projectId, project_name: proj?.project_name } : x));
  }

  const filtered = receipts.filter((r) => {
    if (filterProject && r.project_id !== filterProject) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.vendor || "").toLowerCase().includes(q) || (r.project_name || "").toLowerCase().includes(q) || (r.submitted_by || "").toLowerCase().includes(q);
    }
    return true;
  });

  const total = filtered.reduce((s, r) => s + (r.total || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Receipts</h1>
          <p className="text-muted text-sm mt-0.5">{filtered.length} receipt{filtered.length !== 1 ? "s" : ""} · {money(total)} total</p>
        </div>
        <a
          href="/receipts"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-accent text-background px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Camera size={14} />
          Receipt App
          <ExternalLink size={12} className="opacity-60" />
        </a>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor, project, person…"
            className="w-full bg-card border border-border pl-8 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent min-w-40"
        >
          <option value="">All Projects</option>
          <option value="__none__">No Project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
        </select>
      </div>

      {/* Receipt list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">
          {receipts.length === 0 ? (
            <>
              <Camera size={32} className="mx-auto mb-3 opacity-30" />
              <p>No receipts yet.</p>
              <p className="mt-1 text-xs">Use the <a href="/receipts" target="_blank" className="text-accent underline">Receipt App</a> on your phone to add receipts.</p>
            </>
          ) : "No receipts match your filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const isOpen = expanded[r.id];
            return (
              <div key={r.id} className="bg-card border border-border">
                {/* Row header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-background/50 transition-colors"
                  onClick={() => setExpanded((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                >
                  {r.image_url ? (
                    <img src={r.image_url} alt="" className="w-10 h-10 object-cover border border-border rounded shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-border/20 border border-border rounded shrink-0 flex items-center justify-center">
                      <Camera size={14} className="text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.vendor || "Unknown vendor"}</p>
                    <p className="text-xs text-muted">
                      {r.receipt_date ? new Date(r.receipt_date + "T12:00:00").toLocaleDateString() : new Date(r.created_at).toLocaleDateString()}
                      {r.project_name && <span> · {r.project_name}</span>}
                      {r.submitted_by && <span className="text-muted/60"> · {r.submitted_by}</span>}
                    </p>
                  </div>
                  <p className="text-sm font-mono font-medium shrink-0">{money(r.total || 0)}</p>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    {/* Image full view */}
                    {r.image_url && (
                      <a href={r.image_url} target="_blank" rel="noopener noreferrer">
                        <img src={r.image_url} alt="" className="max-h-48 object-contain border border-border rounded" />
                      </a>
                    )}

                    {/* Line items */}
                    {r.line_items?.length > 0 && (
                      <div className="space-y-1">
                        {r.line_items.map((li, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="flex-1 text-muted">{li.description}</span>
                            <span className="font-mono text-muted shrink-0">{money(li.total)}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setPoItem({ description: li.description, qty: li.qty, unit_price: li.unit_price, vendor_name: r.vendor }); }}
                              className="text-muted hover:text-accent transition-colors shrink-0" title="Add to P.O."
                            >
                              <ShoppingCart size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {r.notes && <p className="text-xs text-muted italic">{r.notes}</p>}

                    {/* Project link */}
                    <div className="flex items-center gap-2">
                      <select
                        value={r.project_id || ""}
                        onChange={(e) => linkProject(r, e.target.value)}
                        className="flex-1 bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
                      >
                        <option value="">— No project —</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                      </select>
                    </div>

                    {/* Add to project */}
                    {r.project_id && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => addToProject(r, "materials")}
                          disabled={addingTo[r.id + "materials"] !== undefined}
                          className="text-xs px-3 py-1.5 border border-border hover:border-accent hover:text-accent text-muted transition-colors disabled:opacity-50"
                        >
                          {addingTo[r.id + "materials"] === "done" ? "✓ Added to Materials" : "+ Add to Materials"}
                        </button>
                        <button
                          onClick={() => addToProject(r, "labor")}
                          disabled={addingTo[r.id + "labor"] !== undefined}
                          className="text-xs px-3 py-1.5 border border-border hover:border-accent hover:text-accent text-muted transition-colors disabled:opacity-50"
                        >
                          {addingTo[r.id + "labor"] === "done" ? "✓ Added to Labor" : "+ Add to Labor"}
                        </button>
                      </div>
                    )}

                    {/* Delete */}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm("Delete this receipt?")) return;
                          await axiom.from("receipts").delete().eq("id", r.id);
                          setReceipts((prev) => prev.filter((x) => x.id !== r.id));
                        }}
                        className="flex items-center gap-1.5 text-xs text-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {poItem && <AddToPOModal item={poItem} onClose={() => setPoItem(null)} onAdded={() => setPoItem(null)} />}
    </div>
  );
}
