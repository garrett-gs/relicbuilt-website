"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { CustomWork, Material, LaborEntry, Customer, Company } from "@/types/axiom";
import Button from "@/components/ui/Button";
import SaveButton from "@/components/ui/SaveButton";
import { cn } from "@/lib/utils";
import { X, Plus, Trash2, ExternalLink, Copy, FileText, Search, Printer, Send, CheckCircle, ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";
import { generateProposalHtml } from "@/lib/proposal-html";
import { Settings } from "@/types/axiom";

const STATUS_COLUMNS = [
  { key: "new", label: "New", color: "#4d9fff" },
  { key: "in_review", label: "In Review", color: "#f59e0b" },
  { key: "quoted", label: "Quoted", color: "#a78bfa" },
  { key: "in_progress", label: "In Progress", color: "#3b82f6" },
  { key: "complete", label: "Complete", color: "#22c55e" },
] as const;

const BUDGET_RANGES = [
  "Under $500", "$500 - $1,000", "$1,000 - $2,500", "$2,500 - $5,000",
  "$5,000 - $10,000", "$10,000 - $25,000", "$25,000+",
];

const PORTAL_STAGES = [
  { key: "consultation", label: "Consultation" },
  { key: "design", label: "Design & Drawings" },
  { key: "approval", label: "Client Approval" },
  { key: "fabrication", label: "Fabrication" },
  { key: "finishing", label: "Finishing" },
  { key: "delivery", label: "Delivery" },
];

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function ProjectsPage() {
  const { userEmail } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [selected, setSelected] = useState<CustomWork | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await axiom.from("custom_work").select("*").order("created_at", { ascending: false });
    if (data) setProjects(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createProject(form: Record<string, string>) {
    const { data } = await axiom.from("custom_work").insert({
      project_name: form.project_name,
      client_name: form.client_name,
      client_email: form.client_email,
      client_phone: form.client_phone,
      project_description: form.project_description,
      budget_range: form.budget_range,
      customer_id: form.customer_id || null,
      company_id: form.company_id || null,
      company_name: form.company_name || null,
      status: "new",
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "project", entity_id: data.id, label: `Created project: ${data.project_name}`, user_name: userEmail });
      load();
      setShowCreate(false);
    }
  }

  async function updateProject(id: string, updates: Partial<CustomWork>) {
    await axiom.from("custom_work").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    load();
    if (selected?.id === id) {
      setSelected((prev) => prev ? { ...prev, ...updates } : prev);
    }
  }

  async function deleteProject(id: string) {
    await axiom.from("custom_work").delete().eq("id", id);
    await logActivity({ action: "deleted", entity: "project", entity_id: id, label: `Deleted project`, user_name: userEmail });
    setSelected(null);
    load();
  }

  async function moveProject(id: string, newStatus: string) {
    await updateProject(id, { status: newStatus as CustomWork["status"] });
    await logActivity({ action: "updated", entity: "project", entity_id: id, label: `Moved project to ${newStatus}`, user_name: userEmail });
  }

  async function togglePortal(project: CustomWork) {
    const enabled = !project.portal_enabled;
    const token = enabled && !project.portal_token
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : project.portal_token;
    await updateProject(project.id, { portal_enabled: enabled, portal_token: token });
  }

  async function generateInvoice(project: CustomWork) {
    const y = new Date().getFullYear();
    const n = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${y}-${n}`;

    const { data } = await axiom.from("invoices").insert({
      invoice_number: invoiceNumber,
      custom_work_id: project.id,
      client_name: project.client_name || "",
      client_email: project.client_email || "",
      description: project.project_name,
      subtotal: project.quoted_amount || 0,
      issued_date: new Date().toISOString().split("T")[0],
      tax_rate: 8.75,
      status: "unpaid",
    }).select().single();

    if (data) {
      await logActivity({
        action: "created",
        entity: "invoice",
        entity_id: data.id,
        label: `Generated invoice ${invoiceNumber} from project: ${project.project_name}`,
        user_name: userEmail,
      });
      setSelected(null);
      router.push("/axiom/invoices");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Custom Work</h1>
          <p className="text-muted text-sm mt-1">{projects.length} projects</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={14} className="mr-1" /> New Project
        </Button>
      </div>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUS_COLUMNS.map((col) => {
          const colProjects = projects.filter((p) => p.status === col.key);
          return (
            <div
              key={col.key}
              className={cn(
                "flex-shrink-0 w-64 bg-card border border-border rounded p-3 min-h-[300px]",
                dragOver === col.key && "border-accent"
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => {
                if (dragging) moveProject(dragging, col.key);
                setDragging(null);
                setDragOver(null);
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                <span className="text-xs uppercase tracking-wider text-muted font-medium">{col.label}</span>
                <span className="text-xs text-muted ml-auto">{colProjects.length}</span>
              </div>
              <div className="space-y-2">
                {colProjects.map((p) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={() => setDragging(p.id)}
                    onClick={() => setSelected(p)}
                    className="bg-background border border-border p-3 cursor-pointer hover:border-accent/50 transition-colors text-sm"
                  >
                    <p className="font-medium mb-1 truncate">{p.project_name}</p>
                    <p className="text-muted text-xs truncate">{p.client_name}</p>
                    {p.company_name && <p className="text-muted text-xs truncate italic">{p.company_name}</p>}
                    {p.quoted_amount > 0 && (
                      <p className="text-accent text-xs mt-1 font-mono">{money(p.quoted_amount)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal title="New Project" onClose={() => setShowCreate(false)}>
          <CreateProjectForm onSubmit={createProject} onCancel={() => setShowCreate(false)} />
        </Modal>
      )}

      {/* Detail modal */}
      {selected && !showProposal && (
        <Modal title={selected.project_name} onClose={() => { setSelected(null); load(); }} wide>
          <ProjectDetail
            project={selected}
            onUpdate={(updates) => updateProject(selected.id, updates)}
            onDelete={() => deleteProject(selected.id)}
            onTogglePortal={() => togglePortal(selected)}
            onGenerateInvoice={() => generateInvoice(selected)}
            onGenerateProposal={() => setShowProposal(true)}
          />
        </Modal>
      )}

      {/* Proposal preview */}
      {showProposal && selected && (
        <ProposalPreview
          project={selected}
          onClose={() => setShowProposal(false)}
          userEmail={userEmail}
        />
      )}
    </div>
  );
}

// ── Modal wrapper ────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className={cn("fixed top-4 bottom-4 right-4 z-50 bg-background border border-border overflow-y-auto", wide ? "left-4 md:left-[20%]" : "left-4 md:left-[30%]")}>
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-heading font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </>
  );
}

// ── Customer search dropdown ──────────────────────────────────

function CustomerSearch({ onSelect, initialName }: { onSelect: (c: Customer) => void; initialName?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState(initialName || "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialName) setSelectedName(initialName);
  }, [initialName]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function search(q: string) {
    setQuery(q);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    const { data } = await axiom.from("customers").select("*").ilike("name", `%${q}%`).limit(8);
    if (data) { setResults(data); setOpen(true); }
  }

  function pick(c: Customer) {
    setSelectedName(c.name);
    setQuery("");
    setOpen(false);
    onSelect(c);
  }

  return (
    <div ref={ref} className="relative">
      <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Customer</label>
      <div className="flex items-center gap-2">
        {selectedName && (
          <span className="flex items-center gap-1 bg-accent/10 text-accent text-sm px-3 py-2 border border-accent/30 flex-1 truncate">
            {selectedName}
            <button onClick={() => { setSelectedName(""); onSelect({} as Customer); }} className="ml-1 hover:text-foreground"><X size={12} /></button>
          </span>
        )}
        {!selectedName && (
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search customers..."
              className="w-full bg-card border border-border pl-9 pr-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
            />
          </div>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-card border border-border shadow-lg mt-0.5 max-h-48 overflow-y-auto">
          {results.map((c) => (
            <button key={c.id} onMouseDown={() => pick(c)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-background flex items-center justify-between">
              <span>{c.name}</span>
              <span className="text-xs text-muted">{c.email || c.phone || ""}</span>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query && (
        <div className="absolute z-20 top-full left-0 right-0 bg-card border border-border mt-0.5 px-4 py-3 text-sm text-muted">
          No customers found — <a href="/axiom/customers" className="text-accent underline">add one first</a>
        </div>
      )}
    </div>
  );
}

// ── Company dropdown ──────────────────────────────────────────

function CompanySelect({ value, onChange }: { value: string; onChange: (id: string, name: string) => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    axiom.from("companies").select("*").order("name").then(({ data }) => { if (data) setCompanies(data); });
  }, []);

  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Company</label>
      <select
        value={value}
        onChange={(e) => {
          const selected = companies.find((c) => c.id === e.target.value);
          onChange(e.target.value, selected?.name || "");
        }}
        className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
      >
        <option value="">None</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

// ── Create form ──────────────────────────────────────────────

function CreateProjectForm({ onSubmit, onCancel }: { onSubmit: (form: Record<string, string>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    project_name: "", client_name: "", client_email: "", client_phone: "",
    project_description: "", budget_range: "", customer_id: "", company_id: "", company_name: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleCustomerSelect(c: Customer) {
    if (!c.id) {
      setForm((f) => ({ ...f, customer_id: "", client_name: "", client_email: "", client_phone: "" }));
    } else {
      setForm((f) => ({
        ...f,
        customer_id: c.id,
        client_name: c.name,
        client_email: c.email || "",
        client_phone: c.phone || "",
      }));
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Project Name" value={form.project_name} onChange={(v) => set("project_name", v)} required />

      <CustomerSearch onSelect={handleCustomerSelect} />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Client Name" value={form.client_name} onChange={(v) => set("client_name", v)} />
        <Field label="Client Phone" value={form.client_phone} onChange={(v) => set("client_phone", v)} />
      </div>
      <Field label="Client Email" value={form.client_email} onChange={(v) => set("client_email", v)} type="email" />

      <CompanySelect
        value={form.company_id}
        onChange={(id, name) => setForm((f) => ({ ...f, company_id: id, company_name: name }))}
      />

      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Budget Range</label>
        <select value={form.budget_range} onChange={(e) => set("budget_range", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground focus:outline-none focus:border-accent">
          <option value="">Select...</option>
          {BUDGET_RANGES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Description</label>
        <textarea value={form.project_description} onChange={(e) => set("project_description", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground focus:outline-none focus:border-accent min-h-[100px] resize-y" />
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit(form)} disabled={!form.project_name}>Create Project</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Detail view ──────────────────────────────────────────────

function ProjectDetail({ project, onUpdate, onDelete, onTogglePortal, onGenerateInvoice, onGenerateProposal }: {
  project: CustomWork;
  onUpdate: (u: Partial<CustomWork>) => void;
  onDelete: () => void;
  onTogglePortal: () => void;
  onGenerateInvoice: () => void;
  onGenerateProposal: () => void;
}) {
  const [customerId, setCustomerId] = useState(project.customer_id || "");
  const [customerName, setCustomerName] = useState("");
  const [clientName, setClientName] = useState(project.client_name || "");
  const [clientEmail, setClientEmail] = useState(project.client_email || "");
  const [clientPhone, setClientPhone] = useState(project.client_phone || "");
  const [companyId, setCompanyId] = useState(project.company_id || "");
  const [companyName, setCompanyName] = useState(project.company_name || "");
  const [budgetRange, setBudgetRange] = useState(project.budget_range || "");
  const [description, setDescription] = useState(project.project_description || "");
  const [materials, setMaterials] = useState<Material[]>(project.materials || []);
  const [labor, setLabor] = useState<LaborEntry[]>(project.labor_log || []);
  const [quoted, setQuoted] = useState(project.quoted_amount || 0);
  const [notes, setNotes] = useState(project.internal_notes || "");
  const [startDate, setStartDate] = useState(project.start_date || "");
  const [dueDate, setDueDate] = useState(project.due_date || "");
  const [portalStage, setPortalStage] = useState(project.portal_stage || "consultation");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Resolve customer name for display if we have a customer_id
  useEffect(() => {
    if (project.customer_id) {
      axiom.from("customers").select("name").eq("id", project.customer_id).single().then(({ data }) => {
        if (data) setCustomerName(data.name);
      });
    }
  }, [project.customer_id]);

  const materialTotal = materials.reduce((s, m) => s + (m.cost || 0), 0);
  const laborTotal = labor.reduce((s, l) => s + (l.cost || 0), 0);
  const actualCost = materialTotal + laborTotal;
  const margin = quoted > 0 ? ((quoted - actualCost) / quoted) * 100 : 0;

  function markDirty() { setDirty(true); setSaved(false); }

  function addMaterial() { setMaterials([...materials, { description: "", vendor: "", cost: 0 }]); markDirty(); }
  function updateMaterial(i: number, field: keyof Material, value: string | number) {
    const updated = [...materials];
    (updated[i] as unknown as Record<string, string | number>)[field] = value;
    setMaterials(updated); markDirty();
  }
  function removeMaterial(i: number) { setMaterials(materials.filter((_, idx) => idx !== i)); markDirty(); }

  function addLabor() { setLabor([...labor, { date: new Date().toISOString().split("T")[0], hours: 0, rate: 60, cost: 0 }]); markDirty(); }
  function updateLabor(i: number, field: keyof LaborEntry, value: string | number) {
    const updated = [...labor];
    (updated[i] as unknown as Record<string, string | number>)[field] = value;
    if (field === "hours" || field === "rate") {
      updated[i].cost = Number(updated[i].hours) * Number(updated[i].rate);
    }
    setLabor(updated); markDirty();
  }
  function removeLabor(i: number) { setLabor(labor.filter((_, idx) => idx !== i)); markDirty(); }

  function handleCustomerSelect(c: Customer) {
    if (!c.id) {
      setCustomerId("");
      setCustomerName("");
    } else {
      setCustomerId(c.id);
      setCustomerName(c.name);
      setClientName(c.name);
      setClientEmail(c.email || "");
      setClientPhone(c.phone || "");
    }
    markDirty();
  }

  function save() {
    onUpdate({
      customer_id: customerId || undefined,
      company_id: companyId || undefined,
      company_name: companyName || undefined,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      budget_range: budgetRange,
      project_description: description,
      quoted_amount: quoted,
      actual_cost: actualCost,
      materials,
      labor_log: labor,
      internal_notes: notes,
      start_date: startDate || undefined,
      due_date: dueDate || undefined,
      portal_stage: portalStage as CustomWork["portal_stage"],
    });
    setDirty(false);
    setSaved(true);
  }

  const portalUrl = project.portal_token
    ? `${window.location.origin}/axiom/portal/${project.portal_token}`
    : "";

  return (
    <div className="space-y-8">
      {/* Customer + Company */}
      <div className="space-y-4">
        <CustomerSearch
          onSelect={handleCustomerSelect}
          initialName={customerName}
        />
        <CompanySelect
          value={companyId}
          onChange={(id, name) => { setCompanyId(id); setCompanyName(name); }}
        />
      </div>

      {/* Client info — editable */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Client Name" value={clientName} onChange={(v) => { setClientName(v); markDirty(); }} />
        <Field label="Client Email" value={clientEmail} onChange={(v) => { setClientEmail(v); markDirty(); }} type="email" />
        <Field label="Client Phone" value={clientPhone} onChange={(v) => { setClientPhone(v); markDirty(); }} />
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Budget Range</label>
          <select value={budgetRange} onChange={(e) => { setBudgetRange(e.target.value); markDirty(); }} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent">
            <option value="">Select...</option>
            {BUDGET_RANGES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Description</label>
        <textarea value={description} onChange={(e) => { setDescription(e.target.value); markDirty(); }} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[80px] resize-y" />
      </div>

      {/* Dates + status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Start Date" type="date" value={startDate} onChange={(v) => { setStartDate(v); markDirty(); }} />
        <Field label="Due Date" type="date" value={dueDate} onChange={(v) => { setDueDate(v); markDirty(); }} />
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Status</label>
          <select value={project.status} onChange={(e) => onUpdate({ status: e.target.value as CustomWork["status"] })} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent">
            {STATUS_COLUMNS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <Field label="Quoted Amount" type="number" value={String(quoted)} onChange={(v) => { setQuoted(Number(v)); markDirty(); }} />
      </div>

      {/* Profit box */}
      <div className="bg-card border border-border p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted mb-3">Profit Analysis</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted block text-xs">Quoted</span>
            <span className="font-mono">{money(quoted)}</span>
          </div>
          <div>
            <span className="text-muted block text-xs">Actual Cost</span>
            <span className="font-mono">{money(actualCost)}</span>
          </div>
          <div>
            <span className="text-muted block text-xs">Profit</span>
            <span className="font-mono text-green-500">{money(quoted - actualCost)}</span>
          </div>
          <div>
            <span className="text-muted block text-xs">Margin</span>
            <span className="font-mono" style={{ color: margin >= 40 ? "#22c55e" : margin >= 20 ? "#f59e0b" : "#ef4444" }}>
              {quoted > 0 ? `${margin.toFixed(1)}%` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Materials */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-wider text-muted">Materials</h3>
          <button onClick={addMaterial} className="text-accent text-xs flex items-center gap-1"><Plus size={12} /> Add</button>
        </div>
        {materials.length === 0 ? (
          <p className="text-muted text-sm">No materials added</p>
        ) : (
          <div className="space-y-2">
            {materials.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_100px_32px] gap-2 items-center">
                <input value={m.description} onChange={(e) => updateMaterial(i, "description", e.target.value)} placeholder="Description" className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
                <input value={m.vendor} onChange={(e) => updateMaterial(i, "vendor", e.target.value)} placeholder="Vendor" className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
                <input type="number" value={m.cost || ""} onChange={(e) => updateMaterial(i, "cost", Number(e.target.value))} placeholder="Cost" className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent text-right" />
                <button onClick={() => removeMaterial(i)} className="text-muted hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            <p className="text-right text-sm font-mono text-muted">Total: {money(materialTotal)}</p>
          </div>
        )}
      </div>

      {/* Labor */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-wider text-muted">Labor Log</h3>
          <button onClick={addLabor} className="text-accent text-xs flex items-center gap-1"><Plus size={12} /> Add</button>
        </div>
        {labor.length === 0 ? (
          <p className="text-muted text-sm">No labor logged</p>
        ) : (
          <div className="space-y-2">
            {labor.map((l, i) => (
              <div key={i} className="grid grid-cols-[120px_80px_80px_80px_32px] gap-2 items-center">
                <input type="date" value={l.date} onChange={(e) => updateLabor(i, "date", e.target.value)} className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
                <input type="number" value={l.hours || ""} onChange={(e) => updateLabor(i, "hours", Number(e.target.value))} placeholder="Hrs" className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent text-right" />
                <input type="number" value={l.rate || ""} onChange={(e) => updateLabor(i, "rate", Number(e.target.value))} placeholder="Rate" className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent text-right" />
                <span className="text-sm font-mono text-right">{money(l.cost || 0)}</span>
                <button onClick={() => removeLabor(i)} className="text-muted hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            <p className="text-right text-sm font-mono text-muted">Total: {money(laborTotal)}</p>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Internal Notes</label>
        <textarea value={notes} onChange={(e) => { setNotes(e.target.value); markDirty(); }} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[80px] resize-y" />
      </div>

      {/* Portal */}
      <div className="bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-wider text-muted">Client Portal</h3>
          <button onClick={onTogglePortal} className={cn("text-xs px-3 py-1 border rounded", project.portal_enabled ? "border-green-500 text-green-500" : "border-border text-muted")}>
            {project.portal_enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        {project.portal_enabled && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <input value={portalUrl} readOnly className="flex-1 bg-background border border-border px-3 py-2 text-xs text-muted font-mono" />
              <button onClick={() => navigator.clipboard.writeText(portalUrl)} className="text-muted hover:text-accent"><Copy size={14} /></button>
              <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent"><ExternalLink size={14} /></a>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Portal Stage</label>
              <select value={portalStage} onChange={(e) => { setPortalStage(e.target.value as CustomWork["portal_stage"]); markDirty(); }} className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent">
                {PORTAL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-border flex-wrap">
        <SaveButton dirty={dirty} saved={saved} onClick={save} />
        <Button variant="outline" onClick={onGenerateProposal}>
          <ClipboardList size={14} className="mr-1" /> Generate Proposal
        </Button>
        <Button variant="outline" onClick={onGenerateInvoice}>
          <FileText size={14} className="mr-1" /> Generate Invoice
        </Button>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-red-500 text-sm">Are you sure?</span>
            <Button variant="outline" size="sm" onClick={() => onDelete()}>Yes, Delete</Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-muted hover:text-red-500 text-sm flex items-center gap-1">
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ── Reusable field ───────────────────────────────────────────

function Field({ label, value, onChange, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">
        {label}{required && <span className="text-accent ml-1">*</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
    </div>
  );
}

// ── Proposal Preview ─────────────────────────────────────────────────────────

function ProposalPreview({ project, onClose, userEmail }: {
  project: CustomWork;
  onClose: () => void;
  userEmail: string;
}) {
  const [biz, setBiz] = useState<Partial<Settings> | null>(null);
  const [validUntil, setValidUntil] = useState("");
  const [includeMaterials, setIncludeMaterials] = useState(true);
  const [includeLabor, setIncludeLabor] = useState(true);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [sendTo, setSendTo] = useState(project.client_email || "");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"success" | "error" | null>(null);

  const proposalNum = `PROP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  useEffect(() => {
    axiom.from("settings")
      .select("biz_name,biz_phone,biz_address,biz_city,biz_state,biz_zip,terms_text")
      .limit(1).single()
      .then(({ data }) => setBiz(data || {}));
  }, []);

  const materials = project.materials || [];
  const laborLog = project.labor_log || [];
  const materialTotal = materials.reduce((s, m) => s + (m.cost || 0), 0);
  const laborTotal = laborLog.reduce((s, l) => s + (l.cost || 0), 0);
  const totalHours = laborLog.reduce((s, l) => s + (l.hours || 0), 0);
  const quotedAmount = project.quoted_amount || 0;

  const fmtDate = (d?: string) => d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  function money(n: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  }

  async function handleSend() {
    if (!sendTo || !biz) return;
    setSending(true); setSendResult(null);
    try {
      const html = generateProposalHtml(project, biz, {
        proposalNum, validUntil, includeMaterials, includeLabor, forEmail: true,
      });
      const res = await fetch("/api/send-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sendTo,
          subject: `Proposal from RELIC Custom Fabrications — ${project.project_name}`,
          html,
          from_name: "RELIC Custom Fabrications",
        }),
      });
      setSendResult(res.ok ? "success" : "error");
      if (res.ok) setShowEmailForm(false);
    } catch { setSendResult("error"); }
    setSending(false);
  }

  if (!biz) {
    return <div className="fixed inset-0 bg-gray-100 z-[100] flex items-center justify-center text-gray-500 text-sm">Loading…</div>;
  }

  const addressLine2 = [biz.biz_city, biz.biz_state, biz.biz_zip].filter(Boolean).join(", ");
  const stripeColor = "#8b6914";

  return (
    <div className="fixed inset-0 bg-gray-100 z-[100] overflow-auto">

      {/* Toolbar */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium">
          <X size={16} /> Close Preview
        </button>

        {/* Options */}
        <div className="flex items-center gap-4 text-sm text-gray-600 border-l border-gray-200 pl-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={includeMaterials} onChange={(e) => setIncludeMaterials(e.target.checked)} className="accent-[#c4a24d]" />
            Materials
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={includeLabor} onChange={(e) => setIncludeLabor(e.target.checked)} className="accent-[#c4a24d]" />
            Labor
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Valid Until</span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:border-[#c4a24d]"
            />
          </div>
        </div>

        <div className="flex-1" />

        {/* Email form inline */}
        {showEmailForm && (
          <div className="flex items-center gap-2">
            <input
              type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)}
              placeholder="client@email.com"
              className="border border-gray-300 px-3 py-1.5 text-sm rounded focus:outline-none focus:border-[#c4a24d] w-52"
            />
            <button
              onClick={handleSend} disabled={!sendTo || sending}
              className="bg-[#c4a24d] text-white px-3 py-1.5 text-sm rounded disabled:opacity-50 hover:bg-[#b3913c]"
            >{sending ? "Sending…" : "Send"}</button>
            <button onClick={() => { setShowEmailForm(false); setSendResult(null); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
        )}
        {sendResult === "success" && !showEmailForm && (
          <span className="flex items-center gap-1 text-green-600 text-sm"><CheckCircle size={14} /> Sent!</span>
        )}
        {!showEmailForm && (
          <button
            onClick={() => { setShowEmailForm(true); setSendResult(null); setSendTo(project.client_email || ""); }}
            className="flex items-center gap-1.5 border border-gray-300 px-3 py-1.5 text-sm rounded hover:bg-gray-50"
          >
            <Send size={14} /> Email
          </button>
        )}
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 bg-gray-900 text-white px-4 py-1.5 text-sm rounded hover:bg-gray-700"
        >
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>

      {/* Proposal document */}
      <div className="max-w-4xl mx-auto my-8 bg-white print:my-0 print:max-w-none print:shadow-none shadow-sm">

        {/* Header */}
        <div className="flex justify-between items-start px-10 pt-10 pb-8 print:px-8 print:pt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-full.png" alt="RELIC Custom Fabrications" className="h-20 object-contain object-left print:h-16" />
          <div className="text-right">
            <h1 className="text-4xl font-bold text-gray-900 mb-3 tracking-wide">PROPOSAL</h1>
            {biz.biz_name && <p className="text-sm font-semibold text-gray-800">{biz.biz_name}</p>}
            {biz.biz_address && <p className="text-xs text-gray-500 mt-0.5">{biz.biz_address}</p>}
            {addressLine2 && <p className="text-xs text-gray-500">{addressLine2}</p>}
            {(biz.biz_state || biz.biz_city) && <p className="text-xs text-gray-500">United States</p>}
            {biz.biz_phone && <p className="text-xs text-gray-500 mt-1">{biz.biz_phone}</p>}
            <p className="text-xs text-gray-500">relicbuilt.com</p>
          </div>
        </div>

        <div className="mx-10 border-t border-gray-200 print:mx-8" />

        {/* Prepared For / Proposal meta */}
        <div className="grid grid-cols-2 gap-10 px-10 py-8 print:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "#c4a24d" }}>Prepared For</p>
            <p className="font-bold text-gray-900 text-base">{project.client_name}</p>
            {project.company_name && <p className="text-sm text-gray-600 mt-0.5">{project.company_name}</p>}
            {project.client_phone && <p className="text-sm text-gray-600 mt-1">{project.client_phone}</p>}
            {project.client_email && <p className="text-sm text-gray-600 mt-0.5">{project.client_email}</p>}
          </div>
          <div>
            <div className="space-y-2 text-sm mb-5">
              <div className="flex justify-between"><span className="font-semibold text-gray-500">Proposal #:</span><span className="font-bold">{proposalNum}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-500">Prepared:</span><span>{fmtDate(new Date().toISOString().split("T")[0])}</span></div>
              {validUntil && <div className="flex justify-between"><span className="font-semibold text-gray-500">Valid Until:</span><span>{fmtDate(validUntil)}</span></div>}
              {project.start_date && <div className="flex justify-between"><span className="font-semibold text-gray-500">Est. Start:</span><span>{fmtDate(project.start_date)}</span></div>}
              {project.due_date && <div className="flex justify-between"><span className="font-semibold text-gray-500">Est. Completion:</span><span>{fmtDate(project.due_date)}</span></div>}
            </div>
            <div className="bg-gray-100 px-4 py-3 flex justify-between font-bold text-sm">
              <span>Quoted Amount:</span>
              <span className="font-mono">{money(quotedAmount)}</span>
            </div>
          </div>
        </div>

        {/* Project stripe */}
        <div className="px-10 py-3 print:px-8" style={{ background: stripeColor }}>
          <p className="text-sm font-bold text-white uppercase tracking-widest">Project</p>
        </div>
        <div className="px-10 py-6 border-b border-gray-100 print:px-8">
          <p className="font-bold text-gray-900 text-base">{project.project_name}</p>
          {project.project_description && (
            <p className="text-sm text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">{project.project_description}</p>
          )}
          {project.timeline && <p className="text-xs text-gray-400 mt-3">Timeline: {project.timeline}</p>}
        </div>

        {/* Scope of Work */}
        {((includeMaterials && materials.length > 0) || (includeLabor && laborLog.length > 0)) && (
          <>
            <div className="px-10 py-3 print:px-8" style={{ background: stripeColor }}>
              <p className="text-sm font-bold text-white uppercase tracking-widest">Scope of Work</p>
            </div>
            {includeMaterials && materials.map((m, i) => (
              <div key={i} className="flex items-center justify-between px-10 py-4 border-b border-gray-100 print:px-8">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-800">{m.description}</span>
                  {m.vendor && <span className="text-xs text-gray-400">{m.vendor}</span>}
                </div>
                <span className="font-bold font-mono text-gray-900 ml-8 shrink-0">{money(m.cost)}</span>
              </div>
            ))}
            {includeLabor && laborLog.length > 0 && (
              <div className="flex items-center justify-between px-10 py-4 border-b border-gray-100 print:px-8">
                <div className="flex items-center gap-3">
                  <span className="text-gray-800">Labor</span>
                  <span className="text-xs text-gray-400">{totalHours.toFixed(1)} hrs</span>
                </div>
                <span className="font-bold font-mono text-gray-900 ml-8">{money(laborTotal)}</span>
              </div>
            )}
          </>
        )}

        <div className="mx-10 border-t border-gray-200 mt-2 print:mx-8" />

        {/* Totals */}
        <div className="flex justify-end px-10 py-8 print:px-8">
          <div className="w-80 text-sm space-y-2">
            {includeMaterials && materials.length > 0 && (
              <div className="flex justify-between text-gray-500"><span>Materials:</span><span className="font-mono">{money(materialTotal)}</span></div>
            )}
            {includeLabor && laborLog.length > 0 && (
              <div className="flex justify-between text-gray-500"><span>Labor:</span><span className="font-mono">{money(laborTotal)}</span></div>
            )}
            <div className="bg-gray-100 px-4 py-3 flex justify-between font-bold mt-1">
              <span>Total Quoted Amount:</span>
              <span className="font-mono">{money(quotedAmount)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        {biz.terms_text && (
          <div className="px-10 pb-8 border-t border-gray-100 print:px-8">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 mt-6">Terms</p>
            <p className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed">{biz.terms_text}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-10 pb-10 print:px-8 print:pb-8">
          <p className="text-xs text-gray-300 text-center">
            RELIC &middot; Custom Fabrications &middot; (402) 235-8179 &middot; relicbuilt.com
          </p>
        </div>

      </div>
    </div>
  );
}
