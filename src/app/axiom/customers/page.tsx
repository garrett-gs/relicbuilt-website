"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Customer, CustomerNote, Company, CustomWork, Invoice } from "@/types/axiom";
import Button from "@/components/ui/Button";
import AddressAutocomplete from "@/components/ui/AddressAutocomplete";
import { cn, formatPhone } from "@/lib/utils";
import {
  Plus, X, Search, Trash2,
  ChevronRight, ChevronDown,
  Building2, User, UserPlus, ExternalLink, Pencil, Check,
} from "lucide-react";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const inp = "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";

// ── Main page ────────────────────────────────────────────────

export default function CustomersPage() {
  const { userEmail } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  // What's selected in the detail panel
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Detail panel data
  const [detailProjects, setDetailProjects] = useState<CustomWork[]>([]);
  const [detailInvoices, setDetailInvoices] = useState<Invoice[]>([]);

  // Modals
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [showCreateIndividual, setShowCreateIndividual] = useState(false);
  const [showCreateContact, setShowCreateContact] = useState<string | null>(null); // company id

  const loadAll = useCallback(async () => {
    const [{ data: cos }, { data: custs }] = await Promise.all([
      axiom.from("companies").select("*").order("name"),
      axiom.from("customers").select("*").order("name"),
    ]);
    if (cos) setCompanies(cos as Company[]);
    if (custs) setCustomers(custs as Customer[]);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Load detail data when selection changes
  useEffect(() => {
    if (selectedCustomerId) {
      const cust = customers.find((c) => c.id === selectedCustomerId);
      if (!cust) return;
      Promise.all([
        axiom.from("custom_work").select("*").or(`customer_id.eq.${cust.id},client_name.ilike.%${cust.name}%`),
        axiom.from("invoices").select("*").ilike("client_name", `%${cust.name}%`),
      ]).then(([p, i]) => {
        if (p.data) setDetailProjects(p.data as CustomWork[]);
        if (i.data) setDetailInvoices(i.data as Invoice[]);
      });
    } else if (selectedCompanyId) {
      axiom.from("custom_work").select("*").eq("company_id", selectedCompanyId).then(({ data }) => {
        if (data) setDetailProjects(data as CustomWork[]);
        setDetailInvoices([]);
      });
    } else {
      setDetailProjects([]);
      setDetailInvoices([]);
    }
  }, [selectedCustomerId, selectedCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived
  const contactsForCompany = (companyId: string) =>
    customers.filter((c) => c.company_id === companyId);

  const individualCustomers = customers.filter(
    (c) => !c.company_id && c.type !== "Contact"
  );

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null;
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null;
  const selectedCustomerCompany = selectedCustomer?.company_id
    ? companies.find((co) => co.id === selectedCustomer.company_id) ?? null
    : null;

  // Search filtering
  const sq = search.toLowerCase();
  const filteredCompanies = !sq ? companies : companies.filter((co) =>
    co.name.toLowerCase().includes(sq) ||
    co.industry?.toLowerCase().includes(sq) ||
    contactsForCompany(co.id).some((c) =>
      c.name.toLowerCase().includes(sq) || c.email?.toLowerCase().includes(sq)
    )
  );
  const filteredIndividuals = !sq ? individualCustomers : individualCustomers.filter((c) =>
    c.name.toLowerCase().includes(sq) ||
    c.email?.toLowerCase().includes(sq) ||
    c.phone?.includes(search)
  );

  function toggleExpand(id: string) {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectCompany(id: string) {
    setSelectedCompanyId(id);
    setSelectedCustomerId(null);
  }

  function selectCustomer(id: string) {
    setSelectedCustomerId(id);
    setSelectedCompanyId(null);
  }

  // ── CRUD ──

  async function createCompany(form: Record<string, string>) {
    const { data } = await axiom.from("companies").insert({
      name: form.name, address: form.address, industry: form.industry,
      phone: form.phone, website: form.website,
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "company", entity_id: data.id, label: `Added company: ${data.name}`, user_name: userEmail });
      setShowCreateCompany(false);
      await loadAll();
      selectCompany(data.id);
    }
  }

  async function createIndividual(form: Record<string, string>) {
    const { data } = await axiom.from("customers").insert({
      name: form.name, email: form.email, phone: form.phone, type: "Individual",
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "customer", entity_id: data.id, label: `Added customer: ${data.name}`, user_name: userEmail });
      setShowCreateIndividual(false);
      await loadAll();
      selectCustomer(data.id);
    }
  }

  async function createContact(companyId: string, form: Record<string, string>) {
    const co = companies.find((c) => c.id === companyId);
    const { data } = await axiom.from("customers").insert({
      name: form.name, email: form.email, phone: form.phone,
      title: form.title, company_id: companyId,
      company_name: co?.name ?? "",
      type: "Contact",
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "customer", entity_id: data.id, label: `Added contact: ${data.name} at ${co?.name}`, user_name: userEmail });
      setShowCreateContact(null);
      setExpandedCompanies((prev) => new Set([...prev, companyId]));
      await loadAll();
      selectCustomer(data.id);
    }
  }

  async function updateCompany(id: string, fields: Partial<Company>) {
    await axiom.from("companies").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
    await loadAll();
  }

  async function updateCustomer(id: string, fields: Partial<Customer>) {
    await axiom.from("customers").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
    await loadAll();
  }

  async function deleteCompany(id: string) {
    await axiom.from("companies").delete().eq("id", id);
    setSelectedCompanyId(null);
    loadAll();
  }

  async function deleteCustomer(id: string) {
    await axiom.from("customers").delete().eq("id", id);
    setSelectedCustomerId(null);
    loadAll();
  }

  async function addNote(customerId: string, text: string) {
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return;
    const notes = [...(cust.notes || []), { text, created_at: new Date().toISOString() }];
    await axiom.from("customers").update({ notes }).eq("id", customerId);
    await loadAll();
  }

  const showingContactModal = showCreateContact
    ? companies.find((c) => c.id === showCreateContact)
    : null;

  return (
    <div className="flex gap-6" style={{ height: "calc(100vh - 6rem)" }}>

      {/* ── Left: List ── */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-heading font-bold">Customers</h1>
        </div>

        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full bg-card border border-border pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-5">

          {/* Companies */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-muted font-semibold flex items-center gap-1">
                <Building2 size={10} /> Companies
              </p>
              <button onClick={() => setShowCreateCompany(true)} className="text-accent hover:text-accent/80">
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-0.5">
              {filteredCompanies.map((co) => {
                const contacts = contactsForCompany(co.id);
                const isExpanded = expandedCompanies.has(co.id);
                const isSelected = selectedCompanyId === co.id && !selectedCustomerId;
                return (
                  <div key={co.id}>
                    <div className={cn(
                      "flex items-center gap-1 px-2 py-2 rounded text-sm cursor-pointer group transition-colors",
                      isSelected ? "bg-accent/15 text-accent" : "hover:bg-card text-foreground"
                    )}>
                      <button
                        onClick={() => toggleExpand(co.id)}
                        className="shrink-0 text-muted hover:text-foreground p-0.5"
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                      <button className="flex-1 text-left min-w-0" onClick={() => selectCompany(co.id)}>
                        <span className="font-medium truncate block">{co.name}</span>
                        <span className="text-xs text-muted">
                          {co.industry ? `${co.industry} · ` : ""}
                          {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
                        </span>
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="ml-5 mt-0.5 mb-1 space-y-0.5">
                        {contacts.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => selectCustomer(c.id)}
                            className={cn(
                              "w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors",
                              selectedCustomerId === c.id
                                ? "bg-accent/15 text-accent"
                                : "text-muted hover:bg-card hover:text-foreground"
                            )}
                          >
                            <User size={10} className="shrink-0" />
                            <span className="truncate flex-1">{c.name}</span>
                            {c.title && <span className="opacity-50 truncate">{c.title}</span>}
                          </button>
                        ))}
                        <button
                          onClick={() => setShowCreateContact(co.id)}
                          className="w-full text-left px-2 py-1 text-xs text-accent hover:text-accent/80 flex items-center gap-1"
                        >
                          <UserPlus size={10} /> Add Contact
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredCompanies.length === 0 && (
                <p className="text-muted text-xs px-2 py-1">No companies yet</p>
              )}
            </div>
          </div>

          {/* Individuals */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-muted font-semibold flex items-center gap-1">
                <User size={10} /> Individuals
              </p>
              <button onClick={() => setShowCreateIndividual(true)} className="text-accent hover:text-accent/80">
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-0.5">
              {filteredIndividuals.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectCustomer(c.id)}
                  className={cn(
                    "w-full text-left px-2 py-2 rounded text-sm transition-colors",
                    selectedCustomerId === c.id
                      ? "bg-accent/15 text-accent"
                      : "hover:bg-card text-foreground"
                  )}
                >
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted truncate">{c.email || c.phone || "No contact info"}</p>
                </button>
              ))}
              {filteredIndividuals.length === 0 && (
                <p className="text-muted text-xs px-2 py-1">No individuals yet</p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Right: Detail ── */}
      <div className="flex-1 overflow-y-auto border-l border-border pl-6">
        {selectedCustomer ? (
          <CustomerDetail
            customer={selectedCustomer}
            company={selectedCustomerCompany}
            projects={detailProjects}
            invoices={detailInvoices}
            onDelete={() => deleteCustomer(selectedCustomer.id)}
            onAddNote={(text) => addNote(selectedCustomer.id, text)}
            onUpdate={(fields) => updateCustomer(selectedCustomer.id, fields)}
          />
        ) : selectedCompany ? (
          <CompanyDetail
            company={selectedCompany}
            contacts={contactsForCompany(selectedCompany.id)}
            projects={detailProjects}
            onDelete={() => deleteCompany(selectedCompany.id)}
            onSelectContact={selectCustomer}
            onAddContact={() => setShowCreateContact(selectedCompany.id)}
            onUpdate={(fields) => updateCompany(selectedCompany.id, fields)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted gap-2">
            <Building2 size={28} className="opacity-20" />
            <p className="text-sm">Select a company or customer to view details</p>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showCreateCompany && (
        <CModal title="New Company" onClose={() => setShowCreateCompany(false)}>
          <CompanyForm onSubmit={createCompany} onCancel={() => setShowCreateCompany(false)} />
        </CModal>
      )}
      {showCreateIndividual && (
        <CModal title="New Individual" onClose={() => setShowCreateIndividual(false)}>
          <IndividualForm onSubmit={createIndividual} onCancel={() => setShowCreateIndividual(false)} />
        </CModal>
      )}
      {showCreateContact && showingContactModal && (
        <CModal title={`Add Contact — ${showingContactModal.name}`} onClose={() => setShowCreateContact(null)}>
          <ContactForm
            onSubmit={(form) => createContact(showCreateContact, form)}
            onCancel={() => setShowCreateContact(null)}
          />
        </CModal>
      )}
    </div>
  );
}

// ── Company detail panel ─────────────────────────────────────

function CompanyDetail({ company, contacts, projects, onDelete, onSelectContact, onAddContact, onUpdate }: {
  company: Company;
  contacts: Customer[];
  projects: CustomWork[];
  onDelete: () => void;
  onSelectContact: (id: string) => void;
  onAddContact: () => void;
  onUpdate: (fields: Partial<Company>) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: company.name, industry: company.industry ?? "", address: company.address ?? "", phone: company.phone ?? "", website: company.website ?? "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const totalQuoted = projects.reduce((s, p) => s + (p.quoted_amount || 0), 0);

  // Sync form if company prop changes (e.g. after another company selected)
  const companyId = company.id;
  useState(() => { setForm({ name: company.name, industry: company.industry ?? "", address: company.address ?? "", phone: company.phone ?? "", website: company.website ?? "" }); setEditing(false); });

  function saveEdit() {
    onUpdate({ name: form.name, industry: form.industry || undefined, address: form.address || undefined, phone: form.phone || undefined, website: form.website || undefined });
    setEditing(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Building2 size={16} className="text-accent" />
            <h2 className="text-xl font-heading font-bold">{company.name}</h2>
          </div>
          {company.industry && !editing && <p className="text-muted text-sm">{company.industry}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!editing && !confirmDel && (
            <button onClick={() => { setForm({ name: company.name, industry: company.industry ?? "", address: company.address ?? "", phone: company.phone ?? "", website: company.website ?? "" }); setEditing(true); }} className="text-muted hover:text-accent flex items-center gap-1 text-xs border border-border px-2 py-1">
              <Pencil size={11} /> Edit
            </button>
          )}
          {confirmDel ? (
            <div className="flex items-center gap-2">
              <span className="text-red-500 text-sm">Delete company?</span>
              <button onClick={onDelete} className="text-xs border border-red-400 text-red-500 px-2 py-1 hover:bg-red-50/10">Yes</button>
              <button onClick={() => setConfirmDel(false)} className="text-xs border border-border text-muted px-2 py-1">No</button>
            </div>
          ) : !editing && (
            <button onClick={() => setConfirmDel(true)} className="text-muted hover:text-red-500"><Trash2 size={16} /></button>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing ? (
        <div className="bg-card border border-border p-4 space-y-3">
          <div><label className={lbl}>Company Name</label><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Industry</label><input value={form.industry} onChange={(e) => set("industry", e.target.value)} className={inp} /></div>
          <div>
            <label className={lbl}>Address</label>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => set("address", v)}
              onSelect={(r) => set("address", r.formatted)}
              className={inp}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Phone</label><input type="tel" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} placeholder="(###) ###-####" className={inp} /></div>
            <div><label className={lbl}>Website</label><input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="example.com" className={inp} /></div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={saveEdit} disabled={!form.name} className="flex items-center gap-1 bg-accent text-white text-sm px-4 py-2 hover:bg-accent/80 disabled:opacity-40"><Check size={13} /> Save</button>
            <button onClick={() => setEditing(false)} className="text-sm border border-border text-muted px-4 py-2 hover:text-foreground">Cancel</button>
          </div>
        </div>
      ) : (
        /* Info read-only */
        <div className="bg-card border border-border p-4 grid grid-cols-2 gap-4 text-sm">
          {company.address && <div><span className="text-xs text-muted block">Address</span>{company.address}</div>}
          {company.phone && <div><span className="text-xs text-muted block">Phone</span>{company.phone}</div>}
          {company.website && (
            <div className="col-span-2">
              <span className="text-xs text-muted block">Website</span>
              <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                target="_blank" rel="noopener noreferrer"
                className="text-accent hover:underline flex items-center gap-1"
              >
                {company.website} <ExternalLink size={12} />
              </a>
            </div>
          )}
          {!company.address && !company.phone && !company.website && (
            <p className="col-span-2 text-muted text-xs">No details — click Edit to add.</p>
          )}
        </div>
      )}


      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border p-3">
          <p className="text-xs text-muted">Contacts</p>
          <p className="text-xl font-mono font-bold">{contacts.length}</p>
        </div>
        <div className="bg-card border border-border p-3">
          <p className="text-xs text-muted">Projects</p>
          <p className="text-xl font-mono font-bold">{projects.length}</p>
        </div>
        <div className="bg-card border border-border p-3">
          <p className="text-xs text-muted">Total Quoted</p>
          <p className="text-xl font-mono font-bold">{money(totalQuoted)}</p>
        </div>
      </div>

      {/* Contacts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-wider text-muted">Contacts ({contacts.length})</h3>
          <button onClick={onAddContact} className="text-accent text-xs flex items-center gap-1 hover:text-accent/80">
            <UserPlus size={12} /> Add Contact
          </button>
        </div>
        {contacts.length === 0 ? (
          <p className="text-muted text-sm">No contacts yet — add one above.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectContact(c.id)}
                className="w-full text-left bg-card border border-border p-3 hover:border-accent/50 transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  {c.title && <p className="text-xs text-accent">{c.title}</p>}
                  <p className="text-xs text-muted mt-0.5">{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"}</p>
                </div>
                <ChevronRight size={14} className="text-muted shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted mb-3">Projects</h3>
          <div className="space-y-1">
            {projects.map((p) => (
              <div key={p.id} className="bg-card border border-border p-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{p.project_name}</p>
                  {p.client_name && <p className="text-xs text-muted">{p.client_name}</p>}
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-xs text-muted capitalize">{p.status.replace("_", " ")}</p>
                  {p.quoted_amount > 0 && <p className="text-xs font-mono">{money(p.quoted_amount)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Customer / Contact detail panel ─────────────────────────

function CustomerDetail({ customer, company, projects, invoices, onDelete, onAddNote, onUpdate }: {
  customer: Customer;
  company: Company | null;
  projects: CustomWork[];
  invoices: Invoice[];
  onDelete: () => void;
  onAddNote: (text: string) => void;
  onUpdate: (fields: Partial<Customer>) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: customer.name, title: customer.title ?? "", email: customer.email ?? "", phone: customer.phone ?? "", address: customer.address ?? "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const totalSpend = projects.reduce((s, p) => s + (p.quoted_amount || 0), 0);

  function saveEdit() {
    onUpdate({ name: form.name, title: form.title || undefined, email: form.email || undefined, phone: form.phone || undefined, address: form.address || undefined });
    setEditing(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <User size={16} className="text-accent" />
            <h2 className="text-xl font-heading font-bold">{customer.name}</h2>
          </div>
          <p className="text-muted text-sm">
            {customer.title ? `${customer.title} · ` : ""}
            {company
              ? <span>Contact at <span className="text-accent font-medium">{company.name}</span></span>
              : "Individual"
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!editing && !confirmDel && (
            <button onClick={() => { setForm({ name: customer.name, title: customer.title ?? "", email: customer.email ?? "", phone: customer.phone ?? "", address: customer.address ?? "" }); setEditing(true); }} className="text-muted hover:text-accent flex items-center gap-1 text-xs border border-border px-2 py-1">
              <Pencil size={11} /> Edit
            </button>
          )}
          {confirmDel ? (
            <div className="flex items-center gap-2">
              <span className="text-red-500 text-sm">Delete?</span>
              <button onClick={onDelete} className="text-xs border border-red-400 text-red-500 px-2 py-1 hover:bg-red-50/10">Yes</button>
              <button onClick={() => setConfirmDel(false)} className="text-xs border border-border text-muted px-2 py-1">No</button>
            </div>
          ) : !editing && (
            <button onClick={() => setConfirmDel(true)} className="text-muted hover:text-red-500"><Trash2 size={16} /></button>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing ? (
        <div className="bg-card border border-border p-4 space-y-3">
          <div><label className={lbl}>Name</label><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} /></div>
          {customer.type === "Contact" && (
            <div><label className={lbl}>Title / Role</label><input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Project Manager" className={inp} /></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Email</label><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inp} /></div>
            <div><label className={lbl}>Phone</label><input type="tel" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} placeholder="(###) ###-####" className={inp} /></div>
          </div>
          <div><label className={lbl}>Address</label><AddressAutocomplete value={form.address} onChange={(v) => set("address", v)} onSelect={(r) => set("address", r.formatted)} className={inp} /></div>
          <div className="flex gap-2 pt-1">
            <button onClick={saveEdit} disabled={!form.name} className="flex items-center gap-1 bg-accent text-white text-sm px-4 py-2 hover:bg-accent/80 disabled:opacity-40"><Check size={13} /> Save</button>
            <button onClick={() => setEditing(false)} className="text-sm border border-border text-muted px-4 py-2 hover:text-foreground">Cancel</button>
          </div>
        </div>
      ) : (
        /* Contact info read-only */
        <div className="bg-card border border-border p-4 grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-xs text-muted block">Email</span>{customer.email || "—"}</div>
          <div><span className="text-xs text-muted block">Phone</span>{customer.phone || "—"}</div>
          {customer.address && <div className="col-span-2"><span className="text-xs text-muted block">Address</span>{customer.address}</div>}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border p-3">
          <p className="text-xs text-muted">Projects</p>
          <p className="text-xl font-mono font-bold">{projects.length}</p>
        </div>
        <div className="bg-card border border-border p-3">
          <p className="text-xs text-muted">Total Quoted</p>
          <p className="text-xl font-mono font-bold">{money(totalSpend)}</p>
        </div>
        <div className="bg-card border border-border p-3">
          <p className="text-xs text-muted">Open Invoices</p>
          <p className="text-xl font-mono font-bold">{invoices.filter((i) => i.status !== "paid").length}</p>
        </div>
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted mb-3">Projects</h3>
          <div className="space-y-1">
            {projects.map((p) => (
              <div key={p.id} className="bg-card border border-border p-3 flex items-center justify-between text-sm">
                <p className="font-medium">{p.project_name}</p>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-xs text-muted capitalize">{p.status.replace("_", " ")}</p>
                  {p.quoted_amount > 0 && <p className="text-xs font-mono">{money(p.quoted_amount)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-muted mb-3">Notes</h3>
        <div className="space-y-2 mb-3">
          {(customer.notes || []).map((n: CustomerNote, i: number) => (
            <div key={i} className="bg-card border border-border p-3 text-sm">
              <p>{n.text}</p>
              <p className="text-xs text-muted mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
        <NoteBox onSubmit={onAddNote} />
      </div>
    </div>
  );
}

// ── Modal wrapper ────────────────────────────────────────────

function CModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border p-6 z-50 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-heading font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={20} /></button>
        </div>
        {children}
      </div>
    </>
  );
}

// ── Company form ─────────────────────────────────────────────

function CompanyForm({ onSubmit, onCancel }: { onSubmit: (f: Record<string, string>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: "", industry: "", address: "", phone: "", website: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <div><label className={lbl}>Company Name *</label><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} /></div>
      <div><label className={lbl}>Industry</label><input value={form.industry} onChange={(e) => set("industry", e.target.value)} className={inp} /></div>
      <div><label className={lbl}>Address</label><AddressAutocomplete value={form.address} onChange={(v) => set("address", v)} onSelect={(r) => set("address", r.formatted)} className={inp} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>Phone</label><input type="tel" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} placeholder="(###) ###-####" className={inp} /></div>
        <div><label className={lbl}>Website</label><input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="relicbuilt.com" className={inp} /></div>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit(form)} disabled={!form.name}>Add Company</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Individual form ──────────────────────────────────────────

function IndividualForm({ onSubmit, onCancel }: { onSubmit: (f: Record<string, string>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <div><label className={lbl}>Name *</label><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} /></div>
      <div><label className={lbl}>Email</label><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inp} /></div>
      <div><label className={lbl}>Phone</label><input type="tel" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} placeholder="(###) ###-####" className={inp} /></div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit(form)} disabled={!form.name}>Add Individual</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Contact form ─────────────────────────────────────────────

function ContactForm({ onSubmit, onCancel }: { onSubmit: (f: Record<string, string>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: "", title: "", email: "", phone: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <div><label className={lbl}>Name *</label><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} /></div>
      <div><label className={lbl}>Title / Role</label><input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Project Manager" className={inp} /></div>
      <div><label className={lbl}>Email</label><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inp} /></div>
      <div><label className={lbl}>Phone</label><input type="tel" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} placeholder="(###) ###-####" className={inp} /></div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit(form)} disabled={!form.name}>Add Contact</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Note box ─────────────────────────────────────────────────

function NoteBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Add a note…"
        className="flex-1 bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
        onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onSubmit(text.trim()); setText(""); } }}
      />
      <Button size="sm" onClick={() => { if (text.trim()) { onSubmit(text.trim()); setText(""); } }}>Add</Button>
    </div>
  );
}
