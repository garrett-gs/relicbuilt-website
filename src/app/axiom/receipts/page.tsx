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

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("");
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

      {/* Receipt cards */}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((r) => (
            <div key={r.id} className="bg-card border border-border flex flex-col">

              {/* Receipt image */}
              {r.image_url ? (
                <a href={r.image_url} target="_blank" rel="noopener noreferrer" className="block shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.image_url} alt="" className="w-full h-40 object-cover border-b border-border hover:opacity-90 transition-opacity" />
                </a>
              ) : (
                <div className="w-full h-40 bg-border/10 border-b border-border flex items-center justify-center shrink-0">
                  <Camera size={28} className="text-muted/40" />
                </div>
              )}

              {/* Card body */}
              <div className="p-3 flex flex-col gap-2.5 flex-1">

                {/* Vendor + total */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug">{r.vendor || "Unknown vendor"}</p>
                  <p className="text-sm font-mono font-bold text-accent shrink-0">{money(r.total || 0)}</p>
                </div>

                {/* Date + submitted by */}
                <p className="text-xs text-muted">
                  {r.receipt_date ? new Date(r.receipt_date + "T12:00:00").toLocaleDateString() : new Date(r.created_at).toLocaleDateString()}
                  {r.submitted_by && <span className="text-muted/60"> · {r.submitted_by}</span>}
                </p>

                {/* Line items */}
                {r.line_items?.length > 0 && (
                  <div className="space-y-0.5 border-t border-border pt-2">
                    {r.line_items.map((li, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <span className="flex-1 text-muted truncate">{li.description}</span>
                        <span className="font-mono text-muted shrink-0">{money(li.total)}</span>
                        <button
                          onClick={() => setPoItem({ description: li.description, qty: li.qty, unit_price: li.unit_price, vendor_name: r.vendor })}
                          className="text-muted hover:text-accent transition-colors shrink-0" title="Add to P.O."
                        >
                          <ShoppingCart size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {r.notes && <p className="text-xs text-muted/60 italic">{r.notes}</p>}

                {/* Project dropdown */}
                <div className="mt-auto pt-2 border-t border-border space-y-2">
                  <select
                    value={r.project_id || ""}
                    onChange={(e) => linkProject(r, e.target.value)}
                    className="w-full bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
                  >
                    <option value="">— No project —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                  </select>

                  {/* Add to project buttons */}
                  {r.project_id && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => addToProject(r, "materials")}
                        disabled={addingTo[r.id + "materials"] !== undefined}
                        className="flex-1 text-[11px] py-1 border border-border hover:border-accent hover:text-accent text-muted transition-colors disabled:opacity-50"
                      >
                        {addingTo[r.id + "materials"] === "done" ? "✓ Materials" : "+ Materials"}
                      </button>
                      <button
                        onClick={() => addToProject(r, "labor")}
                        disabled={addingTo[r.id + "labor"] !== undefined}
                        className="flex-1 text-[11px] py-1 border border-border hover:border-accent hover:text-accent text-muted transition-colors disabled:opacity-50"
                      >
                        {addingTo[r.id + "labor"] === "done" ? "✓ Labor" : "+ Labor"}
                      </button>
                    </div>
                  )}

                  {/* Delete */}
                  <div className="flex justify-end">
                    <button
                      onClick={async () => {
                        if (!confirm("Delete this receipt?")) return;
                        await axiom.from("receipts").delete().eq("id", r.id);
                        setReceipts((prev) => prev.filter((x) => x.id !== r.id));
                      }}
                      className="flex items-center gap-1 text-[11px] text-muted hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {poItem && <AddToPOModal item={poItem} onClose={() => setPoItem(null)} onAdded={() => setPoItem(null)} />}
    </div>
  );
}
