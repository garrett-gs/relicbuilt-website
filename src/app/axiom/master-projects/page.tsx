"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { useEntity } from "@/components/axiom/EntityProvider";
import { MasterProject, Estimate, CustomWork, Customer } from "@/types/axiom";
import { formatDate, cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { Plus, X, Trash2, Search, Layers, ChevronDown, ChevronRight, Pencil, CalendarDays, DollarSign, ListChecks } from "lucide-react";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

function estimateTotal(e: Estimate) {
  const material = (e.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const labor = (e.labor_items || []).reduce((s, l) => s + (l.cost || 0), 0);
  const subtotal = material + labor;
  return subtotal + subtotal * ((e.markup_percent || 0) / 100);
}

/** min start → max due across a set of dated items. */
function combinedWindow(items: { start_date?: string; due_date?: string }[]): string {
  const starts = items.map((i) => i.start_date).filter(Boolean) as string[];
  const dues = items.map((i) => i.due_date).filter(Boolean) as string[];
  const all = [...starts, ...dues];
  if (all.length === 0) return "No dates set";
  const min = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : all.reduce((a, b) => (a < b ? a : b));
  const max = dues.length ? dues.reduce((a, b) => (a > b ? a : b)) : all.reduce((a, b) => (a > b ? a : b));
  return min === max ? formatDate(min) : `${formatDate(min)} – ${formatDate(max)}`;
}

export default function MasterProjectsPage() {
  const { userEmail } = useAuth();
  const { entity } = useEntity();
  const [masters, setMasters] = useState<MasterProject[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [customers, setCustomers] = useState<Pick<Customer, "id" | "name">[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<MasterProject | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const loadMasters = useCallback(async () => {
    const { data } = await axiom.from("master_projects").select("*").eq("entity", entity).order("created_at", { ascending: false });
    if (data) setMasters(data);
  }, [entity]);
  const loadEstimates = useCallback(async () => {
    const { data } = await axiom.from("estimates").select("*").eq("entity", entity);
    if (data) setEstimates(data);
  }, [entity]);
  const loadProjects = useCallback(async () => {
    const { data } = await axiom.from("custom_work").select("*").eq("entity", entity);
    if (data) setProjects(data);
  }, [entity]);
  const loadCustomers = useCallback(async () => {
    const { data } = await axiom.from("customers").select("id, name").eq("entity", entity).order("name");
    if (data) setCustomers(data);
  }, [entity]);

  const reload = useCallback(() => { loadMasters(); loadEstimates(); loadProjects(); }, [loadMasters, loadEstimates, loadProjects]);

  useEffect(() => { loadMasters(); }, [loadMasters]);
  useEffect(() => { loadEstimates(); }, [loadEstimates]);
  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // Children of a master = estimates tagged to it, plus any tagged project that
  // has no estimate pointing at it (avoids double-counting approved estimates).
  const childrenOf = (id: string) => {
    const estChildren = estimates.filter((e) => e.master_project_id === id);
    const linkedCw = new Set(estChildren.map((e) => e.custom_work_id).filter(Boolean));
    const cwOrphans = projects.filter((p) => p.master_project_id === id && !linkedCw.has(p.id));
    return { estChildren, cwOrphans };
  };

  const cwById = (id?: string) => projects.find((p) => p.id === id);
  const childStatus = (e: Estimate) => {
    const cw = e.custom_work_id ? cwById(e.custom_work_id) : null;
    const raw = cw?.status || e.status || "draft";
    return { raw, label: raw.replace(/_/g, " "), done: raw === "complete" };
  };

  const unassignedEstimates = estimates.filter((e) => !e.master_project_id);

  const filtered = masters.filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.client_name || "").toLowerCase().includes(search.toLowerCase())
  );

  async function saveMaster(form: MasterFormValues, existing: MasterProject | null) {
    if (existing) {
      const { data } = await axiom.from("master_projects").update({
        name: form.name, client_name: form.client_name || null, customer_id: form.customer_id || null,
        site_address: form.site_address || null, description: form.description || null, updated_at: new Date().toISOString(),
      }).eq("id", existing.id).select().single();
      if (data) await logActivity({ action: "updated", entity: "master_project", entity_id: data.id, label: `Updated master project: ${data.name}`, user_name: userEmail });
    } else {
      const { data } = await axiom.from("master_projects").insert({
        entity, name: form.name, client_name: form.client_name || null, customer_id: form.customer_id || null,
        site_address: form.site_address || null, description: form.description || null,
      }).select().single();
      if (data) {
        await logActivity({ action: "created", entity: "master_project", entity_id: data.id, label: `Created master project: ${data.name}`, user_name: userEmail });
        setExpanded((x) => ({ ...x, [data.id]: true }));
      }
    }
    setShowCreate(false); setEditing(null); loadMasters();
  }

  async function deleteMaster(id: string) {
    if (!confirm("Delete this master project? The builds under it will NOT be deleted — they'll just become ungrouped.")) return;
    // Detach children first so nothing is left pointing at a deleted master.
    await axiom.from("estimates").update({ master_project_id: null }).eq("master_project_id", id);
    await axiom.from("custom_work").update({ master_project_id: null }).eq("master_project_id", id);
    await axiom.from("master_projects").delete().eq("id", id);
    setEditing(null); reload();
  }

  // Assign an estimate to a master; carry the tag onto its built project too.
  async function assignEstimate(masterId: string, estimateId: string) {
    const est = estimates.find((e) => e.id === estimateId);
    await axiom.from("estimates").update({ master_project_id: masterId }).eq("id", estimateId);
    if (est?.custom_work_id) await axiom.from("custom_work").update({ master_project_id: masterId }).eq("id", est.custom_work_id);
    setAddingTo(null); reload();
  }
  async function removeChild(estimateId: string) {
    const est = estimates.find((e) => e.id === estimateId);
    await axiom.from("estimates").update({ master_project_id: null }).eq("id", estimateId);
    if (est?.custom_work_id) await axiom.from("custom_work").update({ master_project_id: null }).eq("id", est.custom_work_id);
    reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-heading font-bold">Master Projects</h1>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} className="mr-1" /> New Master Project</Button>
      </div>
      <p className="text-sm text-muted mb-6">Group multiple estimates/builds under one parent — e.g. CHI Western over Bar, Back Bar, and Facades.</p>

      <div className="relative mb-6 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search master projects..." className="w-full bg-card border border-border pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
      </div>

      <div className="space-y-3">
        {filtered.map((m) => {
          const { estChildren, cwOrphans } = childrenOf(m.id);
          const total = estChildren.reduce((s, e) => s + estimateTotal(e), 0) + cwOrphans.reduce((s, p) => s + (p.quoted_amount || 0), 0);
          const windowStr = combinedWindow([...estChildren, ...cwOrphans]);
          const childCount = estChildren.length + cwOrphans.length;
          const doneCount = estChildren.filter((e) => childStatus(e).done).length + cwOrphans.filter((p) => p.status === "complete").length;
          const isOpen = expanded[m.id] ?? true;

          return (
            <div key={m.id} className="bg-card border border-border">
              {/* Master header */}
              <div className="p-4 flex items-start justify-between gap-3">
                <button onClick={() => setExpanded((x) => ({ ...x, [m.id]: !isOpen }))} className="flex items-start gap-2 text-left min-w-0 flex-1">
                  {isOpen ? <ChevronDown size={18} className="mt-0.5 shrink-0 text-muted" /> : <ChevronRight size={18} className="mt-0.5 shrink-0 text-muted" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers size={15} className="text-accent shrink-0" />
                      <p className="font-heading font-bold truncate">{m.name}</p>
                      <span className="text-[11px] text-muted">({childCount} {childCount === 1 ? "build" : "builds"})</span>
                    </div>
                    {(m.client_name || m.site_address) && (
                      <p className="text-xs text-muted mt-0.5 truncate">{[m.client_name, m.site_address].filter(Boolean).join(" · ")}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
                      <span className="inline-flex items-center gap-1 text-accent font-mono"><DollarSign size={12} />{money(total)}</span>
                      <span className="inline-flex items-center gap-1 text-muted"><CalendarDays size={12} />{windowStr}</span>
                      <span className="inline-flex items-center gap-1 text-muted"><ListChecks size={12} />{doneCount}/{childCount} complete</span>
                    </div>
                  </div>
                </button>
                <button onClick={() => setEditing(m)} className="text-muted hover:text-foreground shrink-0" title="Edit master project"><Pencil size={14} /></button>
              </div>

              {/* Children */}
              {isOpen && (
                <div className="border-t border-border">
                  {childCount === 0 && <p className="px-4 py-3 text-xs text-muted">No builds yet — add one below.</p>}
                  {estChildren.map((e) => {
                    const st = childStatus(e);
                    return (
                      <div key={e.id} className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-border/60 last:border-b-0">
                        <div className="min-w-0">
                          <p className="text-sm truncate">{e.project_name || e.estimate_number}</p>
                          <p className="text-[11px] text-muted font-mono">{e.estimate_number}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] uppercase tracking-wider text-muted border border-border px-1.5 py-0.5">{st.label}</span>
                          <span className="text-xs font-mono text-accent">{money(estimateTotal(e))}</span>
                          <button onClick={() => removeChild(e.id)} className="text-muted hover:text-red-500" title="Remove from master"><X size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                  {cwOrphans.map((p) => (
                    <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-border/60 last:border-b-0">
                      <div className="min-w-0"><p className="text-sm truncate">{p.project_name}</p><p className="text-[11px] text-muted">Project</p></div>
                      <span className="text-xs font-mono text-accent shrink-0">{money(p.quoted_amount || 0)}</span>
                    </div>
                  ))}

                  {/* Add build */}
                  <div className="px-4 py-3">
                    {addingTo === m.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          autoFocus
                          onChange={(e) => e.target.value && assignEstimate(m.id, e.target.value)}
                          defaultValue=""
                          className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                        >
                          <option value="" disabled>Select an estimate to add…</option>
                          {unassignedEstimates.length === 0 && <option value="" disabled>No unassigned estimates</option>}
                          {unassignedEstimates.map((e) => (
                            <option key={e.id} value={e.id}>{(e.project_name || e.estimate_number)} · {e.estimate_number} · {money(estimateTotal(e))}</option>
                          ))}
                        </select>
                        <button onClick={() => setAddingTo(null)} className="text-muted hover:text-foreground"><X size={16} /></button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingTo(m.id)} className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"><Plus size={13} /> Add build</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted">
            <Layers size={28} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">{search ? "No master projects match your search" : "No master projects yet — create one to group your builds"}</p>
          </div>
        )}
      </div>

      {(showCreate || editing) && (
        <MasterModal master={editing} customers={customers} onClose={() => { setShowCreate(false); setEditing(null); }} onSave={saveMaster} onDelete={deleteMaster} />
      )}
    </div>
  );
}

interface MasterFormValues { name: string; client_name: string; customer_id: string; site_address: string; description: string; }

function MasterModal({ master, customers, onClose, onSave, onDelete }: {
  master: MasterProject | null;
  customers: Pick<Customer, "id" | "name">[];
  onClose: () => void;
  onSave: (f: MasterFormValues, existing: MasterProject | null) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState<MasterFormValues>({
    name: master?.name || "", client_name: master?.client_name || "", customer_id: master?.customer_id || "",
    site_address: master?.site_address || "", description: master?.description || "",
  });
  const set = <K extends keyof MasterFormValues>(k: K, v: MasterFormValues[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[90vh] overflow-y-auto bg-background border border-border p-6 z-50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-bold">{master ? "Edit Master Project" : "New Master Project"}</h2>
          <button onClick={onClose} className="text-muted"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Name *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. CHI Western" className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Client</label>
            <select value={form.customer_id} onChange={(e) => { const c = customers.find((x) => x.id === e.target.value); set("customer_id", e.target.value); if (c) set("client_name", c.name); }} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent">
              <option value="">— Select a client —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Job-Site Address</label>
            <input value={form.site_address} onChange={(e) => set("site_address", e.target.value)} placeholder="Shared across all builds" className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Notes</label>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent resize-y" />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => onSave(form, master)} disabled={!form.name}>{master ? "Save" : "Create"}</Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {master && <button onClick={() => onDelete(master.id)} className="ml-auto text-muted hover:text-red-500" title="Delete master project"><Trash2 size={16} /></button>}
          </div>
        </div>
      </div>
    </>
  );
}
