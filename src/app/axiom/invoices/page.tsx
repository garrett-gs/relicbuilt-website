"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Invoice, InvoiceLineItem, Payment, Settings } from "@/types/axiom";
import Button from "@/components/ui/Button";
import SaveButton from "@/components/ui/SaveButton";
import { cn, formatPhone } from "@/lib/utils";
import { Plus, X, Trash2, Printer, DollarSign, Send, CheckCircle, Eye, Search } from "lucide-react";
import { useRef } from "react";

interface Customer { id: string; name: string; email?: string; phone?: string; }
import { generateInvoiceHtml } from "@/lib/invoice-html";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d?: string) {
  return d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";
}

function invoiceSubtotal(inv: Invoice) {
  if (inv.line_items && inv.line_items.length > 0)
    return inv.line_items.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  return (inv.subtotal || 0) + (inv.delivery_fee || 0);
}

function calcTotal(inv: Invoice) {
  const sub = invoiceSubtotal(inv);
  const taxable = sub - (inv.discount || 0);
  return taxable + taxable * ((inv.tax_rate || 0) / 100);
}

function calcPaid(inv: Invoice) {
  return (inv.payments || []).reduce((s, p) => s + p.amount, 0);
}

function calcStatus(inv: Invoice): "unpaid" | "partial" | "paid" {
  const paid = calcPaid(inv);
  const total = calcTotal(inv);
  if (paid >= total && total > 0) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

const statusColors = { unpaid: "#ef4444", partial: "#f59e0b", paid: "#22c55e" };
const METHODS = ["Credit Card", "Cash", "Check", "Venmo", "Zelle", "Bank Transfer", "Other"];

function genInvoiceNum() {
  const y = new Date().getFullYear();
  return `INV-${y}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const { userEmail } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async () => {
    const { data } = await axiom.from("invoices").select("*").order("created_at", { ascending: false });
    if (data) setInvoices(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createInvoice(form: {
    client_name: string; client_email: string; client_phone: string;
    description: string; reference_number: string;
    issued_date: string; due_date: string; tax_rate: number;
  }) {
    const { data } = await axiom.from("invoices").insert({
      invoice_number: genInvoiceNum(),
      client_name: form.client_name, client_email: form.client_email,
      client_phone: form.client_phone, description: form.description,
      reference_number: form.reference_number,
      subtotal: 0, delivery_fee: 0, discount: 0,
      tax_rate: form.tax_rate || 8.75,
      issued_date: form.issued_date || new Date().toISOString().split("T")[0],
      due_date: form.due_date, line_items: [],
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "invoice", entity_id: data.id, label: `Created invoice ${data.invoice_number} for ${data.client_name}`, user_name: userEmail });
      setInvoices((p) => [data, ...p]);
      setShowCreate(false);
      setSelected(data);
    }
  }

  async function deleteInvoice(id: string) {
    await axiom.from("invoices").delete().eq("id", id);
    setSelected(null);
    load();
  }

  function handleUpdate(updated: Invoice) {
    setSelected(updated);
    setInvoices((p) => p.map((i) => (i.id === updated.id ? updated : i)));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Invoices</h1>
          <p className="text-muted text-sm mt-1">{invoices.length} total</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} className="mr-1" />New Invoice</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Outstanding</p>
          <p className="text-xl font-mono font-bold text-red-400">{money(invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + calcTotal(i) - calcPaid(i), 0))}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Collected</p>
          <p className="text-xl font-mono font-bold text-green-400">{money(invoices.reduce((s, i) => s + calcPaid(i), 0))}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Unpaid Count</p>
          <p className="text-xl font-mono font-bold">{invoices.filter((i) => i.status !== "paid").length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-border">
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const total = calcTotal(inv); const paid = calcPaid(inv); const status = calcStatus(inv);
              return (
                <tr key={inv.id} onClick={() => setSelected(inv)} className="border-b border-border/50 cursor-pointer hover:bg-background/50">
                  <td className="px-4 py-3 font-mono">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.client_name}</td>
                  <td className="px-4 py-3 text-muted">{inv.issued_date || "—"}</td>
                  <td className="px-4 py-3 text-muted">{inv.due_date || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{money(total)}</td>
                  <td className="px-4 py-3 text-right font-mono">{money(total - paid)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: statusColors[status] + "20", color: statusColors[status] }}>{status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {invoices.length === 0 && <p className="text-center py-8 text-muted text-sm">No invoices yet</p>}
      </div>

      {/* Create modal */}
      {showCreate && (
        <SlideModal title="New Invoice" onClose={() => setShowCreate(false)}>
          <CreateInvoiceForm onSubmit={createInvoice} onCancel={() => setShowCreate(false)} />
        </SlideModal>
      )}

      {/* Detail modal */}
      {selected && !showPreview && (
        <SlideModal title={selected.invoice_number} onClose={() => { setSelected(null); load(); }} wide>
          <InvoiceDetail
            invoice={selected}
            onDelete={() => deleteInvoice(selected.id)}
            onPreview={() => setShowPreview(true)}
            onUpdate={handleUpdate}
            userEmail={userEmail}
          />
        </SlideModal>
      )}

      {/* Full-screen preview */}
      {showPreview && selected && (
        <InvoicePreview
          invoice={selected}
          onClose={() => setShowPreview(false)}
          userEmail={userEmail}
        />
      )}
    </div>
  );
}

// ── Slide modal shell ──────────────────────────────────────────────────────────

function SlideModal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className={cn("fixed top-4 bottom-4 right-4 z-50 bg-background border border-border overflow-y-auto", wide ? "left-4 md:left-[10%]" : "left-4 md:left-[30%]")}>
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-heading font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </>
  );
}

// ── Customer search dropdown ───────────────────────────────────────────────────

function CustomerSearch({ onSelect }: { onSelect: (c: Customer) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

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
    onSelect({} as Customer);
  }

  return (
    <div ref={ref} className="relative">
      <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Customer</label>
      <div className="flex items-center gap-2">
        {selectedName ? (
          <span className="flex items-center gap-1 bg-accent/10 text-accent text-sm px-3 py-2 border border-accent/30 flex-1 truncate">
            {selectedName}
            <button onClick={clear} className="ml-1 hover:text-foreground"><X size={12} /></button>
          </span>
        ) : (
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search customers…"
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

// ── Create form ────────────────────────────────────────────────────────────────

function CreateInvoiceForm({ onSubmit, onCancel }: {
  onSubmit: (f: { client_name: string; client_email: string; client_phone: string; description: string; reference_number: string; issued_date: string; due_date: string; tax_rate: number }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ client_name: "", client_email: "", client_phone: "", description: "", reference_number: "", tax_rate: "8.75", issued_date: new Date().toISOString().split("T")[0], due_date: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const inp = "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
  const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";

  function handleCustomerSelect(c: Customer) {
    if (!c.id) {
      setForm((f) => ({ ...f, client_name: "", client_email: "", client_phone: "" }));
    } else {
      setForm((f) => ({ ...f, client_name: c.name, client_email: c.email || "", client_phone: formatPhone(c.phone || "") }));
    }
  }

  return (
    <div className="space-y-4">
      <CustomerSearch onSelect={handleCustomerSelect} />
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>Client Name *</label><input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Client Email</label><input type="email" value={form.client_email} onChange={(e) => set("client_email", e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Client Phone</label><input type="tel" value={form.client_phone} onChange={(e) => set("client_phone", formatPhone(e.target.value))} placeholder="(###) ###-####" className={inp} /></div>
        <div><label className={lbl}>P.O. / Reference #</label><input value={form.reference_number} onChange={(e) => set("reference_number", e.target.value)} className={inp} /></div>
      </div>
      <div><label className={lbl}>Project / Description</label><input value={form.description} onChange={(e) => set("description", e.target.value)} className={inp} /></div>
      <div className="grid grid-cols-3 gap-4">
        <div><label className={lbl}>Issued Date</label><input type="date" value={form.issued_date} onChange={(e) => set("issued_date", e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Due Date</label><input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Tax Rate %</label><input type="number" value={form.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} className={inp} /></div>
      </div>
      <p className="text-xs text-muted">Line items are added after creating the invoice.</p>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit({ ...form, tax_rate: Number(form.tax_rate) })} disabled={!form.client_name}>Create Invoice</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Invoice detail (edit panel) ────────────────────────────────────────────────

function InvoiceDetail({ invoice: init, onDelete, onPreview, onUpdate, userEmail }: {
  invoice: Invoice; onDelete: () => void; onPreview: () => void; onUpdate: (inv: Invoice) => void; userEmail: string;
}) {
  const [inv, setInv] = useState<Invoice>(init);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    axiom.from("settings").select("categories").limit(1).single().then(({ data }) => {
      if (data?.categories) setCategories(data.categories || []);
    });
  }, []);

  function mark(updates: Partial<Invoice>) { setInv((i) => ({ ...i, ...updates })); setDirty(true); setSaved(false); }
  function addLine() { mark({ line_items: [...(inv.line_items || []), { category: "", description: "", quantity: 1, unit_price: 0 }] }); }
  function updateLine(idx: number, field: keyof InvoiceLineItem, value: string | number) {
    const items = [...(inv.line_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    mark({ line_items: items });
  }
  function removeLine(idx: number) { mark({ line_items: (inv.line_items || []).filter((_, i) => i !== idx) }); }

  const lineItems = inv.line_items || [];
  const subtotal = lineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const taxable = subtotal - (inv.discount || 0);
  const taxAmt = taxable * ((inv.tax_rate || 0) / 100);
  const total = taxable + taxAmt;
  const paid = calcPaid(inv);
  const balance = total - paid;

  async function save() {
    const updated: Invoice = { ...inv, subtotal, updated_at: new Date().toISOString() };
    await axiom.from("invoices").update(updated).eq("id", inv.id);
    setInv(updated); setDirty(false); setSaved(true); onUpdate(updated);
  }

  async function addPayment(payment: Payment) {
    const payments = [...(inv.payments || []), payment];
    const newPaid = payments.reduce((s, p) => s + p.amount, 0);
    const newStatus: Invoice["status"] = newPaid >= total && total > 0 ? "paid" : newPaid > 0 ? "partial" : "unpaid";
    const updated: Invoice = { ...inv, payments, status: newStatus, updated_at: new Date().toISOString() };
    await axiom.from("invoices").update({ payments, status: newStatus, updated_at: updated.updated_at }).eq("id", inv.id);
    await logActivity({ action: "updated", entity: "invoice", entity_id: inv.id, label: `Recorded ${money(payment.amount)} payment on ${inv.invoice_number}`, user_name: userEmail });
    setInv(updated); setShowPayment(false); onUpdate(updated);
  }

  const inp = "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
  const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";

  return (
    <div className="space-y-6">
      {/* Client info */}
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>Client Name</label><input value={inv.client_name} onChange={(e) => mark({ client_name: e.target.value })} className={inp} /></div>
        <div><label className={lbl}>Email</label><input type="email" value={inv.client_email || ""} onChange={(e) => mark({ client_email: e.target.value })} className={inp} /></div>
        <div><label className={lbl}>Phone</label><input type="tel" value={inv.client_phone || ""} onChange={(e) => mark({ client_phone: formatPhone(e.target.value) })} placeholder="(###) ###-####" className={inp} /></div>
        <div><label className={lbl}>P.O. / Reference #</label><input value={inv.reference_number || ""} onChange={(e) => mark({ reference_number: e.target.value })} className={inp} /></div>
        <div><label className={lbl}>Issued Date</label><input type="date" value={inv.issued_date || ""} onChange={(e) => mark({ issued_date: e.target.value })} className={inp} /></div>
        <div><label className={lbl}>Due Date</label><input type="date" value={inv.due_date || ""} onChange={(e) => mark({ due_date: e.target.value })} className={inp} /></div>
      </div>
      <div><label className={lbl}>Description / Project Name</label><input value={inv.description || ""} onChange={(e) => mark({ description: e.target.value })} className={inp} /></div>

      {/* Line items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Line Items</h3>
          <button onClick={addLine} className="text-accent text-sm flex items-center gap-1"><Plus size={14} /> Add Item</button>
        </div>
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted bg-card border-b border-border">
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right w-20">Qty</th>
                <th className="px-3 py-2 text-right w-32">Unit Price</th>
                <th className="px-3 py-2 text-right w-28">Total</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, i) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="px-2 py-1.5 min-w-[120px]">
                    {categories.length > 0 ? (
                      <select value={li.category} onChange={(e) => updateLine(i, "category", e.target.value)} className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent">
                        <option value="">—</option>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input value={li.category} onChange={(e) => updateLine(i, "category", e.target.value)} placeholder="Category" className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent" />
                    )}
                  </td>
                  <td className="px-2 py-1.5 min-w-[180px]">
                    <input value={li.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Description" className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" value={li.quantity} onChange={(e) => updateLine(i, "quantity", Number(e.target.value))} className="w-full bg-background border border-border px-2 py-1.5 text-sm text-right font-mono text-foreground focus:outline-none focus:border-accent" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" value={li.unit_price} onChange={(e) => updateLine(i, "unit_price", Number(e.target.value))} className="w-full bg-background border border-border px-2 py-1.5 text-sm text-right font-mono text-foreground focus:outline-none focus:border-accent" />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-sm">{money((li.quantity || 0) * (li.unit_price || 0))}</td>
                  <td className="px-2 py-1.5"><button onClick={() => removeLine(i)} className="text-muted hover:text-red-500"><X size={14} /></button></td>
                </tr>
              ))}
              {lineItems.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted text-sm">No items yet — <button onClick={addLine} className="text-accent hover:underline">add the first line</button></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {lineItems.length > 0 && (
          <button onClick={addLine} className="mt-2 text-accent text-sm flex items-center gap-1"><Plus size={14} /> Add Line Item</button>
        )}
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-72 space-y-1 text-sm">
          <div className="flex justify-between py-1.5"><span className="text-muted">Subtotal</span><span className="font-mono">{money(subtotal)}</span></div>
          <div className="flex justify-between items-center py-1">
            <span className="text-muted">Discount ($)</span>
            <input type="number" value={inv.discount || ""} onChange={(e) => mark({ discount: Number(e.target.value) || 0 })} placeholder="0.00" className="w-28 bg-card border border-border px-2 py-1 text-sm text-right font-mono text-foreground focus:outline-none focus:border-accent" />
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-muted">Tax Rate (%)</span>
            <input type="number" value={inv.tax_rate || ""} onChange={(e) => mark({ tax_rate: Number(e.target.value) || 0 })} placeholder="0.00" className="w-28 bg-card border border-border px-2 py-1 text-sm text-right font-mono text-foreground focus:outline-none focus:border-accent" />
          </div>
          <div className="flex justify-between py-1.5"><span className="text-muted">Tax Amount</span><span className="font-mono">{money(taxAmt)}</span></div>
          <div className="border-t border-border pt-2 flex justify-between font-bold text-base"><span>Total</span><span className="font-mono">{money(total)}</span></div>
          {paid > 0 && <>
            <div className="flex justify-between py-1"><span className="text-green-500">Paid</span><span className="font-mono text-green-500">{money(paid)}</span></div>
            <div className="flex justify-between font-bold border-t border-border pt-1"><span>Balance Due</span><span className="font-mono" style={{ color: balance > 0 ? "#ef4444" : "#22c55e" }}>{money(balance)}</span></div>
          </>}
        </div>
      </div>

      {/* Payment history */}
      {(inv.payments || []).length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Payment History</h3>
          <div className="space-y-1">
            {inv.payments.map((p, i) => (
              <div key={i} className="bg-card border border-border p-2 flex justify-between text-sm">
                <span className="text-muted">{p.method} · {p.date}{p.ref ? ` · Ref: ${p.ref}` : ""}{p.note ? ` — ${p.note}` : ""}</span>
                <span className="font-mono text-green-500">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap gap-3 items-center border-t border-border pt-4">
        <SaveButton dirty={dirty} saved={saved} onClick={save} size="sm" />
        <Button onClick={() => setShowPayment(true)} size="sm" variant="outline"><DollarSign size={14} className="mr-1" />Record Payment</Button>
        <Button variant="outline" size="sm" onClick={onPreview}><Eye size={14} className="mr-1" />Preview / Print</Button>
        <button onClick={onDelete} className="text-muted hover:text-red-500 ml-auto"><Trash2 size={14} /></button>
      </div>

      {/* Payment modal */}
      {showPayment && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60]" onClick={() => setShowPayment(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border p-6 z-[60]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold">Record Payment</h3>
              <button onClick={() => setShowPayment(false)} className="text-muted hover:text-foreground"><X size={18} /></button>
            </div>
            <PaymentForm invoice={inv} total={total} onSubmit={addPayment} onCancel={() => setShowPayment(false)} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Payment form ───────────────────────────────────────────────────────────────

function PaymentForm({ invoice, total, onSubmit, onCancel }: { invoice: Invoice; total: number; onSubmit: (p: Payment) => void; onCancel: () => void }) {
  const paid = calcPaid(invoice);
  const balance = total - paid;
  const [amount, setAmount] = useState(balance > 0 ? balance.toFixed(2) : "");
  const [method, setMethod] = useState("Credit Card");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const inp = "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
  const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Balance due: <span className="font-mono text-foreground">{money(balance)}</span></p>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>Amount *</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inp}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Reference #</label><input value={ref} onChange={(e) => setRef(e.target.value)} className={inp} /></div>
      </div>
      <div><label className={lbl}>Note</label><input value={note} onChange={(e) => setNote(e.target.value)} className={inp} /></div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit({ amount: Number(amount), method, date, note, ref, created_at: new Date().toISOString() })} disabled={!amount}>Record Payment</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Full-screen preview ────────────────────────────────────────────────────────

function InvoicePreview({ invoice, onClose, userEmail }: { invoice: Invoice; onClose: () => void; userEmail: string }) {
  const [bizSettings, setBizSettings] = useState<Partial<Settings> | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [sendTo, setSendTo] = useState(invoice.client_email || "");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    axiom.from("settings").select("biz_name,biz_email,biz_phone,biz_address,biz_city,biz_state,biz_zip,terms_text").limit(1).single()
      .then(({ data }) => setBizSettings(data || {}));
  }, []);

  const lineItems = invoice.line_items || [];
  const subtotal = lineItems.length > 0
    ? lineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0)
    : (invoice.subtotal || 0) + (invoice.delivery_fee || 0);
  const discountAmt = invoice.discount || 0;
  const taxable = subtotal - discountAmt;
  const taxAmt = taxable * ((invoice.tax_rate || 0) / 100);
  const total = taxable + taxAmt;
  const paid = calcPaid(invoice);
  const balance = total - paid;
  const amountDue = balance > 0 ? balance : total;

  async function handleSend() {
    if (!sendTo || !bizSettings) return;
    setSending(true); setSendResult(null);
    try {
      const html = generateInvoiceHtml(invoice, bizSettings.terms_text || "", true, bizSettings);
      const res = await fetch("/api/send-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: sendTo, subject: `Invoice ${invoice.invoice_number} from RELIC Custom Fabrications`, html, from_name: "RELIC Custom Fabrications" }),
      });
      setSendResult(res.ok ? "success" : "error");
      if (res.ok) { setShowEmailForm(false); }
    } catch { setSendResult("error"); }
    setSending(false);
  }

  if (!bizSettings) {
    return <div className="fixed inset-0 bg-gray-100 z-[100] flex items-center justify-center text-gray-500 text-sm">Loading preview…</div>;
  }

  const biz = bizSettings;
  const addressLine2 = [biz.biz_city, biz.biz_state, biz.biz_zip].filter(Boolean).join(", ");

  return (
    <div className="fixed inset-0 bg-gray-100 z-[100] overflow-auto">

      {/* Toolbar */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium">
          <X size={16} /> Close Preview
        </button>
        <div className="flex-1" />

        {/* Email form (inline in toolbar) */}
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
        {sendResult === "error" && !showEmailForm && (
          <span className="text-red-500 text-sm">Send failed — try again</span>
        )}

        {!showEmailForm && (
          <button
            onClick={() => { setShowEmailForm(true); setSendResult(null); setSendTo(invoice.client_email || ""); }}
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

      {/* Invoice document — no outer box, full-width sections */}
      <div className="max-w-4xl mx-auto my-8 bg-white print:my-0 print:max-w-none print:shadow-none shadow-sm">

        {/* Header */}
        <div className="flex justify-between items-start px-10 pt-10 pb-8 print:px-8 print:pt-8">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-full.png" alt="RELIC Custom Fabrications" className="h-20 object-contain object-left print:h-16" />
          </div>
          <div className="text-right">
            <h1 className="text-4xl font-bold text-gray-900 mb-3 tracking-wide">INVOICE</h1>
            {biz.biz_name && <p className="text-sm font-semibold text-gray-800">{biz.biz_name}</p>}
            {biz.biz_address && <p className="text-xs text-gray-500 mt-0.5">{biz.biz_address}</p>}
            {addressLine2 && <p className="text-xs text-gray-500">{addressLine2}</p>}
            {(biz.biz_state || biz.biz_city) && <p className="text-xs text-gray-500">United States</p>}
            {biz.biz_phone && <p className="text-xs text-gray-500 mt-1">{biz.biz_phone}</p>}
            <p className="text-xs text-gray-500">relicbuilt.com</p>
          </div>
        </div>

        {/* Thin rule */}
        <div className="mx-10 border-t border-gray-200 print:mx-8" />

        {/* Bill To / Invoice meta — no box */}
        <div className="grid grid-cols-2 gap-10 px-10 py-8 print:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "#c4a24d" }}>Bill To</p>
            <p className="font-bold text-gray-900 text-base">{invoice.client_name}</p>
            {invoice.client_phone && <p className="text-sm text-gray-600 mt-1">{invoice.client_phone}</p>}
            {invoice.client_email && <p className="text-sm text-gray-600 mt-0.5">{invoice.client_email}</p>}
            {invoice.description && <p className="text-sm text-gray-500 mt-2">{invoice.description}</p>}
          </div>
          <div>
            <div className="space-y-2 text-sm mb-5">
              <div className="flex justify-between"><span className="font-semibold text-gray-500">Invoice Number:</span><span className="font-bold">{invoice.invoice_number}</span></div>
              {invoice.reference_number && <div className="flex justify-between"><span className="font-semibold text-gray-500">P.O./S.O. Number:</span><span>{invoice.reference_number}</span></div>}
              {invoice.issued_date && <div className="flex justify-between"><span className="font-semibold text-gray-500">Invoice Date:</span><span>{fmtDate(invoice.issued_date)}</span></div>}
              {invoice.due_date && <div className="flex justify-between"><span className="font-semibold text-gray-500">Payment Due:</span><span>{fmtDate(invoice.due_date)}</span></div>}
            </div>
            <div className="bg-gray-100 px-4 py-3 flex justify-between font-bold text-sm">
              <span>Amount Due (USD):</span>
              <span className="font-mono">{money(amountDue)}</span>
            </div>
          </div>
        </div>

        {/* Gold Items bar — full width */}
        <div className="px-10 py-3 print:px-8" style={{ background: "#8b6914" }}>
          <p className="text-sm font-bold text-white uppercase tracking-widest">Items</p>
        </div>

        {/* Line items — single row per item, no outer border */}
        {lineItems.length > 0 ? lineItems.map((li, i) => (
          <div key={i} className="flex items-center justify-between px-10 py-4 border-b border-gray-100 last:border-0 print:px-8">
            <div className="flex items-center gap-3 flex-1 min-w-0 mr-8">
              {li.category && <span className="font-bold text-gray-900 shrink-0">{li.category}</span>}
              {li.category && li.description && <span className="text-gray-300 shrink-0">—</span>}
              {li.description && <span className="text-gray-700 truncate">{li.description}</span>}
              {!li.category && !li.description && <span className="text-gray-400 italic">—</span>}
            </div>
            <span className="font-bold font-mono text-gray-900 shrink-0">{money((li.quantity || 0) * (li.unit_price || 0))}</span>
          </div>
        )) : (
          <div className="px-10 py-8 text-gray-400 text-sm text-center print:px-8">No line items added yet</div>
        )}

        {/* Thin rule before totals */}
        <div className="mx-10 border-t border-gray-200 mt-2 print:mx-8" />

        {/* Totals — no outer border */}
        <div className="flex justify-end px-10 py-8 print:px-8">
          <div className="w-80 text-sm space-y-2">
            {(discountAmt > 0 || invoice.tax_rate > 0) && (
              <div className="flex justify-between text-gray-500"><span>Subtotal:</span><span className="font-mono">{money(subtotal)}</span></div>
            )}
            {discountAmt > 0 && (
              <div className="flex justify-between text-gray-500"><span>Discount:</span><span className="font-mono text-green-600">-{money(discountAmt)}</span></div>
            )}
            {invoice.tax_rate > 0 && (
              <div className="flex justify-between text-gray-500"><span>Tax ({invoice.tax_rate}%):</span><span className="font-mono">{money(taxAmt)}</span></div>
            )}
            <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>Total:</span><span className="font-mono">{money(total)}</span>
            </div>
            {paid > 0 && (
              <div className="flex justify-between text-green-600"><span>Paid:</span><span className="font-mono">{money(paid)}</span></div>
            )}
            <div className="bg-gray-100 px-4 py-3 flex justify-between font-bold mt-1">
              <span>Amount Due (USD):</span>
              <span className="font-mono" style={{ color: balance > 0 ? "#111" : "#22c55e" }}>{money(amountDue)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        {biz.terms_text && (
          <div className="px-10 pb-8 pt-0 border-t border-gray-100 print:px-8">
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
