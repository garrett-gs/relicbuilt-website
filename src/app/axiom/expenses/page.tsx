"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { useAutosave } from "@/components/axiom/useAutosave";
import { Expense } from "@/types/axiom";
import Button from "@/components/ui/Button";
import DateField from "@/components/ui/DateField";
import { Plus, X, Trash2, Loader2, Check } from "lucide-react";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const CATEGORIES = [
  "Materials", "Labor", "Subcontractor", "Transport",
  "Shop Supplies", "Tools/Equipment", "Admin", "Other",
];

export default function ExpensesPage() {
  const { userEmail } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const { data } = await axiom.from("expenses").select("*").order("date", { ascending: false });
    if (data) setExpenses(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? expenses : expenses.filter((e) => e.category === filter);
  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  // Category breakdown
  const byCat = expenses.reduce((acc, e) => {
    const cat = e.category || "Other";
    acc[cat] = (acc[cat] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  async function createExpense(form: Record<string, string | number>) {
    const { data } = await axiom.from("expenses").insert({
      date: form.date || new Date().toISOString().split("T")[0],
      description: form.description,
      amount: Number(form.amount) || 0,
      category: form.category,
      vendor_name: form.vendor_name,
      notes: form.notes,
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "expense", entity_id: data.id, label: `Added expense: ${money(data.amount)} — ${form.description || form.category}`, user_name: userEmail });
      load();
      setShowCreate(false);
    }
  }

  async function deleteExpense(id: string) {
    await axiom.from("expenses").delete().eq("id", id);
    load();
  }

  async function updateExpense(id: string, patch: Partial<Expense>) {
    await axiom.from("expenses").update(patch).eq("id", id);
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold">Expenses</h1>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} className="mr-1" /> New Expense</Button>
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cat, amount]) => (
          <div key={cat} className="bg-card border border-border p-3">
            <p className="text-xs text-muted">{cat}</p>
            <p className="font-mono font-bold">{money(amount)}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-6">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent">
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-muted self-center ml-auto">
          Total: <span className="font-mono text-foreground font-bold">{money(total)}</span>
        </span>
      </div>

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-border">
              <th className="px-4 py-3 w-40">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 w-44">Category</th>
              <th className="px-4 py-3 w-48">Vendor</th>
              <th className="px-4 py-3 text-right w-32">Amount</th>
              <th className="px-4 py-3 w-12"></th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <ExpenseRow key={e.id} expense={e} onUpdate={updateExpense} onDelete={() => deleteExpense(e.id)} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center py-8 text-muted text-sm">No expenses found</p>}
      </div>

      {showCreate && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border p-6 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-bold">New Expense</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted"><X size={20} /></button>
            </div>
            <ExpenseForm onSubmit={createExpense} onCancel={() => setShowCreate(false)} />
          </div>
        </>
      )}
    </div>
  );
}

function ExpenseForm({ onSubmit, onCancel }: { onSubmit: (f: Record<string, string | number>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], description: "", amount: "", category: "Materials", vendor_name: "", notes: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Date</label>
          <DateField
            value={form.date}
            onChange={(v) => set("date", v)}
            inputClassName="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent hover:border-accent transition-colors text-left"
          />
        </div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Amount *</label><input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      </div>
      <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Description</label><input value={form.description} onChange={(e) => set("description", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Category</label>
          <select value={form.category} onChange={(e) => set("category", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Vendor</label><input value={form.vendor_name} onChange={(e) => set("vendor_name", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      </div>
      <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Notes</label><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[60px] resize-y" /></div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit(form)} disabled={!form.amount}>Add Expense</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// Inline-editable table row. Autosaves ~900ms after the last edit and on
// unmount so navigating away or filtering can't drop pending changes.
function ExpenseRow({ expense, onUpdate, onDelete }: {
  expense: Expense;
  onUpdate: (id: string, patch: Partial<Expense>) => Promise<void>;
  onDelete: () => void;
}) {
  const [date, setDate] = useState(expense.date || "");
  const [description, setDescription] = useState(expense.description || "");
  const [category, setCategory] = useState(expense.category || "");
  const [vendor, setVendor] = useState(expense.vendor_name || "");
  const [amount, setAmount] = useState(String(expense.amount ?? ""));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rev, setRev] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) { initialMount.current = false; return; }
    setDirty(true);
    setSaved(false);
    setRev((r) => r + 1);
  }, [date, description, category, vendor, amount]);

  async function save() {
    await onUpdate(expense.id, {
      date: date || undefined,
      description: description || undefined,
      category: category || undefined,
      vendor_name: vendor || undefined,
      amount: Number(amount) || 0,
    });
    setDirty(false);
    setSaved(true);
  }

  useAutosave(dirty, rev, save);

  const cellInp = "w-full bg-transparent border border-transparent hover:border-border/60 focus:border-accent focus:outline-none px-2 py-1.5 text-sm text-foreground";

  return (
    <tr className="border-b border-border/50">
      <td className="px-2 py-2">
        <DateField value={date} onChange={setDate} inputClassName={`${cellInp} text-left`} />
      </td>
      <td className="px-2 py-2">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={cellInp} placeholder="—" />
      </td>
      <td className="px-2 py-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={cellInp}>
          <option value="">—</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={cellInp} placeholder="—" />
      </td>
      <td className="px-2 py-2 text-right">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={cellInp + " text-right font-mono"}
        />
      </td>
      <td className="px-2 py-2 text-center">
        {dirty ? (
          <Loader2 size={14} className="text-muted animate-spin inline" />
        ) : saved ? (
          <Check size={14} className="text-green-500 inline" />
        ) : null}
      </td>
      <td className="px-4 py-2 text-right">
        {confirmDelete ? (
          <span className="inline-flex items-center gap-1.5">
            <button onClick={onDelete} className="text-xs bg-red-500 text-white px-2 py-1 hover:bg-red-600">Yes</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs border border-border px-2 py-1 text-muted hover:text-foreground">No</button>
          </span>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-muted hover:text-red-500"><Trash2 size={14} /></button>
        )}
      </td>
    </tr>
  );
}
