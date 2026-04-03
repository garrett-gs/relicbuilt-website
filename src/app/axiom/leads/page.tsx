"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { Lead, Customer } from "@/types/axiom";
import { formatPhone } from "@/lib/utils";
import {
  Search,
  User,
  Phone,
  Mail,
  DollarSign,
  Clock,
  X,
  ChevronRight,
  Plus,
  Image as ImageIcon,
  ExternalLink,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";

const STATUSES: { key: Lead["status"]; label: string; color: string }[] = [
  { key: "new",       label: "New",       color: "#6366f1" },
  { key: "contacted", label: "Contacted", color: "#f59e0b" },
  { key: "quoted",    label: "Quoted",    color: "#3b82f6" },
  { key: "converted", label: "Converted", color: "#22c55e" },
  { key: "lost",      label: "Lost",      color: "#9ca3af" },
];

const BUDGET_RANGES = [
  "Under $500", "$500 – $1,000", "$1,000 – $2,500", "$2,500 – $5,000",
  "$5,000 – $10,000", "$10,000 – $25,000", "$25,000+", "Not sure yet",
];

const inp = "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";

function statusBadge(status: Lead["status"]) {
  const s = STATUSES.find((x) => x.key === status);
  const c = s?.color ?? "#9ca3af";
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5"
      style={{ background: c + "18", color: c }}
    >
      {s?.label ?? status}
    </span>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Customer Search ──────────────────────────────────────────────────────────

function CustomerSearch({
  onSelect,
  initialName,
}: {
  onSelect: (c: Customer | null) => void;
  initialName?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState(initialName || "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialName !== undefined) setSelectedName(initialName);
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

  function clear() {
    setSelectedName("");
    onSelect(null);
  }

  return (
    <div ref={ref} className="relative">
      <label className={lbl}>Name *</label>
      <div className="flex items-center gap-2">
        {selectedName ? (
          <span className="flex items-center gap-1 bg-accent/10 text-accent text-sm px-3 py-2.5 border border-accent/30 flex-1 truncate">
            {selectedName}
            <button type="button" onClick={clear} className="ml-1 hover:text-foreground shrink-0">
              <X size={12} />
            </button>
          </span>
        ) : (
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search customers or type name…"
              className="w-full bg-card border border-border pl-9 pr-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
            />
          </div>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-card border border-border shadow-lg mt-0.5 max-h-48 overflow-y-auto">
          {results.map((c) => (
            <button key={c.id} type="button" onMouseDown={() => pick(c)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-background flex items-center justify-between">
              <span>{c.name}</span>
              <span className="text-xs text-muted">{c.email || c.phone || ""}</span>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query && (
        <div className="absolute z-20 top-full left-0 right-0 bg-card border border-border mt-0.5 px-4 py-3 text-sm text-muted flex items-center justify-between">
          <span>No match — will add as new</span>
          <button type="button" onMouseDown={() => {
            setSelectedName(query);
            setOpen(false);
            onSelect({ name: query } as Customer);
          }} className="text-accent text-xs underline">Use &quot;{query}&quot;</button>
        </div>
      )}
    </div>
  );
}

// ── Create Lead Modal ────────────────────────────────────────────────────────

function CreateLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: (l: Lead) => void }) {
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function handleCustomerSelect(c: Customer | null) {
    if (!c) {
      setCustomerId("");
      setName("");
      setEmail("");
      setPhone("");
    } else {
      setCustomerId(c.id ?? "");
      setName(c.name ?? "");
      setEmail(c.email ?? "");
      setPhone(c.phone ?? "");
    }
  }

  async function save() {
    if (!name.trim()) { setErr("Name is required."); return; }
    setSaving(true);
    const { data, error } = await axiom.from("leads").insert({
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      description: description.trim() || null,
      budget_range: budgetRange || null,
      notes: notes.trim() || null,
      status: "new",
      source: customerId ? "crm" : "manual",
      inspiration_photos: [],
    }).select().single();
    if (error || !data) { setErr("Failed to create lead."); setSaving(false); return; }
    onCreated(data as Lead);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-background border border-border w-full max-w-lg mx-4 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">Add Lead</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <CustomerSearch onSelect={handleCustomerSelect} initialName={name} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(402) 000-0000"
                className={inp}
              />
            </div>
          </div>
          <div>
            <label className={lbl}>Budget Range</label>
            <select value={budgetRange} onChange={(e) => setBudgetRange(e.target.value)} className={inp}>
              <option value="">Select…</option>
              {BUDGET_RANGES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inp + " min-h-[80px] resize-y"} />
          </div>
          <div>
            <label className={lbl}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inp + " min-h-[60px] resize-y"} />
          </div>
        </div>
        {err && <p className="text-xs text-red-500 mt-3">{err}</p>}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 border border-border px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 bg-accent text-background px-4 py-2.5 text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50">
            {saving ? "Saving…" : "Add Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────────────────

function LeadDetail({ lead, onUpdate, onDelete }: {
  lead: Lead;
  onUpdate: (updated: Lead) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editBudget, setEditBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setEditing(false);
    setNotes(lead.notes ?? "");
    setNotesDirty(false);
    setConfirmDelete(false);
  }, [lead.id]);

  function startEdit() {
    setEditName(lead.name);
    setEditEmail(lead.email ?? "");
    setEditPhone(lead.phone ?? "");
    setEditDesc(lead.description ?? "");
    setEditBudget(lead.budget_range ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    const { data, error } = await axiom.from("leads")
      .update({
        name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        description: editDesc.trim() || null,
        budget_range: editBudget || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .select()
      .single();
    if (!error && data) onUpdate(data as Lead);
    setSaving(false);
    setEditing(false);
  }

  async function updateStatus(status: Lead["status"]) {
    const { data, error } = await axiom.from("leads")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", lead.id)
      .select()
      .single();
    if (!error && data) onUpdate(data as Lead);
  }

  async function saveNotes() {
    setSavingNotes(true);
    const { data, error } = await axiom.from("leads")
      .update({ notes, updated_at: new Date().toISOString() })
      .eq("id", lead.id)
      .select()
      .single();
    if (!error && data) onUpdate(data as Lead);
    setSavingNotes(false);
    setNotesDirty(false);
  }

  async function handleDelete() {
    await axiom.from("leads").delete().eq("id", lead.id);
    onDelete(lead.id);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground truncate">{lead.name}</h2>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {statusBadge(lead.status)}
            <span className="text-xs text-muted">
              <Clock size={11} className="inline mr-1" />
              {fmtDate(lead.created_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!editing && (
            <button onClick={startEdit} className="p-1.5 text-muted hover:text-foreground hover:bg-card rounded transition-colors">
              <Pencil size={15} />
            </button>
          )}
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="p-1.5 text-muted hover:text-red-500 hover:bg-card rounded transition-colors">
              <Trash2 size={15} />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-500">Delete?</span>
              <button onClick={handleDelete} className="text-xs bg-red-500 text-white px-2 py-1 hover:bg-red-600">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs border border-border px-2 py-1 text-muted hover:text-foreground">No</button>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">

        {/* Status Selector */}
        <div>
          <p className={lbl}>Status</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                onClick={() => updateStatus(s.key)}
                className="text-xs px-3 py-1.5 font-medium transition-colors"
                style={lead.status === s.key
                  ? { background: s.color, color: "#fff" }
                  : { background: "rgba(128,128,128,0.12)", color: "#9ca3af" }
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contact Info */}
        {editing ? (
          <div className="space-y-3 border border-border p-4">
            <div>
              <label className={lbl}>Name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inp} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Email</label>
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Phone</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                  placeholder="(402) 000-0000"
                  className={inp}
                />
              </div>
            </div>
            <div>
              <label className={lbl}>Budget Range</label>
              <select value={editBudget} onChange={(e) => setEditBudget(e.target.value)} className={inp}>
                <option value="">Select…</option>
                {BUDGET_RANGES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Description</label>
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className={inp + " min-h-[80px] resize-y"} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 border border-border px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="flex-1 bg-accent text-background px-4 py-2 text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className={lbl}>Contact Info</p>
            <div className="space-y-2.5">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm text-foreground hover:text-accent group">
                  <Mail size={14} className="text-muted" />
                  <span>{lead.email}</span>
                  <ExternalLink size={11} className="text-muted opacity-0 group-hover:opacity-100" />
                </a>
              )}
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm text-foreground hover:text-accent group">
                  <Phone size={14} className="text-muted" />
                  <span>{lead.phone}</span>
                </a>
              )}
              {lead.budget_range && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <DollarSign size={14} className="text-muted" />
                  <span>{lead.budget_range}</span>
                </div>
              )}
              {!lead.email && !lead.phone && !lead.budget_range && (
                <p className="text-sm text-muted italic">No contact info</p>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {!editing && lead.description && (
          <div>
            <p className={lbl}>Project Description</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{lead.description}</p>
          </div>
        )}

        {/* Inspiration Photos */}
        {lead.inspiration_photos && lead.inspiration_photos.length > 0 && (
          <div>
            <p className={lbl}>
              <ImageIcon size={12} className="inline mr-1.5" />
              Inspiration Photos ({lead.inspiration_photos.length})
            </p>
            <div className="grid grid-cols-3 gap-2">
              {lead.inspiration_photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square group relative">
                  <img src={url} alt="Inspiration" className="w-full h-full object-cover border border-border" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ExternalLink size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Internal Notes */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className={lbl + " mb-0"}>Internal Notes</p>
            {notesDirty && (
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="text-xs bg-accent text-background px-3 py-1 hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1"
              >
                <Check size={11} />
                {savingNotes ? "Saving…" : "Save"}
              </button>
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
            placeholder="Add internal notes about this lead…"
            className={inp + " min-h-[100px] resize-y"}
          />
        </div>

        {/* Convert to Project */}
        <div className="pt-2 border-t border-border">
          <a href="/axiom/projects" className="flex items-center gap-2 text-sm text-accent hover:underline">
            <Plus size={14} />
            Convert to Project (go to Projects)
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Lead["status"] | "all">("all");

  const loadLeads = useCallback(async () => {
    const { data } = await axiom.from("leads").select("*").order("created_at", { ascending: false });
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      l.name.toLowerCase().includes(q) ||
      (l.email ?? "").toLowerCase().includes(q) ||
      (l.phone ?? "").toLowerCase().includes(q) ||
      (l.description ?? "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  function handleCreated(l: Lead) {
    setLeads((prev) => [l, ...prev]);
    setSelectedId(l.id);
    setShowCreate(false);
  }

  function handleUpdate(updated: Lead) {
    setLeads((prev) => prev.map((l) => l.id === updated.id ? updated : l));
  }

  function handleDelete(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelectedId(null);
  }

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {showCreate && (
        <CreateLeadModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}

      {/* Left: List */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col bg-card">
        <div className="px-4 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-sm font-semibold text-foreground uppercase tracking-wider">Leads</h1>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 text-xs bg-accent text-background px-2.5 py-1.5 hover:bg-accent/90 transition-colors font-medium"
            >
              <Plus size={13} /> Add
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="w-full bg-background border border-border pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
            />
          </div>

          {/* Status filter pills */}
          <div className="flex flex-wrap gap-1 mt-2.5">
            <button
              onClick={() => setStatusFilter("all")}
              className="text-xs px-2 py-0.5 transition-colors"
              style={statusFilter === "all"
                ? { background: "#c4a24d", color: "#fff" }
                : { background: "rgba(128,128,128,0.12)", color: "#9ca3af" }
              }
            >
              All
            </button>
            {STATUSES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className="text-xs px-2 py-0.5 transition-colors"
                style={statusFilter === s.key
                  ? { background: s.color, color: "#fff" }
                  : { background: "rgba(128,128,128,0.12)", color: "#9ca3af" }
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-muted">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              {leads.length === 0 ? "No leads yet" : "No matches"}
            </div>
          ) : (
            filtered.map((lead) => {
              const active = selectedId === lead.id;
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={`w-full text-left px-4 py-3.5 border-b border-border flex items-start gap-3 transition-colors ${
                    active ? "bg-accent/10 border-l-2 border-l-accent" : "hover:bg-background"
                  }`}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: (STATUSES.find((s) => s.key === lead.status)?.color ?? "#9ca3af") + "22" }}
                  >
                    <User size={13} style={{ color: STATUSES.find((s) => s.key === lead.status)?.color ?? "#9ca3af" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${active ? "text-accent" : "text-foreground"}`}>{lead.name}</p>
                    <p className="text-xs text-muted truncate mt-0.5">{lead.email || lead.phone || "No contact info"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-[10px] font-semibold"
                        style={{ color: STATUSES.find((s) => s.key === lead.status)?.color ?? "#9ca3af" }}
                      >
                        {STATUSES.find((s) => s.key === lead.status)?.label}
                      </span>
                      {lead.budget_range && <span className="text-[10px] text-muted truncate">{lead.budget_range}</span>}
                      {(lead.inspiration_photos?.length ?? 0) > 0 && (
                        <span className="text-[10px] text-muted flex items-center gap-0.5">
                          <ImageIcon size={9} /> {lead.inspiration_photos.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-muted shrink-0 mt-1" />
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-border">
          <p className="text-xs text-muted">{filtered.length} lead{filtered.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Right: Detail or empty state */}
      {selected ? (
        <LeadDetail lead={selected} onUpdate={handleUpdate} onDelete={handleDelete} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-center px-8">
          <div>
            <User size={36} className="text-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Select a lead</p>
            <p className="text-xs text-muted mb-5">Click any lead to view details</p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-sm bg-accent text-background px-4 py-2 hover:bg-accent/90 transition-colors mx-auto"
            >
              <Plus size={14} /> Add Lead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
