"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Invoice, InvoiceLineItem, Payment } from "@/types/axiom";
import Button from "@/components/ui/Button";
import SaveButton from "@/components/ui/SaveButton";
import { cn } from "@/lib/utils";
import { Plus, X, Trash2, Printer, DollarSign, Send, CheckCircle } from "lucide-react";
import { generateInvoiceHtml } from "@/lib/invoice-html";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function invoiceSubtotal(inv: Invoice) {
  if (inv.line_items && inv.line_items.length > 0) {
    return inv.line_items.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  }
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
  const n = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}-${n}`;
}

export default function InvoicesPage() {
  const { userEmail } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [showPrint, setShowPrint] = useState(false);

  const load = useCallback(async () => {
    const { data } = await axiom.from("invoices").select("*").order("created_at", { ascending: false });
    if (data) setInvoices(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createInvoice(form: {
    client_name: string;
    client_email: string;
    description: string;
    issued_date: string;
    due_date: string;
    tax_rate: number;
  }) {
    const { data } = await axiom
      .from("invoices")
      .insert({
        invoice_number: genInvoiceNum(),
        client_name: form.client_name,
        client_email: form.client_email,
        description: form.description,
        subtotal: 0,
        delivery_fee: 0,
        discount: 0,
        tax_rate: form.tax_rate || 8.75,
        issued_date: form.issued_date || new Date().toISOString().split("T")[0],
        due_date: form.due_date,
        line_items: [],
      })
      .select()
      .single();
    if (data) {
      await logActivity({
        action: "created",
        entity: "invoice",
        entity_id: data.id,
        label: `Created invoice ${data.invoice_number} for ${data.client_name}`,
        user_name: userEmail,
      });
      setInvoices((prev) => [data, ...prev]);
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
    setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Invoices</h1>
          <p className="text-muted text-sm mt-1">{invoices.length} total</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={14} className="mr-1" /> New Invoice
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Outstanding</p>
          <p className="text-xl font-mono font-bold text-red-400">
            {money(invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + calcTotal(i) - calcPaid(i), 0))}
          </p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Collected</p>
          <p className="text-xl font-mono font-bold text-green-400">
            {money(invoices.reduce((s, i) => s + calcPaid(i), 0))}
          </p>
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
              const total = calcTotal(inv);
              const paid = calcPaid(inv);
              const status = calcStatus(inv);
              return (
                <tr
                  key={inv.id}
                  onClick={() => setSelected(inv)}
                  className="border-b border-border/50 cursor-pointer hover:bg-background/50"
                >
                  <td className="px-4 py-3 font-mono">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.client_name}</td>
                  <td className="px-4 py-3 text-muted">{inv.issued_date || "—"}</td>
                  <td className="px-4 py-3 text-muted">{inv.due_date || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{money(total)}</td>
                  <td className="px-4 py-3 text-right font-mono">{money(total - paid)}</td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: statusColors[status] + "20", color: statusColors[status] }}
                    >
                      {status}
                    </span>
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
        <InvoiceModal title="New Invoice" onClose={() => setShowCreate(false)}>
          <CreateInvoiceForm onSubmit={createInvoice} onCancel={() => setShowCreate(false)} />
        </InvoiceModal>
      )}

      {/* Detail modal */}
      {selected && !showPrint && (
        <InvoiceModal
          title={selected.invoice_number}
          onClose={() => { setSelected(null); load(); }}
          wide
        >
          <InvoiceDetail
            invoice={selected}
            onDelete={() => deleteInvoice(selected.id)}
            onPrint={() => setShowPrint(true)}
            onUpdate={handleUpdate}
            userEmail={userEmail}
          />
        </InvoiceModal>
      )}

      {/* Print view */}
      {showPrint && selected && (
        <PrintView invoice={selected} onClose={() => setShowPrint(false)} />
      )}
    </div>
  );
}

// ── Modal shell ────────────────────────────────────────────────────────────────

function InvoiceModal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div
        className={cn(
          "fixed top-4 bottom-4 right-4 z-50 bg-background border border-border overflow-y-auto",
          wide ? "left-4 md:left-[10%]" : "left-4 md:left-[30%]"
        )}
      >
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-heading font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </>
  );
}

// ── Create form ────────────────────────────────────────────────────────────────

function CreateInvoiceForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (f: {
    client_name: string;
    client_email: string;
    description: string;
    issued_date: string;
    due_date: string;
    tax_rate: number;
  }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    client_name: "",
    client_email: "",
    description: "",
    tax_rate: "8.75",
    issued_date: new Date().toISOString().split("T")[0],
    due_date: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Client Name *</label>
          <input
            value={form.client_name}
            onChange={(e) => set("client_name", e.target.value)}
            className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Client Email</label>
          <input
            type="email"
            value={form.client_email}
            onChange={(e) => set("client_email", e.target.value)}
            className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
          />
        </div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Project / Description</label>
        <input
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Issued Date</label>
          <input
            type="date"
            value={form.issued_date}
            onChange={(e) => set("issued_date", e.target.value)}
            className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Due Date</label>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => set("due_date", e.target.value)}
            className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Tax Rate %</label>
          <input
            type="number"
            value={form.tax_rate}
            onChange={(e) => set("tax_rate", e.target.value)}
            className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
          />
        </div>
      </div>
      <p className="text-xs text-muted">Line items are added after creating the invoice.</p>
      <div className="flex gap-3">
        <Button
          onClick={() => onSubmit({ ...form, tax_rate: Number(form.tax_rate) })}
          disabled={!form.client_name}
        >
          Create Invoice
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Invoice detail (edit + payments) ──────────────────────────────────────────

function InvoiceDetail({
  invoice: initialInvoice,
  onDelete,
  onPrint,
  onUpdate,
  userEmail,
}: {
  invoice: Invoice;
  onDelete: () => void;
  onPrint: () => void;
  onUpdate: (inv: Invoice) => void;
  userEmail: string;
}) {
  const [inv, setInv] = useState<Invoice>(initialInvoice);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [terms, setTerms] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [sendTo, setSendTo] = useState(initialInvoice.client_email || "");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    axiom
      .from("settings")
      .select("terms_text, categories")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.terms_text) setTerms(data.terms_text);
        if (data?.categories) setCategories(data.categories || []);
      });
  }, []);

  function mark(updates: Partial<Invoice>) {
    setInv((i) => ({ ...i, ...updates }));
    setDirty(true);
    setSaved(false);
  }

  function addLine() {
    mark({ line_items: [...(inv.line_items || []), { category: "", description: "", quantity: 1, unit_price: 0 }] });
  }

  function updateLine(idx: number, field: keyof InvoiceLineItem, value: string | number) {
    const items = [...(inv.line_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    mark({ line_items: items });
  }

  function removeLine(idx: number) {
    mark({ line_items: (inv.line_items || []).filter((_, i) => i !== idx) });
  }

  const lineItems = inv.line_items || [];
  const subtotal = lineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const discountAmt = inv.discount || 0;
  const taxable = subtotal - discountAmt;
  const taxAmt = taxable * ((inv.tax_rate || 0) / 100);
  const total = taxable + taxAmt;
  const paid = calcPaid(inv);
  const balance = total - paid;

  async function save() {
    const updated: Invoice = { ...inv, subtotal, updated_at: new Date().toISOString() };
    await axiom.from("invoices").update(updated).eq("id", inv.id);
    setInv(updated);
    setDirty(false);
    setSaved(true);
    onUpdate(updated);
  }

  async function addPayment(payment: Payment) {
    const payments = [...(inv.payments || []), payment];
    const newPaid = payments.reduce((s, p) => s + p.amount, 0);
    const newStatus: Invoice["status"] =
      newPaid >= total && total > 0 ? "paid" : newPaid > 0 ? "partial" : "unpaid";
    const updated: Invoice = { ...inv, payments, status: newStatus, updated_at: new Date().toISOString() };
    await axiom.from("invoices").update({ payments, status: newStatus, updated_at: updated.updated_at }).eq("id", inv.id);
    await logActivity({
      action: "updated",
      entity: "invoice",
      entity_id: inv.id,
      label: `Recorded ${money(payment.amount)} payment on ${inv.invoice_number}`,
      user_name: userEmail,
    });
    setInv(updated);
    setShowPayment(false);
    onUpdate(updated);
  }

  async function handleSend() {
    if (!sendTo) return;
    setSending(true);
    setSendResult(null);
    try {
      const html = generateInvoiceHtml(inv, terms, true);
      const res = await fetch("/api/send-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sendTo,
          subject: `Invoice ${inv.invoice_number} from RELIC Custom Fabrications`,
          html,
          from_name: "RELIC Custom Fabrications",
        }),
      });
      setSendResult(res.ok ? "success" : "error");
    } catch {
      setSendResult("error");
    }
    setSending(false);
    if (sendResult !== "error") setShowSend(false);
  }

  const inputCls =
    "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
  const labelCls = "text-xs uppercase tracking-wider text-muted block mb-1.5";

  return (
    <div className="space-y-6">
      {/* Header fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Client Name</label>
          <input value={inv.client_name} onChange={(e) => mark({ client_name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            value={inv.client_email || ""}
            onChange={(e) => mark({ client_email: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Issued Date</label>
          <input
            type="date"
            value={inv.issued_date || ""}
            onChange={(e) => mark({ issued_date: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Due Date</label>
          <input
            type="date"
            value={inv.due_date || ""}
            onChange={(e) => mark({ due_date: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Description / Project Name</label>
        <input
          value={inv.description || ""}
          onChange={(e) => mark({ description: e.target.value })}
          className={inputCls}
        />
      </div>

      {/* Line Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Line Items</h3>
          <button onClick={addLine} className="text-accent text-sm flex items-center gap-1">
            <Plus size={14} /> Add Item
          </button>
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
                      <select
                        value={li.category}
                        onChange={(e) => updateLine(i, "category", e.target.value)}
                        className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
                      >
                        <option value="">—</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={li.category}
                        onChange={(e) => updateLine(i, "category", e.target.value)}
                        placeholder="Category"
                        className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 min-w-[180px]">
                    <input
                      value={li.description}
                      onChange={(e) => updateLine(i, "description", e.target.value)}
                      placeholder="Description"
                      className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={li.quantity}
                      onChange={(e) => updateLine(i, "quantity", Number(e.target.value))}
                      className="w-full bg-background border border-border px-2 py-1.5 text-sm text-right font-mono text-foreground focus:outline-none focus:border-accent"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={li.unit_price}
                      onChange={(e) => updateLine(i, "unit_price", Number(e.target.value))}
                      className="w-full bg-background border border-border px-2 py-1.5 text-sm text-right font-mono text-foreground focus:outline-none focus:border-accent"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-sm">
                    {money((li.quantity || 0) * (li.unit_price || 0))}
                  </td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => removeLine(i)} className="text-muted hover:text-red-500">
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted text-sm">
                    No items yet —{" "}
                    <button onClick={addLine} className="text-accent hover:underline">
                      add the first line
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {lineItems.length > 0 && (
          <button onClick={addLine} className="mt-2 text-accent text-sm flex items-center gap-1">
            <Plus size={14} /> Add Line Item
          </button>
        )}
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-72 space-y-1 text-sm">
          <div className="flex justify-between py-1.5">
            <span className="text-muted">Subtotal</span>
            <span className="font-mono">{money(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-muted">Discount ($)</span>
            <input
              type="number"
              value={inv.discount || ""}
              onChange={(e) => mark({ discount: Number(e.target.value) || 0 })}
              placeholder="0.00"
              className="w-28 bg-card border border-border px-2 py-1 text-sm text-right font-mono text-foreground focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-muted">Tax Rate (%)</span>
            <input
              type="number"
              value={inv.tax_rate || ""}
              onChange={(e) => mark({ tax_rate: Number(e.target.value) || 0 })}
              placeholder="0.00"
              className="w-28 bg-card border border-border px-2 py-1 text-sm text-right font-mono text-foreground focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted">Tax Amount</span>
            <span className="font-mono">{money(taxAmt)}</span>
          </div>
          <div className="border-t border-border pt-2 flex justify-between font-bold text-base">
            <span>Total</span>
            <span className="font-mono">{money(total)}</span>
          </div>
          {paid > 0 && (
            <>
              <div className="flex justify-between py-1">
                <span className="text-green-500">Paid</span>
                <span className="font-mono text-green-500">{money(paid)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-border pt-1">
                <span>Balance Due</span>
                <span
                  className="font-mono"
                  style={{ color: balance > 0 ? "#ef4444" : "#22c55e" }}
                >
                  {money(balance)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Payment history */}
      {(inv.payments || []).length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Payment History</h3>
          <div className="space-y-1">
            {inv.payments.map((p, i) => (
              <div key={i} className="bg-card border border-border p-2 flex justify-between text-sm">
                <span className="text-muted">
                  {p.method} · {p.date}
                  {p.ref ? ` · Ref: ${p.ref}` : ""}
                  {p.note ? ` — ${p.note}` : ""}
                </span>
                <span className="font-mono text-green-500">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Terms */}
      {terms && (
        <div className="border-t border-border pt-5">
          <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Terms</h3>
          <p className="text-sm text-muted whitespace-pre-wrap leading-relaxed">{terms}</p>
        </div>
      )}

      {/* Email send panel */}
      {showSend && (
        <div className="border border-accent bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold">Email Invoice to Client</h3>
          <div>
            <label className={labelCls}>Recipient Email</label>
            <input
              type="email"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              className={inputCls}
            />
          </div>
          {sendResult === "error" && (
            <p className="text-red-500 text-sm">Failed to send — check email address and try again.</p>
          )}
          <div className="flex gap-3">
            <Button onClick={handleSend} disabled={!sendTo || sending} size="sm">
              {sending ? "Sending…" : "Send Invoice"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setShowSend(false); setSendResult(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {sendResult === "success" && (
        <div className="flex items-center gap-2 text-green-500 text-sm">
          <CheckCircle size={16} /> Invoice sent to {sendTo}
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap gap-3 items-center border-t border-border pt-4">
        <SaveButton dirty={dirty} saved={saved} onClick={save} size="sm" />
        <Button
          onClick={() => setShowPayment(true)}
          size="sm"
          variant="outline"
        >
          <DollarSign size={14} className="mr-1" /> Record Payment
        </Button>
        <Button variant="outline" size="sm" onClick={onPrint}>
          <Printer size={14} className="mr-1" /> Print / PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setShowSend((v) => !v); setSendTo(inv.client_email || ""); setSendResult(null); }}
        >
          <Send size={14} className="mr-1" /> Email Invoice
        </Button>
        <button onClick={onDelete} className="text-muted hover:text-red-500 ml-auto">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Payment modal (inline over the detail panel) */}
      {showPayment && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60]" onClick={() => setShowPayment(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border p-6 z-[60]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold">Record Payment</h3>
              <button onClick={() => setShowPayment(false)} className="text-muted hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <PaymentForm invoice={inv} subtotal={total} onSubmit={addPayment} onCancel={() => setShowPayment(false)} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Payment form ───────────────────────────────────────────────────────────────

function PaymentForm({
  invoice,
  subtotal,
  onSubmit,
  onCancel,
}: {
  invoice: Invoice;
  subtotal: number;
  onSubmit: (p: Payment) => void;
  onCancel: () => void;
}) {
  const paid = calcPaid(invoice);
  const balance = subtotal - paid;
  const [amount, setAmount] = useState(String(balance > 0 ? balance.toFixed(2) : ""));
  const [method, setMethod] = useState("Credit Card");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Balance due: <span className="font-mono text-foreground">{money(balance)}</span>
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Amount *</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Reference #</label>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
          />
        </div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Note</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
        />
      </div>
      <div className="flex gap-3">
        <Button
          onClick={() =>
            onSubmit({ amount: Number(amount), method, date, note, ref, created_at: new Date().toISOString() })
          }
          disabled={!amount}
        >
          Record Payment
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Print view ─────────────────────────────────────────────────────────────────

function PrintView({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [terms, setTerms] = useState<string | null>(null);

  useEffect(() => {
    axiom
      .from("settings")
      .select("terms_text")
      .limit(1)
      .single()
      .then(({ data }) => setTerms(data?.terms_text || ""));
  }, []);

  useEffect(() => {
    if (terms !== null) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [terms]);

  const lineItems = invoice.line_items || [];
  const subtotal =
    lineItems.length > 0
      ? lineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0)
      : (invoice.subtotal || 0) + (invoice.delivery_fee || 0);
  const discountAmt = invoice.discount || 0;
  const taxable = subtotal - discountAmt;
  const taxAmt = taxable * ((invoice.tax_rate || 0) / 100);
  const total = taxable + taxAmt;
  const paid = calcPaid(invoice);
  const fmtDate = (d?: string) =>
    d
      ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "";

  if (terms === null) {
    return (
      <div className="fixed inset-0 bg-white z-[100] flex items-center justify-center text-black text-sm">
        Preparing invoice…
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white text-black z-[100] overflow-auto print:p-0">
      <div className="print:hidden fixed top-4 right-4 flex gap-2 z-10">
        <button
          onClick={() => window.print()}
          className="bg-gray-900 text-white px-4 py-2 text-sm hover:bg-gray-700"
        >
          Print
        </button>
        <button
          onClick={onClose}
          className="bg-white text-black border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Close
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-10 print:p-8">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-[#c4a24d] pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-[0.15em] text-gray-900">R E L I C</h1>
            <p className="text-[11px] tracking-[0.2em] text-[#c4a24d] uppercase mt-1">Custom Fabrications</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-gray-900">INVOICE</h2>
            <p className="font-mono text-gray-600 mt-1">{invoice.invoice_number}</p>
            {invoice.issued_date && (
              <p className="text-xs text-gray-500 mt-0.5">Date: {fmtDate(invoice.issued_date)}</p>
            )}
            {invoice.due_date && (
              <p className="text-xs text-gray-500 mt-0.5">Due: {fmtDate(invoice.due_date)}</p>
            )}
          </div>
        </div>

        {/* Bill To */}
        <div className="mb-8">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Bill To</p>
          <p className="text-lg font-bold text-gray-900">{invoice.client_name}</p>
          {invoice.client_email && <p className="text-sm text-gray-500">{invoice.client_email}</p>}
          {invoice.description && <p className="text-sm text-gray-600 mt-2">{invoice.description}</p>}
        </div>

        {/* Line Items */}
        {lineItems.length > 0 && (
          <table className="w-full text-sm mb-6 border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 px-3 text-[10px] uppercase tracking-wider text-gray-400">Category</th>
                <th className="text-left py-2 px-3 text-[10px] uppercase tracking-wider text-gray-400">Description</th>
                <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-gray-400">Qty</th>
                <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-gray-400">Unit Price</th>
                <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-gray-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 px-3 text-gray-500">{li.category || "—"}</td>
                  <td className="py-2 px-3">{li.description}</td>
                  <td className="py-2 px-3 text-right font-mono">{li.quantity}</td>
                  <td className="py-2 px-3 text-right font-mono">{money(li.unit_price)}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold">
                    {money((li.quantity || 0) * (li.unit_price || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <table className="w-64 text-sm">
            <tbody>
              <tr>
                <td className="py-1.5 text-gray-500">Subtotal</td>
                <td className="py-1.5 text-right font-mono">{money(subtotal)}</td>
              </tr>
              {discountAmt > 0 && (
                <tr>
                  <td className="py-1.5 text-gray-500">Discount</td>
                  <td className="py-1.5 text-right font-mono text-green-600">-{money(discountAmt)}</td>
                </tr>
              )}
              {invoice.tax_rate > 0 && (
                <tr>
                  <td className="py-1.5 text-gray-500">Tax ({invoice.tax_rate}%)</td>
                  <td className="py-1.5 text-right font-mono">{money(taxAmt)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-gray-200 font-bold text-base">
                <td className="pt-3 pb-1">Total</td>
                <td className="pt-3 pb-1 text-right font-mono">{money(total)}</td>
              </tr>
              {paid > 0 && (
                <>
                  <tr>
                    <td className="py-1 text-green-600">Paid</td>
                    <td className="py-1 text-right font-mono text-green-600">{money(paid)}</td>
                  </tr>
                  <tr className="border-t border-gray-200 font-bold">
                    <td
                      className="pt-2"
                      style={{ color: total - paid > 0 ? "#ef4444" : "#22c55e" }}
                    >
                      Balance Due
                    </td>
                    <td
                      className="pt-2 text-right font-mono"
                      style={{ color: total - paid > 0 ? "#ef4444" : "#22c55e" }}
                    >
                      {money(total - paid)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Terms */}
        {terms && (
          <div className="border-t border-gray-200 pt-6 mt-4">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2 font-bold">Terms</p>
            <p className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed">{terms}</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-gray-300 mt-10 text-center">
          RELIC &middot; Custom Fabrications &middot; (402) 235-8179 &middot; relicbuilt.com
        </p>
      </div>
    </div>
  );
}
