"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Company } from "@/types/axiom";
import Button from "@/components/ui/Button";
import { Plus, X, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CompaniesPage() {
  const { userEmail } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const { data } = await axiom.from("companies").select("*").order("name");
    if (data) setCompanies(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = companies.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.industry?.toLowerCase().includes(search.toLowerCase())
  );

  async function createCompany(form: Record<string, string>) {
    const { data } = await axiom.from("companies").insert({ name: form.name, address: form.address, industry: form.industry }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "company", entity_id: data.id, label: `Added company: ${data.name}`, user_name: userEmail });
      load();
      setShowCreate(false);
    }
  }

  async function deleteCompany(id: string) {
    await axiom.from("companies").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold">Companies</h1>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} className="mr-1" /> New Company</Button>
      </div>

      <div className="relative mb-6 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies..." className="w-full bg-card border border-border pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
      </div>

      <div className="space-y-2">
        {filtered.map((c) => (
          <div key={c.id} className="bg-card border border-border p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{c.name}</p>
              <p className="text-xs text-muted">{[c.industry, c.address].filter(Boolean).join(" · ") || "No details"}</p>
            </div>
            <button onClick={() => deleteCompany(c.id)} className="text-muted hover:text-red-500"><Trash2 size={14} /></button>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-muted text-sm text-center py-8">No companies found</p>}
      </div>

      {showCreate && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border p-6 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-bold">New Company</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted"><X size={20} /></button>
            </div>
            <CompanyForm onSubmit={createCompany} onCancel={() => setShowCreate(false)} />
          </div>
        </>
      )}
    </div>
  );
}

function CompanyForm({ onSubmit, onCancel }: { onSubmit: (f: Record<string, string>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: "", address: "", industry: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Name *</label>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Address</label>
        <input value={form.address} onChange={(e) => set("address", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Industry</label>
        <input value={form.industry} onChange={(e) => set("industry", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit(form)} disabled={!form.name}>Add Company</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
