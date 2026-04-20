"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Estimate, EstimateLineItem, EstimateLaborItem, CustomWork, Customer, Vendor, CatalogItem } from "@/types/axiom";
import Button from "@/components/ui/Button";
import SaveButton from "@/components/ui/SaveButton";
import { cn } from "@/lib/utils";
import { Plus, Trash2, X, ChevronDown, ChevronRight, CheckCircle2, Search, Package, MessageSquare, Send, Loader2, Sparkles, Hammer, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

const STATUS_COLORS: Record<Estimate["status"], string> = {
  draft: "#888",
  sent: "#f59e0b",
  accepted: "#22c55e",
  rejected: "#ef4444",
};

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function pct(n: number) {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function calcTotals(est: Pick<Estimate, "line_items" | "labor_items" | "markup_percent">) {
  const materialTotal = est.line_items.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const laborTotal = est.labor_items.reduce((s, l) => s + (l.cost || 0), 0);
  const subtotal = materialTotal + laborTotal;
  const markupAmount = subtotal * ((est.markup_percent || 0) / 100);
  const total = subtotal + markupAmount;
  return { materialTotal, laborTotal, subtotal, markupAmount, total };
}

// ── Customer / Company search dropdown ──────────────────────────────────

type SearchResult = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  type: "customer" | "company";
};

function CustomerSearch({ onSelect, initialName }: { onSelect: (c: SearchResult) => void; initialName?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
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
    const [{ data: customers }, { data: companies }] = await Promise.all([
      axiom.from("customers").select("*").ilike("name", `%${q}%`).limit(6),
      axiom.from("companies").select("*").ilike("name", `%${q}%`).limit(4),
    ]);
    const merged: SearchResult[] = [
      ...((companies || []).map((co) => ({ id: co.id, name: co.name, email: co.phone || "", phone: co.phone, type: "company" as const }))),
      ...((customers || []).map((c) => ({ ...c, type: "customer" as const }))),
    ];
    setResults(merged);
    setOpen(true);
  }

  function pick(c: SearchResult) {
    setSelectedName(c.name);
    setQuery("");
    setOpen(false);
    onSelect(c);
  }

  return (
    <div ref={ref} className="relative">
      <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Customer / Company</label>
      <div className="flex items-center gap-2">
        {selectedName ? (
          <span className="flex items-center gap-1 bg-accent/10 text-accent text-sm px-3 py-2 border border-accent/30 flex-1 truncate">
            {selectedName}
            <button
              onClick={() => { setSelectedName(""); onSelect({} as SearchResult); }}
              className="ml-1 hover:text-foreground"
            >
              <X size={12} />
            </button>
          </span>
        ) : (
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search customers or companies..."
              className="w-full bg-card border border-border pl-9 pr-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
            />
          </div>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-card border border-border shadow-lg mt-0.5 max-h-48 overflow-y-auto">
          {results.map((c) => (
            <button key={c.id} onMouseDown={() => pick(c)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-background flex items-center justify-between">
              <span>{c.name}{c.type === "company" ? <span className="text-blue-400 text-[10px] ml-2 uppercase tracking-wider">Company</span> : ""}</span>
              <span className="text-xs text-muted">{c.email || c.phone || ""}</span>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query && (
        <div className="absolute z-20 top-full left-0 right-0 bg-card border border-border mt-0.5 px-4 py-3 text-sm text-muted">
          No results — <a href="/axiom/customers" className="text-accent underline">add a customer</a>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function EstimatorPage() {
  const { userEmail } = useAuth();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [selected, setSelected] = useState<Estimate | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const { data } = await axiom.from("estimates").select("*").order("created_at", { ascending: false });
    if (data) setEstimates(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createEstimate(form: { project_name: string; client_name: string; customer_id: string }) {
    const year = new Date().getFullYear();
    const { data: latest } = await axiom.from("estimates")
      .select("estimate_number")
      .like("estimate_number", `EST-${year}-%`)
      .order("estimate_number", { ascending: false })
      .limit(1)
      .single();
    const lastNum = latest?.estimate_number ? parseInt(latest.estimate_number.split("-").pop() || "0", 10) : 0;
    const estimate_number = `EST-${year}-${String(lastNum + 1).padStart(4, "0")}`;
    const { data } = await axiom.from("estimates").insert({
      estimate_number,
      project_name: form.project_name,
      client_name: form.client_name,
      customer_id: form.customer_id || null,
      status: "draft",
      line_items: [],
      labor_items: [],
      markup_percent: 0,
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "estimate", entity_id: data.id, label: `Created estimate ${estimate_number}`, user_name: userEmail });
      load();
      setSelected(data);
      setShowCreate(false);
    }
  }

  async function updateEstimate(id: string, updates: Partial<Estimate>) {
    await axiom.from("estimates").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    load();
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, ...updates } : prev);
  }

  async function deleteEstimate(id: string) {
    await axiom.from("estimates").delete().eq("id", id);
    await logActivity({ action: "deleted", entity: "estimate", entity_id: id, label: "Deleted estimate", user_name: userEmail });
    setSelected(null);
    load();
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Left — list */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-heading font-bold">Estimator</h1>
            <p className="text-muted text-sm mt-0.5">{estimates.length} estimates</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-1" /> New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {estimates.length === 0 && (
            <p className="text-muted text-sm">No estimates yet.</p>
          )}
          {estimates.map((est) => {
            const { total } = calcTotals(est);
            const active = selected?.id === est.id;
            return (
              <div
                key={est.id}
                onClick={() => setSelected(est)}
                className={cn(
                  "bg-card border border-border p-3 cursor-pointer transition-colors",
                  active ? "border-accent" : "hover:border-accent/40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{est.project_name || "—"}</p>
                    <p className="text-muted text-xs font-mono">{est.estimate_number}</p>
                    {est.client_name && <p className="text-muted text-xs truncate">{est.client_name}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-accent text-sm font-mono">{money(total)}</p>
                    <span className="text-xs capitalize" style={{ color: STATUS_COLORS[est.status] }}>
                      {est.status}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right — detail */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-muted text-sm">
            Select an estimate or create a new one
          </div>
        ) : (
          <EstimateDetail
            key={selected.id}
            estimate={selected}
            onUpdate={(u) => updateEstimate(selected.id, u)}
            onDelete={() => deleteEstimate(selected.id)}
          />
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal onSubmit={createEstimate} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────

function CreateModal({ onSubmit, onClose }: {
  onSubmit: (f: { project_name: string; client_name: string; customer_id: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ project_name: "", client_name: "", customer_id: "" });

  function handleCustomerSelect(c: SearchResult) {
    if (!c.id) {
      setForm((f) => ({ ...f, customer_id: "" }));
    } else if (c.type === "company") {
      // Company — don't set customer_id (FK mismatch), just track selection
      setForm((f) => ({ ...f, customer_id: "" }));
    } else {
      setForm((f) => ({ ...f, customer_id: c.id }));
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-bold">New Estimate</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <Field label="Project / Description" value={form.project_name} onChange={(v) => setForm((f) => ({ ...f, project_name: v }))} required />
          <CustomerSearch onSelect={handleCustomerSelect} />
          <Field label="Contact" value={form.client_name} onChange={(v) => setForm((f) => ({ ...f, client_name: v }))} />
          <div className="flex gap-3">
            <Button onClick={() => onSubmit(form)} disabled={!form.project_name}>Create</Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Estimate detail ───────────────────────────────────────────

function EstimateDetail({ estimate, onUpdate, onDelete }: {
  estimate: Estimate;
  onUpdate: (u: Partial<Estimate>) => void;
  onDelete: () => void;
}) {
  const { userEmail: detailUserEmail } = useAuth();
  const [customerId, setCustomerId] = useState(estimate.customer_id || "");
  const [customerName, setCustomerName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [projectName, setProjectName] = useState(estimate.project_name || "");
  const [clientName, setClientName] = useState(estimate.client_name || "");
  const [status, setStatus] = useState<Estimate["status"]>(estimate.status);
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>(estimate.line_items || []);
  const [laborItems, setLaborItems] = useState<EstimateLaborItem[]>(estimate.labor_items || []);
  const [markupPct, setMarkupPct] = useState(estimate.markup_percent || 0);
  const [unitCount, setUnitCount] = useState(estimate.unit_count || 1);
  const [notes, setNotes] = useState(estimate.notes || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLoadQuote, setShowLoadQuote] = useState(false);
  const [laborOpen, setLaborOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Claude chat ───────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingEstimate, setPendingEstimate] = useState<{ line_items: EstimateLineItem[]; labor_items: EstimateLaborItem[]; markup_percent: number; notes?: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  function markDirty() { setDirty(true); setSaved(false); }
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState(estimate.vendor_id || "");
  const [vendorName, setVendorName] = useState(estimate.vendor_name || "");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");

  // Load vendors list
  useEffect(() => {
    axiom.from("vendors").select("*").eq("status", "active").order("name").then(({ data }) => {
      if (data) setVendors(data);
    });
  }, []);

  // Load catalog when vendor changes
  useEffect(() => {
    if (!vendorId) { setCatalog([]); return; }
    axiom.from("vendor_catalog").select("*").eq("vendor_id", vendorId).eq("active", true).order("description").then(({ data }) => {
      if (data) setCatalog(data);
    });
    const v = vendors.find((v) => v.id === vendorId);
    if (v) setVendorName(v.name);
  }, [vendorId, vendors]);

  // Resolve customer name for display if we have a customer_id
  useEffect(() => {
    if (estimate.customer_id) {
      axiom.from("customers").select("name").eq("id", estimate.customer_id).single().then(({ data }) => {
        if (data) setCustomerName(data.name);
      });
    }
  }, [estimate.customer_id]);

  function addFromCatalog(item: CatalogItem) {
    const existing = lineItems.findIndex((li) => li.item_number === item.item_number && li.description === item.description);
    if (existing >= 0) {
      const updated = [...lineItems];
      updated[existing].quantity += 1;
      setLineItems(updated);
      return;
    }
    setLineItems([...lineItems, {
      item_number: item.item_number || "",
      description: item.description,
      quantity: 1,
      unit_price: item.unit_price,
      unit: item.unit,
    }]);
  }

  const filteredCatalog = catalog.filter((c) =>
    !catalogSearch ||
    c.description.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    (c.item_number || "").toLowerCase().includes(catalogSearch.toLowerCase())
  );

  const { materialTotal, laborTotal, subtotal, markupAmount, total } = calcTotals({
    line_items: lineItems,
    labor_items: laborItems,
    markup_percent: markupPct,
  });

  function addLine() {
    setLineItems([...lineItems, { item_number: "", description: "", quantity: 1, unit_price: 0, unit: "ea" }]); markDirty();
  }
  function updateLine(i: number, field: keyof EstimateLineItem, value: string | number) {
    const updated = [...lineItems];
    (updated[i] as unknown as Record<string, string | number>)[field] = value;
    setLineItems(updated); markDirty();
  }
  function removeLine(i: number) { setLineItems(lineItems.filter((_, idx) => idx !== i)); markDirty(); }

  function addLabor() {
    setLaborItems([...laborItems, { description: "", hours: 0, rate: 60, cost: 0 }]); markDirty();
  }
  function updateLabor(i: number, field: keyof EstimateLaborItem, value: string | number) {
    const updated = [...laborItems];
    (updated[i] as unknown as Record<string, string | number>)[field] = value;
    if (field === "hours" || field === "rate") {
      updated[i].cost = Number(updated[i].hours) * Number(updated[i].rate);
    }
    setLaborItems(updated); markDirty();
  }
  function removeLabor(i: number) { setLaborItems(laborItems.filter((_, idx) => idx !== i)); markDirty(); }

  // Track whether the selected entity is a customer or company
  const [selectedType, setSelectedType] = useState<"customer" | "company" | "">(estimate.customer_id ? "customer" : "");
  const [companyContacts, setCompanyContacts] = useState<{ name: string; email?: string; phone?: string }[]>([]);
  const [contactSuggestions, setContactSuggestions] = useState<{ name: string; email?: string; phone?: string }[]>([]);
  const [showContactSuggestions, setShowContactSuggestions] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);

  // Close contact suggestions on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (contactRef.current && !contactRef.current.contains(e.target as Node)) setShowContactSuggestions(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function handleCustomerSelect(c: SearchResult) {
    if (!c.id) {
      setCustomerId("");
      setCustomerName("");
      setSelectedType("");
      setCompanyContacts([]);
    } else if (c.type === "company") {
      // Company: don't store as customer_id (FK mismatch), just track the name
      setCustomerId("");
      setCustomerName(c.name);
      setSelectedType("company");
      // Load contacts at this company for suggestions
      axiom.from("customers").select("name,email,phone").eq("company_id", c.id).order("name").then(({ data }) => {
        if (data) setCompanyContacts(data);
      });
    } else {
      // Individual customer
      setCustomerId(c.id);
      setCustomerName(c.name);
      setSelectedType("customer");
      setCompanyContacts([]);
    }
    // Don't auto-fill the Contact field — let the user type it
    markDirty();
  }

  function handleContactInput(v: string) {
    setClientName(v);
    markDirty();
    // Show suggestions from company contacts as user types
    if (v.trim() && companyContacts.length > 0) {
      const q = v.toLowerCase();
      const matches = companyContacts.filter((c) => c.name.toLowerCase().includes(q));
      setContactSuggestions(matches);
      setShowContactSuggestions(matches.length > 0);
    } else if (v.trim().length >= 2 && !companyContacts.length) {
      // No company selected — search all customers
      axiom.from("customers").select("name,email,phone").ilike("name", `%${v.trim()}%`).limit(5).then(({ data }) => {
        if (data && data.length > 0) {
          setContactSuggestions(data);
          setShowContactSuggestions(true);
        } else {
          setShowContactSuggestions(false);
        }
      });
    } else {
      setShowContactSuggestions(false);
    }
  }

  function pickContact(c: { name: string; email?: string; phone?: string }) {
    setClientName(c.name);
    setClientEmail(c.email || "");
    setClientPhone(c.phone || "");
    setShowContactSuggestions(false);
    markDirty();
  }

  function save() {
    onUpdate({
      customer_id: customerId || undefined,
      vendor_id: vendorId || undefined,
      vendor_name: vendorName || undefined,
      project_name: projectName,
      client_name: clientName,
      status,
      line_items: lineItems,
      labor_items: laborItems,
      markup_percent: markupPct,
      unit_count: unitCount,
      notes,
    });
    setDirty(false);
    setSaved(true);
  }

  const [wrSending, setWrSending] = useState(false);
  const [wrSent, setWrSent] = useState(!!(estimate as { sent_to_wr_at?: string }).sent_to_wr_at);

  useEffect(() => {
    setWrSent(!!(estimate as { sent_to_wr_at?: string }).sent_to_wr_at);
  }, [estimate]);

  async function sendToWR() {
    if (dirty) save();
    setWrSending(true);
    setWrSent(false);
    try {
      const res = await fetch("/api/send-to-wr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate_id: estimate.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setWrSent(true);
      onUpdate({ sent_to_wr_at: new Date().toISOString() } as Partial<Estimate>);
      await logActivity({
        action: "sent",
        entity: "estimate",
        entity_id: estimate.id,
        label: `Sent estimate ${estimate.estimate_number} to WR Nexus`,
        user_name: detailUserEmail,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send to WR");
    } finally {
      setWrSending(false);
    }
  }

  async function createProject() {
    save();

    // Calculate quoted total from estimate
    const materialsTotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
    const laborTotal = laborItems.reduce((s, li) => s + li.cost, 0);
    const markup = markupPct > 0 ? (materialsTotal + laborTotal) * markupPct / 100 : 0;
    const quotedAmount = materialsTotal + laborTotal + markup;

    // Use captured email/phone, fall back to DB lookup if missing
    let resolvedEmail = clientEmail;
    let resolvedPhone = clientPhone;
    if (customerId && (!resolvedEmail || !resolvedPhone)) {
      const { data: cust } = await axiom.from("customers").select("email,phone").eq("id", customerId).single();
      if (cust) {
        if (!resolvedEmail) resolvedEmail = cust.email || "";
        if (!resolvedPhone) resolvedPhone = cust.phone || "";
      }
    }

    const { data } = await axiom.from("custom_work").insert({
      project_name: projectName || "Untitled Project",
      client_name: clientName || "",
      client_email: resolvedEmail,
      client_phone: resolvedPhone,
      customer_id: customerId || undefined,
      quoted_amount: quotedAmount,
      project_description: notes || undefined,
      status: "new",
    }).select().single();

    if (data) {
      // Link the estimate to the new project
      await axiom.from("estimates").update({ custom_work_id: data.id }).eq("id", estimate.id);
      router.push("/axiom/projects");
    }
  }


  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const newMessages = [...chatMessages, { role: "user" as const, content: text }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    setPendingEstimate(null);
    try {
      const res = await fetch("/api/estimate-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          estimate: { project_name: projectName, client_name: clientName, line_items: lineItems, labor_items: laborItems, markup_percent: markupPct },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChatMessages([...newMessages, { role: "assistant", content: data.message }]);
      if (data.estimateData) setPendingEstimate(data.estimateData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setChatMessages([...newMessages, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  function applyEstimate() {
    if (!pendingEstimate) return;
    setLineItems(pendingEstimate.line_items || []);
    setLaborItems(pendingEstimate.labor_items || []);
    setMarkupPct(pendingEstimate.markup_percent || 0);
    if (pendingEstimate.notes) setNotes(pendingEstimate.notes);
    setPendingEstimate(null);
    markDirty();
    setChatMessages((prev) => [...prev, { role: "assistant", content: "✓ Estimate applied. Review the numbers and make any adjustments, then hit Save." }]);
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <Field label="Project / Description" value={projectName} onChange={(v) => { setProjectName(v); markDirty(); }} />
          <div className="grid grid-cols-2 gap-3">
            <CustomerSearch onSelect={handleCustomerSelect} initialName={customerName} />
            <div ref={contactRef} className="relative">
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Contact</label>
              <input
                value={clientName}
                onChange={(e) => handleContactInput(e.target.value)}
                onFocus={() => { if (companyContacts.length > 0 && !clientName) { setContactSuggestions(companyContacts); setShowContactSuggestions(true); } }}
                placeholder={companyContacts.length > 0 ? "Type to search contacts…" : "Contact name"}
                className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
              />
              {showContactSuggestions && contactSuggestions.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 bg-card border border-border shadow-lg mt-0.5 max-h-40 overflow-y-auto">
                  {contactSuggestions.map((c, i) => (
                    <button key={i} onMouseDown={() => pickContact(c)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-background flex items-center justify-between">
                      <span>{c.name}</span>
                      <span className="text-xs text-muted">{c.email || c.phone || ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xs text-muted font-mono">{estimate.estimate_number}</p>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value as Estimate["status"]); markDirty(); }}
              className="bg-card border border-border px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
            >
              {(["draft", "sent", "accepted", "rejected"] as const).map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Total callout */}
        <div className="bg-card border border-accent/30 p-4 text-right flex-shrink-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Total</p>
          <p className="text-3xl font-mono font-bold text-accent">{money(total)}</p>
        </div>
      </div>

      {/* Materials / Line Items — two-column with vendor catalog */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: line items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs uppercase tracking-wider text-muted">Materials & Line Items</h3>
            <button onClick={addLine} className="text-accent text-xs flex items-center gap-1">
              <Plus size={12} /> Add Custom Item
            </button>
          </div>
          {lineItems.length === 0 ? (
            <p className="text-muted text-sm bg-card border border-border p-4">
              {vendorId ? "Click catalog items to add, or use Add Custom Item." : "Select a vendor to load their catalog, or add custom items manually."}
            </p>
          ) : (
            <div>
              <div className="grid grid-cols-[60px_1fr_60px_90px_50px_75px_28px] gap-1.5 mb-1 px-1">
                {["Item #", "Description", "Qty", "Unit Price", "Unit", "Total", ""].map((h) => (
                  <span key={h} className="text-[10px] uppercase tracking-wider text-muted">{h}</span>
                ))}
              </div>
              <div className="space-y-1.5">
                {lineItems.map((li, i) => (
                  <div key={i} className="grid grid-cols-[60px_1fr_60px_90px_50px_75px_28px] gap-1.5 items-center">
                    <input value={li.item_number} onChange={(e) => updateLine(i, "item_number", e.target.value)} placeholder="—" className="bg-card border border-border px-2 py-2 text-xs text-foreground focus:outline-none focus:border-accent font-mono" />
                    <input value={li.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Description" className="bg-card border border-border px-2 py-2 text-xs text-foreground focus:outline-none focus:border-accent" />
                    <input type="number" value={li.quantity || ""} onChange={(e) => updateLine(i, "quantity", Number(e.target.value))} className="bg-card border border-border px-2 py-2 text-xs text-foreground focus:outline-none focus:border-accent text-right" />
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">$</span>
                      <input type="number" value={li.unit_price || ""} onChange={(e) => updateLine(i, "unit_price", Number(e.target.value))} className="bg-card border border-border pl-4 pr-2 py-2 text-xs text-foreground focus:outline-none focus:border-accent text-right w-full" />
                    </div>
                    <input value={li.unit} onChange={(e) => updateLine(i, "unit", e.target.value)} placeholder="ea" className="bg-card border border-border px-2 py-2 text-xs text-foreground focus:outline-none focus:border-accent" />
                    <span className="text-xs font-mono text-right">{money((li.quantity || 0) * (li.unit_price || 0))}</span>
                    <button onClick={() => removeLine(i)} className="text-muted hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-2">
                <span className="text-sm font-mono text-muted">Materials subtotal: <span className="text-foreground">{money(materialTotal)}</span></span>
              </div>
            </div>
          )}
        </div>

        {/* Right: vendor catalog */}
        <div>
          <div className="mb-3">
            <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Vendor Catalog</label>
            <select
              value={vendorId}
              onChange={(e) => { setVendorId(e.target.value); setCatalogSearch(""); }}
              className="w-full bg-card border border-border px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Select a vendor...</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {vendors.length === 0 && (
              <p className="text-xs text-muted mt-1">No vendors yet. Add one in <a href="/axiom/purchase-orders" className="text-accent underline">Purchase Orders → Vendors</a>.</p>
            )}
          </div>

          {vendorId && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted flex items-center gap-1">
                  <Package size={12} /> {vendorName} ({catalog.length} items)
                </span>
              </div>
              {catalog.length > 0 && (
                <div className="relative mb-2">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Search catalog..." className="w-full bg-card border border-border pl-8 pr-4 py-2 text-xs text-foreground focus:outline-none focus:border-accent" />
                </div>
              )}
              {catalog.length === 0 ? (
                <p className="text-muted text-sm bg-card border border-border p-3">No items in this vendor&apos;s catalog yet.</p>
              ) : (
                <div className="space-y-1 max-h-[320px] overflow-y-auto">
                  {filteredCatalog.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addFromCatalog(item)}
                      className="w-full text-left bg-card border border-border p-2.5 hover:border-accent/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          {item.item_number && <span className="text-[10px] font-mono text-muted mr-1.5">{item.item_number}</span>}
                          <span className="text-sm truncate">{item.description}</span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-mono">{money(item.unit_price)}</span>
                          <span className="text-xs text-muted ml-1">/{item.unit}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {!vendorId && (
            <div className="flex items-center justify-center h-24 text-muted text-sm border border-border bg-card">
              Select a vendor to browse their catalog
            </div>
          )}
        </div>
      </div>

      {/* Labor */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setLaborOpen(!laborOpen)} className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted hover:text-foreground">
            {laborOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Labor
          </button>
          <button onClick={addLabor} className="text-accent text-xs flex items-center gap-1">
            <Plus size={12} /> Add Labor
          </button>
        </div>
        {laborOpen && (
          laborItems.length === 0 ? (
            <p className="text-muted text-sm">No labor entries — click Add Labor.</p>
          ) : (
            <div>
              <div className="grid grid-cols-[1fr_80px_80px_90px_28px] gap-2 mb-1 px-1">
                {["Description", "Hours", "Rate", "Cost", ""].map((h) => (
                  <span key={h} className="text-[10px] uppercase tracking-wider text-muted">{h}</span>
                ))}
              </div>
              <div className="space-y-1.5">
                {laborItems.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_80px_90px_28px] gap-2 items-center">
                    <input value={l.description} onChange={(e) => updateLabor(i, "description", e.target.value)} placeholder="Description" className="bg-card border border-border px-2 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
                    <input type="number" value={l.hours || ""} onChange={(e) => updateLabor(i, "hours", Number(e.target.value))} placeholder="hrs" className="bg-card border border-border px-2 py-2 text-sm text-foreground focus:outline-none focus:border-accent text-right" />
                    <input type="number" value={l.rate || ""} onChange={(e) => updateLabor(i, "rate", Number(e.target.value))} placeholder="$/hr" className="bg-card border border-border px-2 py-2 text-sm text-foreground focus:outline-none focus:border-accent text-right" />
                    <span className="text-sm font-mono text-right">{money(l.cost || 0)}</span>
                    <button onClick={() => removeLabor(i)} className="text-muted hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-2">
                <span className="text-sm font-mono text-muted">Labor subtotal: <span className="text-foreground">{money(laborTotal)}</span></span>
              </div>
            </div>
          )
        )}
      </div>

      {/* Markup + Totals */}
      <div className="bg-card border border-border p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted mb-4">Markup & Totals</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          <div>
            <span className="text-muted block text-xs mb-1">Materials</span>
            <span className="font-mono">{money(materialTotal)}</span>
          </div>
          <div>
            <span className="text-muted block text-xs mb-1">Labor</span>
            <span className="font-mono">{money(laborTotal)}</span>
          </div>
          <div>
            <span className="text-muted block text-xs mb-1">Subtotal</span>
            <span className="font-mono">{money(subtotal)}</span>
          </div>
          <div>
            <span className="text-muted block text-xs mb-1">Markup</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={markupPct || ""}
                onChange={(e) => { setMarkupPct(Number(e.target.value)); markDirty(); }}
                placeholder="0"
                className="w-16 bg-background border border-border px-2 py-1 text-sm text-foreground focus:outline-none focus:border-accent text-right font-mono"
              />
              <span className="text-muted text-sm">%</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-4 text-sm text-muted">
            {markupPct > 0 && <span>+ {money(markupAmount)} markup ({pct(markupPct)})</span>}
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-muted"># Units</span>
              <input
                type="number"
                min={1}
                value={unitCount}
                onChange={(e) => { setUnitCount(Math.max(1, parseInt(e.target.value) || 1)); markDirty(); }}
                className="w-14 bg-background border border-border px-2 py-1 text-sm text-foreground focus:outline-none focus:border-accent text-center font-mono"
              />
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs uppercase tracking-wider text-muted mr-3">Grand Total</span>
            <span className="text-2xl font-mono font-bold text-accent">{money(total)}</span>
            {unitCount > 1 && (
              <span className="block text-sm font-mono text-muted mt-1">
                {money(total / unitCount)} / unit
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Notes</label>
        <textarea value={notes} onChange={(e) => { setNotes(e.target.value); markDirty(); }} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[80px] resize-y" />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-border flex-wrap items-center">
        <SaveButton dirty={dirty} saved={saved} onClick={save} />
        <div className="flex flex-col gap-0.5">
          <Button variant="outline" onClick={createProject} disabled={status !== "accepted"}>
            <Hammer size={14} className="mr-1" /> Send to Project
          </Button>
          {status !== "accepted" && (
            <p className="text-[10px] text-muted text-center">Mark as Accepted to enable</p>
          )}
        </div>
        <button
          onClick={sendToWR}
          disabled={wrSending}
          className={`flex items-center gap-2 px-3 py-2 border text-sm transition-colors ${
            wrSent
              ? "border-green-500/50 text-green-400 bg-green-500/10"
              : "border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
          }`}
        >
          {wrSending ? (
            <><Loader2 size={14} className="animate-spin" /> Sending...</>
          ) : wrSent ? (
            <><CheckCircle2 size={14} /> Sent to WR</>
          ) : (
            <><ExternalLink size={14} /> Send to WR Nexus</>
          )}
        </button>
        <button
          onClick={() => setChatOpen(true)}
          className="flex items-center gap-2 px-3 py-2 border border-accent/50 text-accent text-sm hover:bg-accent/10 transition-colors"
        >
          <Sparkles size={14} /> Ask Claude
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-red-500 text-sm">Delete this estimate?</span>
            <Button variant="outline" size="sm" onClick={onDelete}>Yes, Delete</Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-muted hover:text-red-500 text-sm flex items-center gap-1 ml-auto">
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>

      {showLoadQuote && (
        <LoadQuoteModal
          total={total}
          currentProjectId={estimate.custom_work_id}
          onClose={() => setShowLoadQuote(false)}
          onLoad={async (projectId) => {
            await axiom.from("custom_work").update({ quoted_amount: total, updated_at: new Date().toISOString() }).eq("id", projectId);
            await axiom.from("estimates").update({ custom_work_id: projectId, status: "accepted", updated_at: new Date().toISOString() }).eq("id", estimate.id);
            setStatus("accepted");
            setShowLoadQuote(false);
          }}
        />
      )}

      {/* ── Claude chat drawer ── */}
      {chatOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setChatOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l border-border z-50 flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-accent" />
                <span className="font-semibold text-sm">Claude — AI Estimator</span>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-muted hover:text-foreground"><X size={18} /></button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {chatMessages.length === 0 && (
                <div className="text-center py-12 space-y-3">
                  <Sparkles size={32} className="text-accent/40 mx-auto" />
                  <p className="text-muted text-sm">Describe the project and I&apos;ll build the estimate.</p>
                  <div className="space-y-1 text-xs text-muted/60">
                    <p>Try: &quot;Steel and walnut dining table, 8ft, powder coat base&quot;</p>
                    <p>Or: &quot;Built-in bookcase, white oak, 10ft wide, floor to ceiling&quot;</p>
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] px-3 py-2 text-sm rounded",
                    msg.role === "user"
                      ? "bg-accent text-white"
                      : "bg-card border border-border text-foreground"
                  )}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border px-3 py-2 rounded flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-accent" />
                    <span className="text-sm text-muted">Thinking…</span>
                  </div>
                </div>
              )}
              {/* Apply estimate button */}
              {pendingEstimate && (
                <div className="bg-accent/10 border border-accent/30 rounded p-3 space-y-2">
                  <p className="text-sm font-medium text-accent">Estimate ready</p>
                  <p className="text-xs text-muted">
                    {pendingEstimate.line_items?.length || 0} materials · {pendingEstimate.labor_items?.length || 0} labor items · {pendingEstimate.markup_percent || 0}% markup
                  </p>
                  <button
                    onClick={applyEstimate}
                    className="w-full bg-accent text-white py-2 text-sm font-medium hover:bg-accent/80 transition-colors"
                  >
                    Apply to Estimate
                  </button>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <div className="flex gap-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="Describe the project…"
                  className="flex-1 bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent resize-none min-h-[42px] max-h-32"
                  rows={1}
                  disabled={chatLoading}
                />
                <button
                  onClick={sendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="bg-accent text-white px-3 py-2 hover:bg-accent/80 disabled:opacity-40 transition-colors shrink-0"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-xs text-muted mt-1.5">Enter to send · Shift+Enter for new line</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Load into Quote modal ─────────────────────────────────────

function LoadQuoteModal({ total, currentProjectId, onClose, onLoad }: {
  total: number;
  currentProjectId?: string;
  onClose: () => void;
  onLoad: (projectId: string) => Promise<void>;
}) {
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axiom.from("custom_work").select("id,project_name,client_name,status").neq("status", "complete").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setProjects(data as CustomWork[]);
    });
  }, []);

  async function handleLoad() {
    if (!projectId) return;
    setLoading(true);
    await onLoad(projectId);
    setLoading(false);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-bold">Load into Quote</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={18} /></button>
        </div>
        <p className="text-sm text-muted mb-4">
          This will set the quoted amount on the selected project to <span className="text-accent font-mono font-bold">{money(total)}</span>.
        </p>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent">
            <option value="">Select a project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_name}{p.client_name ? ` — ${p.client_name}` : ""}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleLoad} disabled={!projectId || loading}>{loading ? "Loading..." : "Apply"}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </>
  );
}

// ── Reusable field ────────────────────────────────────────────

function Field({ label, value, onChange, required }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">
        {label}{required && <span className="text-accent ml-1">*</span>}
      </label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
    </div>
  );
}
