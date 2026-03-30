"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Invoice, Payment } from "@/types/axiom";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Plus, X, Trash2, Printer, DollarSign } from "lucide-react";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function calcTotal(inv: Invoice) {
  const taxable = (inv.subtotal || 0) + (inv.delivery_fee || 0) - (inv.discount || 0);
  return taxable + taxable * ((inv.tax_rate || 0) / 100);
}

function calcPaid(inv: Invoice) {
  return (inv.payments || []).reduce((s, p) => s + p.amount, 0);
}

function calcStatus(inv: Invoice): "unpaid" | "partial" | "paid" {
  const paid = calcPaid(inv);
  const total = calcTotal(inv);
  if (paid >= total) return "paid";
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
  const [showPayment, setShowPayment] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  const load = useCallback(async () => {
    const { data } = await axiom.from("invoices").select("*").order("created_at", { ascending: false });
    if (data) setInvoices(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createInvoice(form: Record<string, string | number>) {
    const { data } = await axiom.from("invoices").insert({
      invoice_number: genInvoiceNum(),
      client_name: form.client_name,
      client_email: form.client_email,
      description: form.description,
      subtotal: Number(form.subtotal) || 0,
      delivery_fee: Number(form.delivery_fee) || 0,
      discount: Number(form.discount) || 0,
      tax_rate: Number(form.tax_rate) || 8.75,
      issued_date: form.issued_date || new Date().toISOString().split("T")[0],
      due_date: form.due_date,
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "invoice", entity_id: data.id, label: `Created invoice ${data.invoice_number} for ${data.client_name}`, user_name: userEmail });
      load();
      setShowCreate(false);
    }
  }

  async function addPayment(invoiceId: string, payment: Payment) {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    const payments = [...(inv.payments || []), payment];
    const newStatus = (() => {
      const paid = payments.reduce((s, p) => s + p.amount, 0);
      const total = calcTotal(inv);
      if (paid >= total) return "paid";
      if (paid > 0) return "partial";
      return "unpaid";
    })();
    await axiom.from("invoices").update({ payments, status: newStatus, updated_at: new Date().toISOString() }).eq("id", invoiceId);
    await logActivity({ action: "updated", entity: "invoice", entity_id: invoiceId, label: `Recorded ${money(payment.amount)} payment on ${inv.invoice_number}`, user_name: userEmail });
    load();
    setSelected((prev) => prev ? { ...prev, payments, status: newStatus } : prev);
    setShowPayment(false);
  }

  async function deleteInvoice(id: string) {
    await axiom.from("invoices").delete().eq("id", id);
    setSelected(null);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Invoices</h1>
          <p className="text-muted text-sm mt-1">{invoices.length} total</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} className="mr-1" /> New Invoice</Button>
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
              const total = calcTotal(inv);
              const paid = calcPaid(inv);
              const status = calcStatus(inv);
              return (
                <tr key={inv.id} onClick={() => setSelected(inv)} className="border-b border-border/50 cursor-pointer hover:bg-background/50">
                  <td className="px-4 py-3 font-mono">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.client_name}</td>
                  <td className="px-4 py-3 text-muted">{inv.issued_date || "—"}</td>
                  <td className="px-4 py-3 text-muted">{inv.due_date || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{money(total)}</td>
                  <td className="px-4 py-3 text-right font-mono">{money(total - paid)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: statusColors[status] + "20", color: statusColors[status] }}>
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
          <InvoiceForm onSubmit={createInvoice} onCancel={() => setShowCreate(false)} />
        </InvoiceModal>
      )}

      {/* Detail modal */}
      {selected && !showPrint && (
        <InvoiceModal title={selected.invoice_number} onClose={() => { setSelected(null); load(); }} wide>
          <InvoiceDetail
            invoice={selected}
            onAddPayment={() => setShowPayment(true)}
            onDelete={() => deleteInvoice(selected.id)}
            onPrint={() => setShowPrint(true)}
          />
        </InvoiceModal>
      )}

      {/* Payment modal */}
      {showPayment && selected && (
        <InvoiceModal title="Record Payment" onClose={() => setShowPayment(false)}>
          <PaymentForm invoice={selected} onSubmit={(p) => addPayment(selected.id, p)} onCancel={() => setShowPayment(false)} />
        </InvoiceModal>
      )}

      {/* Print view */}
      {showPrint && selected && (
        <PrintView invoice={selected} onClose={() => setShowPrint(false)} />
      )}
    </div>
  );
}

function InvoiceModal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
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

function InvoiceForm({ onSubmit, onCancel }: { onSubmit: (f: Record<string, string | number>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ client_name: "", client_email: "", description: "", subtotal: "", delivery_fee: "", discount: "", tax_rate: "8.75", issued_date: new Date().toISOString().split("T")[0], due_date: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Client Name *</label><input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Client Email</label><input type="email" value={form.client_email} onChange={(e) => set("client_email", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      </div>
      <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Description</label><input value={form.description} onChange={(e) => set("description", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      <div className="grid grid-cols-4 gap-4">
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Subtotal</label><input type="number" value={form.subtotal} onChange={(e) => set("subtotal", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Delivery Fee</label><input type="number" value={form.delivery_fee} onChange={(e) => set("delivery_fee", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Discount</label><input type="number" value={form.discount} onChange={(e) => set("discount", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Tax Rate %</label><input type="number" value={form.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Issued Date</label><input type="date" value={form.issued_date} onChange={(e) => set("issued_date", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Due Date</label><input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit(form)} disabled={!form.client_name}>Create Invoice</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function InvoiceDetail({ invoice, onAddPayment, onDelete, onPrint }: { invoice: Invoice; onAddPayment: () => void; onDelete: () => void; onPrint: () => void }) {
  const total = calcTotal(invoice);
  const paid = calcPaid(invoice);
  const balance = total - paid;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-muted">Client:</span> {invoice.client_name}</div>
        <div><span className="text-muted">Email:</span> {invoice.client_email || "—"}</div>
        <div><span className="text-muted">Issued:</span> {invoice.issued_date || "—"}</div>
        <div><span className="text-muted">Due:</span> {invoice.due_date || "—"}</div>
      </div>
      {invoice.description && <p className="text-sm text-muted">{invoice.description}</p>}
      <div className="bg-card border border-border p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="font-mono">{money(invoice.subtotal)}</span></div>
        {invoice.delivery_fee > 0 && <div className="flex justify-between"><span className="text-muted">Delivery Fee</span><span className="font-mono">{money(invoice.delivery_fee)}</span></div>}
        {invoice.discount > 0 && <div className="flex justify-between"><span className="text-muted">Discount</span><span className="font-mono text-green-500">-{money(invoice.discount)}</span></div>}
        <div className="flex justify-between"><span className="text-muted">Tax ({invoice.tax_rate}%)</span><span className="font-mono">{money(((invoice.subtotal + invoice.delivery_fee - invoice.discount) * invoice.tax_rate) / 100)}</span></div>
        <div className="border-t border-border pt-2 flex justify-between font-bold"><span>Total</span><span className="font-mono">{money(total)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Paid</span><span className="font-mono text-green-500">{money(paid)}</span></div>
        <div className="flex justify-between font-bold"><span>Balance Due</span><span className="font-mono" style={{ color: balance > 0 ? "#ef4444" : "#22c55e" }}>{money(balance)}</span></div>
      </div>
      {/* Payment history */}
      {(invoice.payments || []).length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Payment History</h3>
          <div className="space-y-1">
            {invoice.payments.map((p, i) => (
              <div key={i} className="bg-card border border-border p-2 flex justify-between text-sm">
                <span>{p.method} &middot; {p.date}</span>
                <span className="font-mono text-green-500">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <Button onClick={onAddPayment} size="sm"><DollarSign size={14} className="mr-1" /> Record Payment</Button>
        <Button variant="outline" size="sm" onClick={onPrint}><Printer size={14} className="mr-1" /> Print</Button>
        <button onClick={onDelete} className="text-muted hover:text-red-500 text-sm ml-auto"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function PaymentForm({ invoice, onSubmit, onCancel }: { invoice: Invoice; onSubmit: (p: Payment) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Credit Card");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const balance = calcTotal(invoice) - calcPaid(invoice);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Balance due: <span className="font-mono text-foreground">{money(balance)}</span></p>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Amount *</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent">
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Reference #</label><input value={ref} onChange={(e) => setRef(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      </div>
      <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Note</label><input value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit({ amount: Number(amount), method, date, note, ref, created_at: new Date().toISOString() })} disabled={!amount}>Record Payment</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function PrintView({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const total = calcTotal(invoice);
  const paid = calcPaid(invoice);
  useEffect(() => { window.print(); }, []);
  return (
    <div className="fixed inset-0 bg-white text-black z-[100] p-8 overflow-auto print:p-0">
      <button onClick={onClose} className="fixed top-4 right-4 bg-black text-white px-4 py-2 text-sm print:hidden">Close</button>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-1">RELIC</h1>
        <p className="text-sm text-gray-500 mb-6">Custom Fabrications</p>
        <div className="flex justify-between mb-6">
          <div><p className="font-bold">{invoice.invoice_number}</p><p className="text-sm text-gray-500">Issued: {invoice.issued_date}</p><p className="text-sm text-gray-500">Due: {invoice.due_date}</p></div>
          <div className="text-right"><p className="font-bold">{invoice.client_name}</p><p className="text-sm text-gray-500">{invoice.client_email}</p></div>
        </div>
        {invoice.description && <p className="text-sm mb-4">{invoice.description}</p>}
        <table className="w-full text-sm mb-4">
          <tbody>
            <tr className="border-b"><td className="py-2">Subtotal</td><td className="py-2 text-right">{money(invoice.subtotal)}</td></tr>
            {invoice.delivery_fee > 0 && <tr className="border-b"><td className="py-2">Delivery</td><td className="py-2 text-right">{money(invoice.delivery_fee)}</td></tr>}
            {invoice.discount > 0 && <tr className="border-b"><td className="py-2">Discount</td><td className="py-2 text-right">-{money(invoice.discount)}</td></tr>}
            <tr className="border-b"><td className="py-2">Tax ({invoice.tax_rate}%)</td><td className="py-2 text-right">{money(((invoice.subtotal + invoice.delivery_fee - invoice.discount) * invoice.tax_rate) / 100)}</td></tr>
            <tr className="border-b font-bold"><td className="py-2">Total</td><td className="py-2 text-right">{money(total)}</td></tr>
            <tr className="border-b"><td className="py-2">Paid</td><td className="py-2 text-right">{money(paid)}</td></tr>
            <tr className="font-bold text-lg"><td className="py-2">Balance Due</td><td className="py-2 text-right">{money(total - paid)}</td></tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-8">RELIC &middot; (402) 235-8179 &middot; relicbuilt.com</p>
      </div>
    </div>
  );
}
