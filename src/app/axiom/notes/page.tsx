"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { useEntity } from "@/components/axiom/EntityProvider";
import { Note, BusinessEntity } from "@/types/axiom";
import { NoteRecordType, NOTE_RECORD_COLUMN } from "@/components/axiom/RecordNotesPanel";
import { cn } from "@/lib/utils";
import { Hammer, FileText, ClipboardList, AtSign, Share2, Lock, Trash2, Sparkles, X, Send } from "lucide-react";

const entityLabel = (e?: BusinessEntity) => (e === "relic" ? "RELIC" : "Wallflower");

type RecordRef = { type: NoteRecordType; id: string; name: string; num?: string; status?: string; client?: string };

const TYPE_META: Record<NoteRecordType, { label: string; plural: string; icon: typeof Hammer; color: string; href: (id: string) => string }> = {
  project: { label: "Project", plural: "Projects", icon: Hammer, color: "#6b8f4e", href: (id) => `/axiom/projects?id=${id}` },
  quote: { label: "Quote", plural: "Quotes", icon: FileText, color: "#c98b4b", href: () => `/axiom/estimator` },
  order: { label: "Order", plural: "Orders", icon: ClipboardList, color: "#4e7f8f", href: () => `/axiom/wallflower` },
};
const TYPE_ORDER: NoteRecordType[] = ["project", "quote", "order"];

function recordKeyOfNote(n: Note): { type: NoteRecordType; id: string } | null {
  if (n.custom_work_id) return { type: "project", id: n.custom_work_id };
  if (n.estimate_id) return { type: "quote", id: n.estimate_id };
  if (n.work_order_id) return { type: "order", id: n.work_order_id };
  return null;
}

// Stable per-person avatar color.
const AV_COLORS = ["#6b8f4e", "#c98b4b", "#4e7f8f", "#8f6b8f", "#b8963c", "#8f4e4e"];
function avatarFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const color = AV_COLORS[h % AV_COLORS.length];
  const local = name.split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = local.split(" ").filter(Boolean);
  const ini = ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase() || "?";
  return { color, ini };
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function NotesPage() {
  const { userEmail } = useAuth();
  const { entity } = useEntity();
  const [notes, setNotes] = useState<Note[]>([]);
  const [records, setRecords] = useState<RecordRef[]>([]);
  const [view, setView] = useState<string>("all"); // "all" | "__none" | recordId

  // composer
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState<RecordRef | null>(null);
  const [shared, setShared] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [posting, setPosting] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await axiom
      .from("notes")
      .select("*")
      .or(`entity.eq.${entity},shared.eq.true`)
      .order("created_at", { ascending: true });
    if (data) setNotes(data);
  }, [entity]);

  const loadRecords = useCallback(async () => {
    const [projects, quotes, orders] = await Promise.all([
      axiom.from("custom_work").select("id, project_name, client_name, status").eq("entity", entity).order("created_at", { ascending: false }).limit(200),
      axiom.from("estimates").select("id, estimate_number, project_name, client_name, status").eq("entity", entity).order("created_at", { ascending: false }).limit(200),
      axiom.from("wallflower_work_orders").select("id, item_name, wallflower_order_number, client_name, status").order("created_at", { ascending: false }).limit(200),
    ]);
    const refs: RecordRef[] = [];
    (projects.data || []).forEach((p: { id: string; project_name?: string; client_name?: string; status?: string }) =>
      refs.push({ type: "project", id: p.id, name: p.project_name || "Untitled project", status: p.status, client: p.client_name || undefined }));
    (quotes.data || []).forEach((q: { id: string; estimate_number?: string; project_name?: string; client_name?: string; status?: string }) =>
      refs.push({ type: "quote", id: q.id, name: q.project_name || q.estimate_number || "Quote", num: q.estimate_number || undefined, status: q.status, client: q.client_name || undefined }));
    (orders.data || []).forEach((o: { id: string; item_name?: string; wallflower_order_number?: string; client_name?: string; status?: string }) =>
      refs.push({ type: "order", id: o.id, name: o.item_name || "Work order", num: o.wallflower_order_number || undefined, status: o.status, client: o.client_name || undefined }));
    setRecords(refs);
  }, [entity]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  // close the tag menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  const recordMap = useMemo(() => {
    const m = new Map<string, RecordRef>();
    records.forEach((r) => m.set(`${r.type}:${r.id}`, r));
    return m;
  }, [records]);
  const recordOf = (n: Note): RecordRef | null => {
    const k = recordKeyOfNote(n);
    if (!k) return null;
    return recordMap.get(`${k.type}:${k.id}`) || { type: k.type, id: k.id, name: TYPE_META[k.type].label };
  };
  const countFor = (predicate: (n: Note) => boolean) => notes.filter(predicate).length;
  const countForRecord = (r: RecordRef) => countFor((n) => { const k = recordKeyOfNote(n); return !!k && k.type === r.type && k.id === r.id; });

  const viewRecord = view !== "all" && view !== "__none" ? recordMap.get(view) || null : null;

  const visibleNotes = useMemo(() => {
    if (view === "all") return notes;
    if (view === "__none") return notes.filter((n) => !recordKeyOfNote(n));
    return notes.filter((n) => { const k = recordKeyOfNote(n); return !!k && `${k.type}:${k.id}` === view; });
  }, [notes, view]);

  // scroll to newest when the feed changes
  useEffect(() => { if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; }, [visibleNotes.length, view]);

  // when viewing a record, pre-tag the composer to it (like posting in a channel)
  useEffect(() => {
    if (viewRecord) { setTag(viewRecord); } else { setTag(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const menuResults = useMemo(() => {
    const q = menuQuery.trim().toLowerCase();
    return q ? records.filter((r) => r.name.toLowerCase().includes(q) || (r.num || "").toLowerCase().includes(q)) : records;
  }, [menuQuery, records]);

  async function post() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const recordCols: Record<string, string | null> = { custom_work_id: null, estimate_id: null, work_order_id: null };
      if (tag) recordCols[NOTE_RECORD_COLUMN[tag.type]] = tag.id;
      const { data, error } = await axiom
        .from("notes")
        .insert({ entity, body, shared, created_by: userEmail || null, ...recordCols })
        .select()
        .single();
      if (error || !data) {
        // Surface a failed write instead of silently dropping the note, and
        // keep the draft + tag so nothing the user typed is lost.
        alert(error?.message || "Couldn't post that note — nothing was saved. Your text is still here.");
        return;
      }
      await logActivity({ action: "created", entity: "note", entity_id: data.id, label: tag ? `Added note on ${TYPE_META[tag.type].label.toLowerCase()}` : "Added note", user_name: userEmail });
      setDraft("");
      if (!viewRecord) { setTag(null); setShared(false); }
      await load();
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this note? This can't be undone.")) return;
    await axiom.from("notes").delete().eq("id", id);
    load();
  }

  const totalCount = notes.length;
  const noneCount = countFor((n) => !recordKeyOfNote(n));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-heading font-bold">Notes</h1>
        <p className="text-sm text-muted mt-1">
          Shop-wide feed — write a note and <span className="text-accent">@ tag a project, quote, or order</span> to file it there. Private to {entityLabel(entity)} unless you mark it Shared. Never visible to clients.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
        {/* ── Rail: jump to record ── */}
        <aside className="bg-card border border-border md:sticky md:top-3 p-3 order-2 md:order-1">
          <RailButton active={view === "all"} onClick={() => setView("all")} icon={<Sparkles size={14} style={{ color: "var(--accent)" }} />} label="All notes" count={totalCount} />
          {TYPE_ORDER.map((t) => {
            const recs = records.filter((r) => r.type === t);
            if (recs.length === 0) return null;
            const Icon = TYPE_META[t].icon;
            return (
              <div key={t}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted px-2 mt-3 mb-1">{TYPE_META[t].plural}</p>
                {recs.map((r) => (
                  <RailButton
                    key={`${r.type}:${r.id}`}
                    active={view === `${r.type}:${r.id}`}
                    onClick={() => setView(`${r.type}:${r.id}`)}
                    icon={<Icon size={13} style={{ color: TYPE_META[t].color }} />}
                    label={r.name}
                    count={countForRecord(r)}
                  />
                ))}
              </div>
            );
          })}
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted px-2 mt-3 mb-1">Other</p>
          <RailButton active={view === "__none"} onClick={() => setView("__none")} icon={<span className="text-muted">·</span>} label="General (untagged)" count={noneCount} />
        </aside>

        {/* ── Main: feed + composer ── */}
        <section className="bg-card border border-border flex flex-col overflow-hidden order-1 md:order-2" style={{ height: "calc(100vh - 160px)", minHeight: 420 }}>
          {/* header */}
          <div className="px-4 py-3 border-b border-border">
            {view === "all" ? (
              <>
                <h2 className="text-base font-heading font-bold flex items-center gap-2"><Sparkles size={15} style={{ color: "var(--accent)" }} /> All notes</h2>
                <p className="text-xs text-muted mt-1">Shop-wide feed — @ a record to file a note onto it.</p>
              </>
            ) : view === "__none" ? (
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-heading font-bold">General notes</h2>
                <button onClick={() => setView("all")} className="ml-auto text-xs text-muted border border-border px-2.5 py-1 hover:text-foreground hover:border-accent">← Feed</button>
              </div>
            ) : viewRecord ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ color: TYPE_META[viewRecord.type].color, borderColor: TYPE_META[viewRecord.type].color + "55", background: TYPE_META[viewRecord.type].color + "1a" }}>
                    {TYPE_META[viewRecord.type].label}
                  </span>
                  <h2 className="text-base font-heading font-bold">{viewRecord.name}</h2>
                  {viewRecord.status && <span className="text-xs text-muted border border-border rounded-full px-2.5 py-0.5">{viewRecord.status}</span>}
                  <Link href={TYPE_META[viewRecord.type].href(viewRecord.id)} className="text-xs text-accent border border-accent/40 px-2.5 py-1 hover:bg-accent/10">Open</Link>
                  <button onClick={() => setView("all")} className="text-xs text-muted border border-border px-2.5 py-1 hover:text-foreground hover:border-accent">← Feed</button>
                </div>
                <div className="text-xs text-muted mt-1.5 flex gap-4 flex-wrap">
                  {viewRecord.num && <span>{viewRecord.num}</span>}
                  {viewRecord.client && <span>Client: <span className="text-foreground">{viewRecord.client}</span></span>}
                </div>
              </>
            ) : null}
          </div>

          {/* stream */}
          <div ref={streamRef} className="flex-1 overflow-y-auto py-1.5">
            {viewRecord && (
              <div className="mx-4 my-2 px-3 py-2 border border-dashed border-accent/40 bg-accent/10 text-[12.5px] text-accent/90 leading-snug">
                This is the record&apos;s <b>Notes</b> tab. Notes tagged <b>@{viewRecord.name}</b> — here, on the record page, or by Claude over MCP — show up here and in the feed.
              </div>
            )}
            {visibleNotes.length === 0 ? (
              <p className="text-muted text-sm text-center py-8">No notes yet. Add one below — it&apos;ll file here and in the feed.</p>
            ) : (
              visibleNotes.map((n, i) => {
                const prev = visibleNotes[i - 1];
                const showDay = view === "all" && (!prev || dayLabel(prev.created_at) !== dayLabel(n.created_at));
                const who = n.created_by || "Team";
                const av = avatarFor(who);
                const rec = recordOf(n);
                const RecIcon = rec ? TYPE_META[rec.type].icon : null;
                const fromOther = n.entity && n.entity !== entity;
                return (
                  <div key={n.id}>
                    {showDay && (
                      <div className="flex items-center gap-3 px-4 pt-3 pb-1.5 text-[11px] uppercase tracking-wider text-muted">
                        <span className="h-px bg-border flex-1" /> {dayLabel(n.created_at)} <span className="h-px bg-border flex-1" />
                      </div>
                    )}
                    <div className="group flex gap-3 px-4 py-2 hover:bg-background">
                      <div className="w-8 h-8 rounded flex-none grid place-items-center font-heading font-bold text-[12px] text-black" style={{ background: av.color }}>{av.ini}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-[13.5px]">{who.split("@")[0]}</span>
                          <span className="text-[11px] text-muted">{timeLabel(n.created_at)}</span>
                          {n.shared && !fromOther && <span className="text-[10px] uppercase tracking-wider text-accent border border-accent/40 px-1 py-0.5 inline-flex items-center gap-1"><Share2 size={9} /> Shared</span>}
                          {fromOther && <span className="text-[10px] uppercase tracking-wider text-muted border border-border px-1 py-0.5 inline-flex items-center gap-1"><Share2 size={9} /> {entityLabel(n.entity)}</span>}
                          <button onClick={() => remove(n.id)} className="ml-auto text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete note"><Trash2 size={13} /></button>
                        </div>
                        {n.title && <p className="text-sm font-medium text-foreground mt-0.5">{n.title}</p>}
                        {n.body && <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{n.body}</p>}
                        {rec && RecIcon && view === "all" && (
                          <button
                            onClick={() => setView(`${rec.type}:${rec.id}`)}
                            className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] px-2 py-0.5 rounded-full border bg-black/40"
                            style={{ color: TYPE_META[rec.type].color, borderColor: TYPE_META[rec.type].color + "55" }}
                          >
                            <AtSign size={11} /> {rec.name}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* composer */}
          <div className="border-t border-border p-3">
            <div className="border border-border bg-background focus-within:border-accent rounded-md p-2.5">
              {tag && (
                <div className="mb-2">
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] px-2 py-0.5 rounded-full border bg-black/40" style={{ color: TYPE_META[tag.type].color, borderColor: TYPE_META[tag.type].color + "55" }}>
                    <AtSign size={11} /> {tag.name}
                    {!viewRecord && <button onClick={() => setTag(null)} className="text-current"><X size={12} /></button>}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div ref={menuRef} className="relative">
                  <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }} className="inline-flex items-center gap-1.5 bg-black/40 border border-border text-muted px-2.5 py-2 rounded text-[12.5px] hover:text-foreground hover:border-accent">
                    <AtSign size={13} /> Tag
                  </button>
                  {menuOpen && (
                    <div className="absolute bottom-[calc(100%+6px)] left-0 w-72 max-h-80 overflow-y-auto bg-card border border-border rounded-lg p-1.5 shadow-2xl z-20" onClick={(e) => e.stopPropagation()}>
                      <input autoFocus value={menuQuery} onChange={(e) => setMenuQuery(e.target.value)} placeholder="Search records…" className="w-full bg-background border border-border px-2.5 py-2 text-sm mb-1 focus:outline-none focus:border-accent" />
                      {TYPE_ORDER.map((t) => {
                        const recs = menuResults.filter((r) => r.type === t);
                        if (recs.length === 0) return null;
                        const Icon = TYPE_META[t].icon;
                        return (
                          <div key={t}>
                            <p className="text-[10px] uppercase tracking-wider text-muted px-2 pt-2 pb-1">{TYPE_META[t].plural}</p>
                            {recs.slice(0, 30).map((r) => (
                              <button key={`${r.type}:${r.id}`} onClick={() => { setTag(r); setMenuOpen(false); setMenuQuery(""); }} className="w-full text-left flex items-center gap-2 px-2 py-2 rounded hover:bg-accent/10 text-sm">
                                <Icon size={13} style={{ color: TYPE_META[t].color }} className="flex-none" />
                                <span className="truncate flex-1">{r.name}</span>
                                {r.num && <span className="text-[11px] text-muted">{r.num}</span>}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                      {menuResults.length === 0 && <p className="text-xs text-muted px-2 py-3">No records match.</p>}
                    </div>
                  )}
                </div>

                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); post(); } }}
                  placeholder="Write a note…  ( @ a project, quote, or order to file it there )"
                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-foreground"
                />

                <button
                  onClick={() => setShared((v) => !v)}
                  title={shared ? "Shared — visible to the other side" : "Private to this side"}
                  className={cn("inline-flex items-center gap-1.5 px-2.5 py-2 rounded text-[12px] border", shared ? "border-accent/40 text-accent bg-accent/10" : "border-border text-muted hover:text-foreground")}
                >
                  {shared ? <Share2 size={13} /> : <Lock size={13} />}
                </button>

                <button onClick={post} disabled={!draft.trim() || posting} className="inline-flex items-center gap-1.5 bg-accent text-black font-bold px-3.5 py-2 rounded text-[13px] disabled:opacity-40">
                  <Send size={13} /> Post
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted mt-2 pl-0.5">
              {viewRecord
                ? <>Posting here attaches to <b className="text-foreground">@{viewRecord.name}</b> — it also appears in the main feed.</>
                : <>Tagging a record files the note on it <em>and</em> keeps it in the feed. Leave untagged for a general shop note. Enter to post, Shift+Enter for a new line.</>}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function RailButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded text-[13px] text-left transition-colors", active ? "bg-accent/15 text-foreground" : "text-muted hover:bg-background hover:text-foreground")}>
      <span className="w-4 text-center flex-none grid place-items-center">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      <span className="text-[11px] text-muted bg-black/40 border border-border rounded-full px-1.5 flex-none">{count}</span>
    </button>
  );
}
