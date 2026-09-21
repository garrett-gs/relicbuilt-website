"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { useEntity } from "@/components/axiom/EntityProvider";
import { Note, Customer, BusinessEntity } from "@/types/axiom";
import { formatDateTime, cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { Plus, X, Trash2, Search, StickyNote, Users2, Share2, Lock } from "lucide-react";

const entityLabel = (e?: BusinessEntity) => (e === "relic" ? "RELIC" : "Wallflower");

export default function NotesPage() {
  const { userEmail } = useAuth();
  const { entity } = useEntity();
  const [notes, setNotes] = useState<Note[]>([]);
  const [customers, setCustomers] = useState<Pick<Customer, "id" | "name">[]>([]);
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

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const customerName = (id?: string) => customers.find((c) => c.id === id)?.name;

  const filtered = notes.filter((n) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (n.title || "").toLowerCase().includes(q)
      || (n.body || "").toLowerCase().includes(q)
      || (customerName(n.customer_id) || "").toLowerCase().includes(q);
  });

  async function saveNote(form: NoteFormValues, existing: Note | null) {
    if (existing) {
      const { data } = await axiom
        .from("notes")
        .update({
          title: form.title || null,
          body: form.body || null,
          shared: form.shared,
          customer_id: form.customer_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (data) {
        await logActivity({ action: "updated", entity: "note", entity_id: data.id, label: `Updated note: ${data.title || "Untitled"}`, user_name: userEmail });
      }
    } else {
      const { data } = await axiom
        .from("notes")
        .insert({
          entity,
          title: form.title || null,
          body: form.body || null,
          shared: form.shared,
          customer_id: form.customer_id || null,
          created_by: userEmail || null,
        })
        .select()
        .single();
      if (data) {
        await logActivity({ action: "created", entity: "note", entity_id: data.id, label: `Added note: ${data.title || "Untitled"}`, user_name: userEmail });
      }
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
        Your running notebook — paste call summaries and keep a record of conversations. Private to {entityLabel(entity)} unless you mark a note <span className="text-accent">Shared</span>. Never visible to clients.
      </p>

      <div className="relative mb-6 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes..." className="w-full bg-card border border-border pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
      </div>

      <div className="space-y-2">
        {filtered.map((n) => {
          const fromOtherSide = n.entity !== entity;
          const client = customerName(n.customer_id);
          return (
            <button
              key={n.id}
              onClick={() => setEditing(n)}
              className="w-full text-left bg-card border border-border p-4 hover:border-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
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
                </div>
              </div>
            </button>
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
}

function NoteModal({
  note,
  entity,
  customers,
  onClose,
  onSave,
  onDelete,
}: {
  note: Note | null;
  entity: BusinessEntity;
  customers: Pick<Customer, "id" | "name">[];
  onClose: () => void;
  onSave: (f: NoteFormValues, existing: Note | null) => void;
  onDelete: (id: string) => void;
}) {
  const readOnly = !!note && note.entity !== entity; // shared from the other side
  const [form, setForm] = useState<NoteFormValues>({
    title: note?.title || "",
    body: note?.body || "",
    shared: note?.shared || false,
    customer_id: note?.customer_id || "",
  });
  const set = <K extends keyof NoteFormValues>(k: K, v: NoteFormValues[K]) => setForm((f) => ({ ...f, [k]: v }));
  const otherSide = entity === "relic" ? "Wallflower" : "RELIC";

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-background border border-border p-6 z-50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-bold">
            {readOnly ? "Note" : note ? "Edit Note" : "New Note"}
          </h2>
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
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Lauren — kickoff call 9/21"
                className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Note</label>
              <textarea
                value={form.body}
                onChange={(e) => set("body", e.target.value)}
                rows={10}
                placeholder="Paste your call summary here, or jot notes…"
                className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent resize-y leading-relaxed"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5 flex items-center gap-1.5"><Users2 size={12} /> Link to client (optional)</label>
              <select
                value={form.customer_id}
                onChange={(e) => set("customer_id", e.target.value)}
                className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
              >
                <option value="">— None —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Visibility</label>
              <div className="flex gap-1 bg-card border border-border rounded p-1">
                <button
                  type="button"
                  onClick={() => set("shared", false)}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded transition-colors", !form.shared ? "bg-accent/20 text-accent font-medium" : "text-muted hover:text-foreground")}
                >
                  <Lock size={12} /> Private
                </button>
                <button
                  type="button"
                  onClick={() => set("shared", true)}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded transition-colors", form.shared ? "bg-accent/20 text-accent font-medium" : "text-muted hover:text-foreground")}
                >
                  <Share2 size={12} /> Shared
                </button>
              </div>
              <p className="text-[11px] text-muted/70 mt-1.5">
                {form.shared
                  ? `Visible to the ${otherSide} side too. Clients never see it.`
                  : `Only visible on the ${entityLabel(entity)} side.`}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button onClick={() => onSave(form, note)} disabled={!form.title && !form.body}>
                {note ? "Save" : "Add Note"}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              {note && (
                <button onClick={() => onDelete(note.id)} className="ml-auto text-muted hover:text-red-500" title="Delete note">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
