"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Customer, CustomerNote, CustomWork, Invoice } from "@/types/axiom";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Plus, X, Search, Trash2 } from "lucide-react";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function CustomersPage() {
  const { userEmail } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const load = useCallback(async () => {
    const { data } = await axiom.from("customers").select("*").order("name");
    if (data) setCustomers(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load related data when a customer is selected
  useEffect(() => {
    if (!selected) return;
    Promise.all([
      axiom.from("custom_work").select("*").ilike("client_name", `%${selected.name}%`),
      axiom.from("invoices").select("*").ilike("client_name", `%${selected.name}%`),
    ]).then(([p, i]) => {
      if (p.data) setProjects(p.data);
      if (i.data) setInvoices(i.data);
    });
  }, [selected]);

  const filtered = customers.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  async function createCustomer(form: Record<string, string>) {
    const { data } = await axiom.from("customers").insert({
      name: form.name,
      email: form.email,
      phone: form.phone,
      type: form.type || "Individual",
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "customer", entity_id: data.id, label: `Added customer: ${data.name}`, user_name: userEmail });
      load();
      setShowCreate(false);
    }
  }

  async function deleteCustomer(id: string) {
    await axiom.from("customers").delete().eq("id", id);
    setSelected(null);
    load();
  }

  async function addNote(customerId: string, text: string) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    const notes = [...(customer.notes || []), { text, created_at: new Date().toISOString() }];
    await axiom.from("customers").update({ notes }).eq("id", customerId);
    load();
    setSelected((prev) => prev ? { ...prev, notes } : prev);
  }

  const totalSpend = projects.reduce((s, p) => s + (p.quoted_amount || 0), 0);

  return (
    <div className="flex gap-6 h-[calc(100vh-6rem)]">
      {/* List */}
      <div className="w-80 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-heading font-bold">Customers</h1>
          <button onClick={() => setShowCreate(true)} className="text-accent"><Plus size={20} /></button>
        </div>
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full bg-card border border-border pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={cn("w-full text-left px-3 py-2.5 rounded text-sm transition-colors", selected?.id === c.id ? "bg-accent/15 text-accent" : "hover:bg-card text-foreground")}
            >
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted">{c.email || c.phone || "No contact info"}</p>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-muted text-sm text-center py-4">No customers found</p>}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-heading font-bold">{selected.name}</h2>
                <p className="text-muted text-sm">{selected.type} &middot; {selected.status}</p>
              </div>
              <button onClick={() => deleteCustomer(selected.id)} className="text-muted hover:text-red-500"><Trash2 size={16} /></button>
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-2 gap-4 bg-card border border-border p-4">
              <div><span className="text-xs text-muted block">Email</span><span className="text-sm">{selected.email || "—"}</span></div>
              <div><span className="text-xs text-muted block">Phone</span><span className="text-sm">{selected.phone || "—"}</span></div>
              <div><span className="text-xs text-muted block">Address</span><span className="text-sm">{selected.address || "—"}</span></div>
              <div><span className="text-xs text-muted block">Industry</span><span className="text-sm">{selected.industry || "—"}</span></div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border border-border p-3">
                <p className="text-xs text-muted">Projects</p>
                <p className="text-lg font-mono font-bold">{projects.length}</p>
              </div>
              <div className="bg-card border border-border p-3">
                <p className="text-xs text-muted">Total Quoted</p>
                <p className="text-lg font-mono font-bold">{money(totalSpend)}</p>
              </div>
              <div className="bg-card border border-border p-3">
                <p className="text-xs text-muted">Open Invoices</p>
                <p className="text-lg font-mono font-bold">{invoices.filter((i) => i.status !== "paid").length}</p>
              </div>
            </div>

            {/* Projects list */}
            {projects.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Projects</h3>
                <div className="space-y-1">
                  {projects.map((p) => (
                    <div key={p.id} className="bg-card border border-border p-3 flex justify-between text-sm">
                      <span>{p.project_name}</span>
                      <span className="text-muted">{p.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Notes</h3>
              <div className="space-y-2 mb-3">
                {(selected.notes || []).map((n: CustomerNote, i: number) => (
                  <div key={i} className="bg-card border border-border p-2 text-sm">
                    <p>{n.text}</p>
                    <p className="text-xs text-muted mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
              <NoteBox onSubmit={(text) => addNote(selected.id, text)} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">Select a customer to view details</div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border p-6 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-bold">New Customer</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted"><X size={20} /></button>
            </div>
            <CustomerForm onSubmit={createCustomer} onCancel={() => setShowCreate(false)} />
          </div>
        </>
      )}
    </div>
  );
}

function CustomerForm({ onSubmit, onCancel }: { onSubmit: (f: Record<string, string>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", type: "Individual" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Name *</label>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Email</label>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Phone</label>
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
        </div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Type</label>
        <select value={form.type} onChange={(e) => set("type", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent">
          <option value="Individual">Individual</option>
          <option value="Business">Business</option>
        </select>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit(form)} disabled={!form.name}>Add Customer</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function NoteBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note..." className="flex-1 bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onSubmit(text.trim()); setText(""); } }} />
      <Button size="sm" onClick={() => { if (text.trim()) { onSubmit(text.trim()); setText(""); } }}>Add</Button>
    </div>
  );
}
