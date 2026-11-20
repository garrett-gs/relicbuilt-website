"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { useEntity } from "@/components/axiom/EntityProvider";
import { Note, Customer, BusinessEntity } from "@/types/axiom";
import { NoteRecordType, NOTE_RECORD_COLUMN } from "@/components/axiom/RecordNotesPanel";
import { formatDateTime, cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { Plus, X, Trash2, Search, StickyNote, Users2, Share2, Lock, Hammer, FileText, ClipboardList, AtSign } from "lucide-react";

const entityLabel = (e?: BusinessEntity) => (e === "relic" ? "RELIC" : "Wallflower");

// A record a note can be tagged to (the Slack-style @ target).
type RecordRef = { type: NoteRecordType; id: string; label: string; sub?: string };

const RECORD_META: Record<NoteRecordType, { label: string; icon: typeof Hammer; href: (id: string) => string }> = {
  project: { label: "Project", icon: Hammer, href: (id) => `/axiom/projects?id=${id}` },
  quote: { label: "Quote", icon: FileText, href: () => `/axiom/estimator` },
  order: { label: "Order", icon: ClipboardList, href: () => `/axiom/wallflower` },
};

function recordOfNote(n: Note): { type: NoteRecordType; id: string } | null {
  if (n.custom_work_id) return { type: "project", id: n.custom_work_id };
  if (n.estimate_id) return { type: "quote", id: n.estimate_id };
  if (n.work_order_id) return { type: "order", id: n.work_order_id };
  return null;
}

export default function NotesPage() {
  const { userEmail } = useAuth();
  const { entity } = useEntity();
  const [notes, setNotes] = useState<Note[]>([]);
  const [customers, setCustomers] = useState<Pick<Customer, "id" | "name">[]>([]);
  const [records, setRecords] = useState<RecordRef[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    // Own-entity notes, plus any note the other side marked shared.
    const { data } = await axiom
      .from("notes")
      .select("*")
      .or(`entity.eq.${entity},shared.eq.true`)
      .order("created_at", { ascending: false });
    if (data) setNotes(data);
  }, [entity]);

  const loadCustomers = useCallback(async () => {
    const { data } = await axiom.from("customers").select("id, name").eq("entity", entity).order("name");
    if (data) setCustomers(data);
  }, [entity]);

  // Everything a note can be tagged to: projects, quotes, and work orders.
  const loadRecords = useCallback(async () => {
    const [projects, quotes, orders] = await Promise.all([
      axiom.from("custom_work").select("id, project_name, client_name").eq("entity", entity).order("created_at", { ascending: false }).limit(200),
      axiom.from("estimates").select("id, estimate_number, project_name, client_name").eq("entity", entity).order("created_at", { ascending: false }).limit(200),
      axiom.from("wallflower_work_orders").select("id, item_name, wallflower_order_number").order("created_at", { ascending: false }).limit(200),
    ]);
    const refs: RecordRef[] = [];
    (projects.data || []).forEach((p: { id: string; project_name?: string; client_name?: string }) =>
      refs.push({ type: "project", id: p.id, label: p.project_name || "Untitled project", sub: p.client_name || undefined }));
    (quotes.data || []).forEach((q: { id: string; estimate_number?: string; project_name?: string; client_name?: string }) =>
      refs.push({ type: "quote", id: q.id, label: q.project_name || q.estimate_number || "Quote", sub: q.estimate_number || q.client_name || undefined }));
    (orders.data || []).forEach((o: { id: string; item_name?: string; wallflower_order_number?: string }) =>
      refs.push({ type: "order", id: o.id, label: o.item_name || "Work order", sub: o.wallflower_order_number || undefined }));
    setRecords(refs);
  }, [entity]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCustomers(); }, [loadCustomers]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const customerName = (id?: string) => customers.find((c) => c.id === id)?.name;
  const recordMap = useMemo(() => {
    const m = new Map<string, RecordRef>();
    records.forEach((r) => m.set(`${r.type}:${r.id}`, r));
    return m;
  }, [records]);
  const recordOf = (n: Note): RecordRef | null => {
    const r = recordOfNote(n);
    if (!r) return null;
    return recordMap.get(`${r.type}:${r.id}`) || { type: r.type, id: r.id, label: `${RECORD_META[r.type].label}` };
  };

  const filtered = notes.filter((n) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const rec = recordOf(n);
    return (n.title || "").toLowerCase().includes(q)
      || (n.body || "").toLowerCase().includes(q)
      || (customerName(n.customer_id) || "").toLowerCase().includes(q)
      || (rec?.label || "").toLowerCase().includes(q)
      || (rec?.sub || "").toLowerCase().includes(q);
  });

  async function saveNote(form: NoteFormValues, existing: Note | null) {
    // Exactly one record column is set; the rest are cleared.
    const recordCols = { custom_work_id: null, estimate_id: null, work_order_id: null } as Record<string, string | null>;
    if (form.attach) recordCols[NOTE_RECORD_COLUMN[form.attach.type]] = form.attach.id;

    const payload = {
      title: form.title || null,
      body: form.body || null,
      shared: form.shared,
      customer_id: form.customer_id || null,
      ...recordCols,
    };

    if (existing) {
      const { data } = await axiom.from("notes").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing.id).select().single();
      if (data) await logActivity({ action: "updated", entity: "note", entity_id: data.id, label: `Updated note: ${data.title || "Untitled"}`, user_name: userEmail });
    } else {
      const { data } = await axiom.from("notes").insert({ entity, created_by: userEmail || null, ...payload }).select().single();
      if (data) await logActivity({ action: "created", entity: "note", entity_id: data.id, label: `Added note: ${data.title || "Untitled"}`, user_name: userEmail });
    }
    setEditing(null);
    setShowCreate(false);
    load();
  }

  async function deleteNote(id: string) {
    if (!confirm("Delete this note? This can't be undone.")) return;
    await axiom.from("notes").delete().eq("id", id);
    setEditing(null);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-heading font-bold">Notes</h1>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} className="mr-1" /> New Note</Button>
      </div>
      <p className="text-sm text-muted mb-6">
        Your running notebook — jot notes and <span className="text-accent">@ tag a project, quote, or order</span> so the note also shows up on that record. Private to {entityLabel(entity)} unless you mark it <span className="text-accent">Shared</span>. Never visible to clients.
      </p>

      <div className="relative mb-6 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes, clients, records..." className="w-full bg-card border border-border pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
      </div>

      <div className="space-y-2">
        {filtered.map((n) => {
          const fromOtherSide = n.entity !== entity;
          const client = customerName(n.customer_id);
          const rec = recordOf(n);
          const RecIcon = rec ? RECORD_META[rec.type].icon : null;
          return (
            <div key={n.id} className="bg-card border border-border p-4 hover:border-accent/50 transition-colors">
              <button onClick={() => setEditing(n)} className="w-full text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm truncate">{n.title || "Untitled note"}</p>
                  {n.shared && !fromOtherSide && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-accent border border-accent/40 px-1.5 py-0.5"><Share2 size={10} /> Shared</span>
                  )}
                  {fromOtherSide && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted border border-border px-1.5 py-0.5"><Share2 size={10} /> From {entityLabel(n.entity)}</span>
                  )}
                </div>
                {n.body && <p className="text-xs text-muted mt-1 line-clamp-2 whitespace-pre-wrap">{n.body}</p>}
                <p className="text-[11px] text-muted/70 mt-2">
                  {formatDateTime(n.created_at)}
                  {client ? ` · ${client}` : ""}
                </p>
              </button>
              {rec && RecIcon && (
                <Link
                  href={RECORD_META[rec.type].href(rec.id)}
                  className="inline-flex items-center gap-1.5 mt-2 text-[11px] text-accent border border-accent/30 bg-accent/5 hover:bg-accent/10 px-2 py-1 transition-colors"
                  title={`Open ${RECORD_META[rec.type].label.toLowerCase()}`}
                >
                  <RecIcon size={11} />
                  <span className="text-muted uppercase tracking-wider text-[9px]">{RECORD_META[rec.type].label}</span>
                  <span className="text-foreground truncate max-w-[220px]">{rec.label}</span>
                </Link>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted">
            <StickyNote size={28} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">{search ? "No notes match your search" : "No notes yet — add your first one"}</p>
          </div>
        )}
      </div>

      {(showCreate || editing) && (
        <NoteModal
          note={editing}
          entity={entity}
          customers={customers}
          records={records}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSave={saveNote}
          onDelete={deleteNote}
        />
      )}
    </div>
  );
}

interface NoteFormValues {
  title: string;
  body: string;
  shared: boolean;
  customer_id: string;
  attach: RecordRef | null;
}

function NoteModal({
  note,
  entity,
  customers,
  records,
  onClose,
  onSave,
  onDelete,
}: {
  note: Note | null;
  entity: BusinessEntity;
  customers: Pick<Customer, "id" | "name">[];
  records: RecordRef[];
  onClose: () => void;
  onSave: (f: NoteFormValues, existing: Note | null) => void;
  onDelete: (id: string) => void;
}) {
  const readOnly = !!note && note.entity !== entity; // shared from the other side

  const existingAttach: RecordRef | null = useMemo(() => {
    if (!note) return null;
    const r = recordOfNote(note);
    if (!r) return null;
    return records.find((x) => x.type === r.type && x.id === r.id) || { type: r.type, id: r.id, label: RECORD_META[r.type].label };
  }, [note, records]);

  const [form, setForm] = useState<NoteFormValues>({
    title: note?.title || "",
    body: note?.body || "",
    shared: note?.shared || false,
    customer_id: note?.customer_id || "",
    attach: existingAttach,
  });
  const set = <K extends keyof NoteFormValues>(k: K, v: NoteFormValues[K]) => setForm((f) => ({ ...f, [k]: v }));
  const otherSide = entity === "relic" ? "Wallflower" : "RELIC";

  // @ record picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const list = q
      ? records.filter((r) => r.label.toLowerCase().includes(q) || (r.sub || "").toLowerCase().includes(q))
      : records;
    return list.slice(0, 40);
  }, [pickerQuery, records]);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-background border border-border p-6 z-50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-bold">{readOnly ? "Note" : note ? "Edit Note" : "New Note"}</h2>
          <button onClick={onClose} className="text-muted"><X size={20} /></button>
        </div>

        {readOnly ? (
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted border border-border px-1.5 py-0.5">
              <Share2 size={10} /> Shared from {entityLabel(note!.entity)} — view only
            </span>
            <p className="font-medium text-base">{note!.title || "Untitled note"}</p>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{note!.body || "(empty)"}</p>
            <p className="text-[11px] text-muted/70 pt-2 border-t border-border">{formatDateTime(note!.created_at)}</p>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Title</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Lauren — kickoff call 9/21" className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Note</label>
              <textarea value={form.body} onChange={(e) => set("body", e.target.value)} rows={8} placeholder="Paste your call summary here, or jot notes…" className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent resize-y leading-relaxed" />
            </div>

            {/* @ Attach to a record */}
            <div ref={pickerRef} className="relative">
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5 flex items-center gap-1.5"><AtSign size={12} /> Attach to a record (optional)</label>
              {form.attach ? (
                <div className="flex items-center gap-2 bg-accent/10 border border-accent/30 px-3 py-2.5">
                  {(() => { const I = RECORD_META[form.attach.type].icon; return <I size={14} className="text-accent shrink-0" />; })()}
                  <span className="text-[9px] uppercase tracking-wider text-muted">{RECORD_META[form.attach.type].label}</span>
                  <span className="text-sm text-foreground truncate flex-1">{form.attach.label}{form.attach.sub ? <span className="text-muted"> · {form.attach.sub}</span> : null}</span>
                  <button type="button" onClick={() => set("attach", null)} className="text-muted hover:text-foreground shrink-0" title="Remove"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <input
                    value={pickerQuery}
                    onChange={(e) => { setPickerQuery(e.target.value); setPickerOpen(true); }}
                    onFocus={() => setPickerOpen(true)}
                    onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                    placeholder="Type to search projects, quotes, orders…"
                    className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
                  />
                  {pickerOpen && pickerResults.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 bg-card border border-border shadow-lg mt-0.5 max-h-56 overflow-y-auto">
                      {pickerResults.map((r) => {
                        const I = RECORD_META[r.type].icon;
                        return (
                          <button
                            key={`${r.type}:${r.id}`}
                            type="button"
                            onMouseDown={() => { set("attach", r); setPickerOpen(false); setPickerQuery(""); }}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-background flex items-center gap-2"
                          >
                            <I size={13} className="text-accent shrink-0" />
                            <span className="text-[9px] uppercase tracking-wider text-muted w-12 shrink-0">{RECORD_META[r.type].label}</span>
                            <span className="text-foreground truncate flex-1">{r.label}</span>
                            {r.sub && <span className="text-xs text-muted truncate max-w-[120px]">{r.sub}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5 flex items-center gap-1.5"><Users2 size={12} /> Link to client (optional)</label>
              <select value={form.customer_id} onChange={(e) => set("customer_id", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent">
                <option value="">— None —</option>
                {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Visibility</label>
              <div className="flex gap-1 bg-card border border-border rounded p-1">
                <button type="button" onClick={() => set("shared", false)} className={cn("flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded transition-colors", !form.shared ? "bg-accent/20 text-accent font-medium" : "text-muted hover:text-foreground")}>
                  <Lock size={12} /> Private
                </button>
                <button type="button" onClick={() => set("shared", true)} className={cn("flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded transition-colors", form.shared ? "bg-accent/20 text-accent font-medium" : "text-muted hover:text-foreground")}>
                  <Share2 size={12} /> Shared
                </button>
              </div>
              <p className="text-[11px] text-muted/70 mt-1.5">
                {form.shared ? `Visible to the ${otherSide} side too. Clients never see it.` : `Only visible on the ${entityLabel(entity)} side.`}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button onClick={() => onSave(form, note)} disabled={!form.title && !form.body}>{note ? "Save" : "Add Note"}</Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              {note && (
                <button onClick={() => onDelete(note.id)} className="ml-auto text-muted hover:text-red-500" title="Delete note"><Trash2 size={16} /></button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
