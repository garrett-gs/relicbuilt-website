"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import {
  Task, ShoppingItem, ShoppingList, ProjectPunchItem, CustomWork,
} from "@/types/axiom";
import DateField from "@/components/ui/DateField";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  Plus, X, Trash2, Check, Undo2, Pencil, ChevronDown, ChevronRight,
  Hammer,
} from "lucide-react";
import NotesPanel from "@/components/tracker/NotesPanel";

const inp = "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";

type Tab = "tasks" | "shopping" | "projects" | "notes";

const TABS: { key: Tab; label: string }[] = [
  { key: "tasks", label: "Tasks" },
  { key: "shopping", label: "Shopping" },
  { key: "projects", label: "Projects" },
  { key: "notes", label: "Notes" },
];

export default function TrackerPage() {
  const [tab, setTab] = useState<Tab>("tasks");

  // Honor ?tab= so deep links + the redirects from the old pages land on
  // the right tab.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tab");
    if (t === "tasks" || t === "shopping" || t === "projects" || t === "notes") setTab(t);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-heading font-bold">Tracker</h1>
      </div>

      <div className="flex border-b border-border mb-6 text-xs uppercase tracking-wider">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-5 py-2.5 transition-colors",
              tab === t.key
                ? "text-foreground border-b-2 border-accent -mb-px"
                : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "tasks" && <TasksTab />}
      {tab === "shopping" && <ShoppingTab />}
      {tab === "projects" && <ProjectsTab />}
      {tab === "notes" && <NotesPanel />}
    </div>
  );
}

// ─── Tasks Tab ─────────────────────────────────────────────────────────

const TASK_COLUMNS = [
  { key: "todo", label: "To Do", color: "#6b7280" },
  { key: "in_progress", label: "In Progress", color: "#3b82f6" },
  { key: "done", label: "Done", color: "#22c55e" },
] as const;
const ACTIVE_COLUMNS = TASK_COLUMNS.filter((c) => c.key !== "done");
const PRIORITIES = [
  { key: "high", label: "High", color: "#ef4444" },
  { key: "medium", label: "Medium", color: "#f59e0b" },
  { key: "low", label: "Low", color: "#22c55e" },
];

function TasksTab() {
  const { userEmail } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState("all");
  const [taskTab, setTaskTab] = useState<"active" | "completed">("active");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    const { data } = await axiom.from("tasks").select("*").order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    axiom.from("settings").select("team_members").limit(1).single().then(({ data }) => {
      if (data?.team_members) {
        setTeam((data.team_members as { name: string }[]).map((m) => m.name).filter(Boolean));
      }
    });
  }, []);

  const filtered = teamFilter === "all" ? tasks : tasks.filter((t) => t.assignee === teamFilter);
  const overdue = tasks.filter((t) => t.due_date && t.status !== "done" && new Date(t.due_date) < new Date());

  async function createTask(form: Record<string, string>) {
    const { data } = await axiom.from("tasks").insert({
      title: form.title,
      description: form.description,
      status: "todo",
      priority: form.priority || "medium",
      assignee: form.assignee || null,
      due_date: form.due_date || null,
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "task", entity_id: data.id, label: `Created task: ${data.title}`, user_name: userEmail });
      load();
      setShowCreate(false);
    }
  }

  async function moveTask(id: string, status: string) {
    await axiom.from("tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    load();
  }

  async function deleteTask(id: string) {
    await axiom.from("tasks").delete().eq("id", id);
    setSelected(null);
    load();
  }

  async function addComment(taskId: string, text: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const comments = [...(task.comments || []), { text, author: userEmail, created_at: new Date().toISOString() }];
    await axiom.from("tasks").update({ comments }).eq("id", taskId);
    load();
    setSelected((prev) => prev ? { ...prev, comments } : prev);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4 text-sm">
          <span className="text-muted">{tasks.filter((t) => t.status !== "done").length} open</span>
          <span className="text-blue-400">{tasks.filter((t) => t.status === "in_progress").length} in progress</span>
          {overdue.length > 0 && <span className="text-red-400">{overdue.length} overdue</span>}
        </div>
        <div className="flex gap-3">
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent">
            <option value="all">All Team</option>
            {team.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} className="mr-1" /> New Task</Button>
        </div>
      </div>

      <div className="flex border-b border-border mb-4 text-xs uppercase tracking-wider">
        <button
          onClick={() => setTaskTab("active")}
          className={cn("px-4 py-2 transition-colors", taskTab === "active" ? "text-foreground border-b-2 border-accent -mb-px" : "text-muted hover:text-foreground")}
        >
          Active <span className="text-muted ml-1">({filtered.filter((t) => t.status !== "done").length})</span>
        </button>
        <button
          onClick={() => setTaskTab("completed")}
          className={cn("px-4 py-2 transition-colors", taskTab === "completed" ? "text-foreground border-b-2 border-accent -mb-px" : "text-muted hover:text-foreground")}
        >
          Completed <span className="text-muted ml-1">({filtered.filter((t) => t.status === "done").length})</span>
        </button>
      </div>

      {taskTab === "active" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ACTIVE_COLUMNS.map((col) => {
            const colTasks = filtered.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                className={cn("flex-shrink-0 w-72 bg-card border border-border p-3 min-h-[400px]", dragOver === col.key && "border-accent")}
                onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => { if (dragging) moveTask(dragging, col.key); setDragging(null); setDragOver(null); }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-xs uppercase tracking-wider text-muted font-medium">{col.label}</span>
                  <span className="text-xs text-muted ml-auto">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => {
                    const isOverdue = t.due_date && t.status !== "done" && new Date(t.due_date) < new Date();
                    const pri = PRIORITIES.find((p) => p.key === t.priority);
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => setDragging(t.id)}
                        onClick={() => { setSelected(t); setComment(""); }}
                        className="bg-background border border-border p-3 cursor-pointer hover:border-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{t.title}</p>
                          {pri && <span className="text-[10px] px-1.5 py-0.5" style={{ background: pri.color + "20", color: pri.color }}>{pri.label}</span>}
                        </div>
                        {t.assignee && <p className="text-xs text-muted mt-1">{t.assignee}</p>}
                        {t.due_date && (
                          <p className={cn("text-xs mt-1", isOverdue && "text-red-400")}>
                            Due {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {taskTab === "completed" && (
        <div className="space-y-2">
          {filtered.filter((t) => t.status === "done").map((t) => (
            <div
              key={t.id}
              onClick={() => { setSelected(t); setComment(""); }}
              className="bg-card border border-border p-3 cursor-pointer hover:border-accent/50 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium line-through text-muted">{t.title}</p>
                {t.assignee && <p className="text-xs text-muted mt-1">{t.assignee}</p>}
              </div>
              <span className="text-xs text-green-400">Done</span>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <TaskModal title="New Task" onClose={() => setShowCreate(false)}>
          <TaskForm onSubmit={createTask} onCancel={() => setShowCreate(false)} team={team} />
        </TaskModal>
      )}

      {selected && (
        <TaskModal title={selected.title} onClose={() => setSelected(null)}>
          <div className="space-y-4">
            {selected.description && (
              <p className="text-sm text-muted whitespace-pre-wrap">{selected.description}</p>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
              {selected.assignee && <span className="bg-card border border-border px-2 py-1">👤 {selected.assignee}</span>}
              {selected.due_date && <span className="bg-card border border-border px-2 py-1">📅 {new Date(selected.due_date + "T00:00:00").toLocaleDateString()}</span>}
              <span className="bg-card border border-border px-2 py-1 capitalize">{selected.priority}</span>
            </div>

            <div>
              <p className={lbl}>Move to</p>
              <div className="flex gap-2">
                {TASK_COLUMNS.filter((c) => c.key !== selected.status).map((c) => (
                  <button
                    key={c.key}
                    onClick={() => { moveTask(selected.id, c.key); setSelected({ ...selected, status: c.key }); }}
                    className="flex-1 border px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:border-accent"
                    style={{ borderColor: c.color, color: c.color }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={lbl}>Comments ({selected.comments?.length || 0})</p>
              <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
                {(selected.comments || []).map((c, i) => (
                  <div key={i} className="bg-card border border-border p-2 text-sm">
                    <p>{c.text}</p>
                    <p className="text-xs text-muted mt-1">{c.author} · {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && comment.trim()) { addComment(selected.id, comment.trim()); setComment(""); } }}
                  placeholder="Add a comment…"
                  className={inp}
                  style={{ fontSize: 16 }}
                />
                <Button onClick={() => { if (comment.trim()) { addComment(selected.id, comment.trim()); setComment(""); } }} size="sm">Add</Button>
              </div>
            </div>

            <button onClick={() => deleteTask(selected.id)} className="text-red-400 text-xs flex items-center gap-1 hover:text-red-500"><Trash2 size={12} /> Delete task</button>
          </div>
        </TaskModal>
      )}
    </div>
  );
}

function TaskModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-background border border-border w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold truncate">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function TaskForm({ onSubmit, onCancel, team }: { onSubmit: (f: Record<string, string>) => void; onCancel: () => void; team: string[] }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <label className={lbl}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} style={{ fontSize: 16 }} autoFocus />
      </div>
      <div>
        <label className={lbl}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inp + " resize-y"} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inp}>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Assignee</label>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inp}>
            <option value="">Unassigned</option>
            {team.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={lbl}>Due Date</label>
        <DateField value={dueDate} onChange={setDueDate} inputClassName={inp + " text-left"} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit({ title, description, priority, assignee, due_date: dueDate })} disabled={!title.trim()} className="flex-1">Create</Button>
      </div>
    </div>
  );
}

// ─── Shopping Tab ──────────────────────────────────────────────────────

const UNDO_TIMEOUT_MS = 7000;

interface UndoSnapshot {
  listId: string;
  itemId: string;
  itemText: string;
}

function ShoppingTab() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [undo, setUndo] = useState<UndoSnapshot | null>(null);
  const undoTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await axiom.from("shopping_lists").select("*").order("created_at", { ascending: true });
    setLists((data as ShoppingList[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);

  function scheduleUndoExpiry(snap: UndoSnapshot) {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => {
      setUndo((cur) => (cur && cur.itemId === snap.itemId ? null : cur));
    }, UNDO_TIMEOUT_MS);
  }

  async function persistList(listId: string, patch: Partial<ShoppingList>) {
    const { data } = await axiom.from("shopping_lists").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", listId).select().single();
    if (data) setLists((prev) => prev.map((l) => (l.id === listId ? (data as ShoppingList) : l)));
  }

  async function createList() {
    const name = newListName.trim();
    if (!name) return;
    const { data } = await axiom.from("shopping_lists").insert({ name, items: [] }).select().single();
    if (data) { setLists((prev) => [...prev, data as ShoppingList]); setNewListName(""); setCreating(false); }
  }
  async function renameList(id: string, name: string) { await persistList(id, { name: name.trim() || "Untitled" }); }
  async function deleteList(id: string) { await axiom.from("shopping_lists").delete().eq("id", id); setLists((p) => p.filter((l) => l.id !== id)); }
  async function addItem(id: string, text: string) {
    const list = lists.find((l) => l.id === id);
    if (!list) return;
    const entry: ShoppingItem = { id: crypto.randomUUID(), text: text.trim(), purchased: false, created_at: new Date().toISOString() };
    await persistList(id, { items: [...list.items, entry] });
  }
  async function togglePurchased(listId: string, itemId: string) {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    const item = list.items.find((i) => i.id === itemId);
    if (!item) return;
    const nowPurchased = !item.purchased;
    await persistList(listId, {
      items: list.items.map((i) => i.id === itemId ? { ...i, purchased: nowPurchased, purchased_at: nowPurchased ? new Date().toISOString() : undefined } : i),
    });
    if (nowPurchased) {
      const snap = { listId, itemId, itemText: item.text };
      setUndo(snap); scheduleUndoExpiry(snap);
    }
  }
  async function doUndo() {
    if (!undo) return;
    await togglePurchased(undo.listId, undo.itemId);
    setUndo(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  }
  async function deleteItem(listId: string, itemId: string) {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    await persistList(listId, { items: list.items.filter((i) => i.id !== itemId) });
  }
  async function clearPurchased(listId: string) {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    await persistList(listId, { items: list.items.filter((i) => !i.purchased) });
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">Tools, materials, anything else to pick up. Check items off as you grab them.</p>
        {!creating ? (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 bg-accent text-background px-4 py-2 text-sm font-semibold hover:bg-accent/90">
            <Plus size={14} /> New list
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              autoFocus value={newListName} onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createList(); if (e.key === "Escape") { setCreating(false); setNewListName(""); } }}
              placeholder="e.g. Home Depot" className={inp + " w-56"} style={{ fontSize: 16 }}
            />
            <button onClick={createList} disabled={!newListName.trim()} className="bg-accent text-background px-3 py-2 text-sm font-semibold disabled:opacity-50">Add</button>
            <button onClick={() => { setCreating(false); setNewListName(""); }} className="text-muted p-2"><X size={14} /></button>
          </div>
        )}
      </div>
      {loading ? <p className="text-muted text-sm">Loading…</p> : lists.length === 0 ? (
        <div className="border border-border bg-card p-10 text-center">
          <p className="text-sm mb-1">No lists yet.</p>
          <p className="text-muted text-xs">Tap <span className="text-accent">+ New list</span> to start one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <ShoppingListCard
              key={list.id} list={list}
              onRename={(n) => renameList(list.id, n)} onDelete={() => deleteList(list.id)}
              onAddItem={(t) => addItem(list.id, t)} onToggle={(id) => togglePurchased(list.id, id)}
              onDeleteItem={(id) => deleteItem(list.id, id)} onClearPurchased={() => clearPurchased(list.id)}
            />
          ))}
        </div>
      )}
      {undo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-lg px-4 py-3 flex items-center gap-3 max-w-[90vw]">
          <Check size={14} className="text-accent shrink-0" />
          <span className="text-sm text-foreground truncate max-w-xs">{undo.itemText}</span>
          <button onClick={doUndo} className="flex items-center gap-1 text-accent text-xs font-semibold hover:text-accent/80 whitespace-nowrap"><Undo2 size={12} /> Undo</button>
          <button onClick={() => { setUndo(null); if (undoTimer.current) window.clearTimeout(undoTimer.current); }} className="text-muted hover:text-foreground shrink-0"><X size={12} /></button>
        </div>
      )}
    </div>
  );
}

function ShoppingListCard({ list, onRename, onDelete, onAddItem, onToggle, onDeleteItem, onClearPurchased }: {
  list: ShoppingList; onRename: (n: string) => void; onDelete: () => void;
  onAddItem: (t: string) => void; onToggle: (id: string) => void;
  onDeleteItem: (id: string) => void; onClearPurchased: () => void;
}) {
  const [newItem, setNewItem] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(list.name);
  const [showPurchased, setShowPurchased] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const active = list.items.filter((i) => !i.purchased);
  const purchased = list.items.filter((i) => i.purchased);

  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        {editingName ? (
          <input
            autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => { setEditingName(false); if (draftName.trim() && draftName !== list.name) onRename(draftName); else setDraftName(list.name); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraftName(list.name); setEditingName(false); } }}
            className="flex-1 bg-background border border-border px-2 py-1 text-sm text-foreground focus:outline-none focus:border-accent" style={{ fontSize: 16 }}
          />
        ) : (
          <>
            <h2 className="text-2xl font-bold text-accent flex-1 truncate tracking-wide">{list.name}</h2>
            <span className="text-xs text-muted">{active.length}</span>
            <button onClick={() => setEditingName(true)} className="text-muted hover:text-foreground p-1" title="Rename"><Pencil size={13} /></button>
          </>
        )}
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="text-muted hover:text-red-500 p-1" title="Delete list"><Trash2 size={13} /></button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-red-500">Delete?</span>
            <button onClick={onDelete} className="text-xs bg-red-500 text-white px-2 py-1 hover:bg-red-600">Yes</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs border border-border px-2 py-1 text-muted hover:text-foreground">No</button>
          </div>
        )}
      </div>
      <div className="p-4 border-b border-border flex items-center gap-2">
        <input
          value={newItem} onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) { onAddItem(newItem); setNewItem(""); } }}
          placeholder="Add an item…"
          className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" style={{ fontSize: 16 }}
        />
        <button onClick={() => { if (newItem.trim()) { onAddItem(newItem); setNewItem(""); } }} disabled={!newItem.trim()} className="bg-accent text-background px-3 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-1"><Plus size={12} /> Add</button>
      </div>
      {active.length === 0 ? (
        <p className="text-xs text-muted italic px-4 py-3">{list.items.length === 0 ? "Nothing on the list yet." : "All items purchased."}</p>
      ) : (
        <ul>{active.map((item) => (<ShoppingItemRow key={item.id} item={item} onToggle={() => onToggle(item.id)} onDelete={() => onDeleteItem(item.id)} />))}</ul>
      )}
      {purchased.length > 0 && (
        <div className="border-t border-border">
          <button onClick={() => setShowPurchased((s) => !s)} className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-muted hover:text-foreground">
            <span className="flex items-center gap-1.5">{showPurchased ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{purchased.length} purchased</span>
            {showPurchased && (<span onClick={(e) => { e.stopPropagation(); onClearPurchased(); }} className="text-red-400 hover:text-red-500 cursor-pointer">Clear all</span>)}
          </button>
          {showPurchased && (<ul className="border-t border-border">{purchased.map((item) => (<ShoppingItemRow key={item.id} item={item} onToggle={() => onToggle(item.id)} onDelete={() => onDeleteItem(item.id)} />))}</ul>)}
        </div>
      )}
    </div>
  );
}

function ShoppingItemRow({ item, onToggle, onDelete }: { item: ShoppingItem; onToggle: () => void; onDelete: () => void }) {
  return (
    <li className="px-4 py-2.5 border-b border-border last:border-b-0 flex items-center gap-3 group">
      <button onClick={onToggle} className={cn("shrink-0 w-5 h-5 border flex items-center justify-center transition-colors", item.purchased ? "bg-accent border-accent" : "border-border hover:border-accent")} aria-label={item.purchased ? "Mark not purchased" : "Mark purchased"}>
        {item.purchased && <Check size={12} className="text-background" />}
      </button>
      <span onClick={onToggle} className={cn("flex-1 text-sm cursor-pointer select-none", item.purchased ? "text-muted line-through" : "text-foreground")}>{item.text}</span>
      <button onClick={onDelete} className="text-muted opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity shrink-0" title="Remove"><X size={13} /></button>
    </li>
  );
}

// ─── Projects Tab ──────────────────────────────────────────────────────

function ProjectsTab() {
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [undo, setUndo] = useState<{ projectId: string; itemId: string; itemText: string } | null>(null);
  const undoTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await axiom
      .from("custom_work")
      .select("id, project_name, client_name, status, punch_list")
      .neq("status", "complete")
      .order("project_name");
    setProjects((data as CustomWork[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);

  function scheduleUndoExpiry(snap: { projectId: string; itemId: string; itemText: string }) {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => {
      setUndo((cur) => (cur && cur.itemId === snap.itemId ? null : cur));
    }, UNDO_TIMEOUT_MS);
  }

  async function persistPunchList(projectId: string, items: ProjectPunchItem[]) {
    const { data } = await axiom
      .from("custom_work")
      .update({ punch_list: items, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .select("id, project_name, client_name, status, punch_list")
      .single();
    if (data) setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...(data as CustomWork) } : p)));
  }

  async function addItem(projectId: string, text: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const items = project.punch_list || [];
    const entry: ProjectPunchItem = {
      id: crypto.randomUUID(),
      text: text.trim(),
      completed: false,
      created_at: new Date().toISOString(),
    };
    await persistPunchList(projectId, [...items, entry]);
  }

  async function toggleItem(projectId: string, itemId: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const item = (project.punch_list || []).find((i) => i.id === itemId);
    if (!item) return;
    const nowCompleted = !item.completed;
    const updated = (project.punch_list || []).map((i) =>
      i.id === itemId ? { ...i, completed: nowCompleted, completed_at: nowCompleted ? new Date().toISOString() : undefined } : i,
    );
    await persistPunchList(projectId, updated);
    if (nowCompleted) {
      const snap = { projectId, itemId, itemText: item.text };
      setUndo(snap); scheduleUndoExpiry(snap);
    }
  }

  async function doUndo() {
    if (!undo) return;
    await toggleItem(undo.projectId, undo.itemId);
    setUndo(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  }

  async function deleteItem(projectId: string, itemId: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    await persistPunchList(projectId, (project.punch_list || []).filter((i) => i.id !== itemId));
  }

  async function clearCompleted(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    await persistPunchList(projectId, (project.punch_list || []).filter((i) => !i.completed));
  }

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-muted mb-4">Per-project punch lists. Each active project shows its own checklist below.</p>
      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="border border-border bg-card p-10 text-center">
          <p className="text-sm mb-1">No active projects.</p>
          <p className="text-muted text-xs">When a project gets started, it&apos;ll show up here with a fresh punch list.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <ProjectPunchCard
              key={project.id}
              project={project}
              onAddItem={(text) => addItem(project.id, text)}
              onToggle={(itemId) => toggleItem(project.id, itemId)}
              onDeleteItem={(itemId) => deleteItem(project.id, itemId)}
              onClearCompleted={() => clearCompleted(project.id)}
            />
          ))}
        </div>
      )}
      {undo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-lg px-4 py-3 flex items-center gap-3 max-w-[90vw]">
          <Check size={14} className="text-accent shrink-0" />
          <span className="text-sm text-foreground truncate max-w-xs">{undo.itemText}</span>
          <button onClick={doUndo} className="flex items-center gap-1 text-accent text-xs font-semibold hover:text-accent/80 whitespace-nowrap"><Undo2 size={12} /> Undo</button>
          <button onClick={() => { setUndo(null); if (undoTimer.current) window.clearTimeout(undoTimer.current); }} className="text-muted hover:text-foreground shrink-0"><X size={12} /></button>
        </div>
      )}
    </div>
  );
}

function ProjectPunchCard({ project, onAddItem, onToggle, onDeleteItem, onClearCompleted }: {
  project: CustomWork;
  onAddItem: (t: string) => void; onToggle: (id: string) => void;
  onDeleteItem: (id: string) => void; onClearCompleted: () => void;
}) {
  const [newItem, setNewItem] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const items = project.punch_list || [];
  const active = items.filter((i) => !i.completed);
  const completed = items.filter((i) => i.completed);

  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <Hammer size={16} className="text-accent shrink-0" />
        <h2 className="text-2xl font-bold text-accent flex-1 truncate tracking-wide">{project.project_name}</h2>
        {project.client_name && <span className="text-xs text-muted truncate max-w-[40%]">{project.client_name}</span>}
        <span className="text-xs text-muted ml-2">{active.length}</span>
      </div>
      <div className="p-4 border-b border-border flex items-center gap-2">
        <input
          value={newItem} onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) { onAddItem(newItem); setNewItem(""); } }}
          placeholder="Add a punch-list item…"
          className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" style={{ fontSize: 16 }}
        />
        <button onClick={() => { if (newItem.trim()) { onAddItem(newItem); setNewItem(""); } }} disabled={!newItem.trim()} className="bg-accent text-background px-3 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-1"><Plus size={12} /> Add</button>
      </div>
      {active.length === 0 ? (
        <p className="text-xs text-muted italic px-4 py-3">{items.length === 0 ? "No punch-list items yet." : "All items complete."}</p>
      ) : (
        <ul>{active.map((item) => (<PunchItemRow key={item.id} item={item} onToggle={() => onToggle(item.id)} onDelete={() => onDeleteItem(item.id)} />))}</ul>
      )}
      {completed.length > 0 && (
        <div className="border-t border-border">
          <button onClick={() => setShowCompleted((s) => !s)} className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-muted hover:text-foreground">
            <span className="flex items-center gap-1.5">{showCompleted ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{completed.length} completed</span>
            {showCompleted && (<span onClick={(e) => { e.stopPropagation(); onClearCompleted(); }} className="text-red-400 hover:text-red-500 cursor-pointer">Clear all</span>)}
          </button>
          {showCompleted && (<ul className="border-t border-border">{completed.map((item) => (<PunchItemRow key={item.id} item={item} onToggle={() => onToggle(item.id)} onDelete={() => onDeleteItem(item.id)} />))}</ul>)}
        </div>
      )}
    </div>
  );
}

function PunchItemRow({ item, onToggle, onDelete }: { item: ProjectPunchItem; onToggle: () => void; onDelete: () => void }) {
  return (
    <li className="px-4 py-2.5 border-b border-border last:border-b-0 flex items-center gap-3 group">
      <button onClick={onToggle} className={cn("shrink-0 w-5 h-5 border flex items-center justify-center transition-colors", item.completed ? "bg-accent border-accent" : "border-border hover:border-accent")} aria-label={item.completed ? "Mark not done" : "Mark done"}>
        {item.completed && <Check size={12} className="text-background" />}
      </button>
      <span onClick={onToggle} className={cn("flex-1 text-sm cursor-pointer select-none", item.completed ? "text-muted line-through" : "text-foreground")}>{item.text}</span>
      <button onClick={onDelete} className="text-muted opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity shrink-0" title="Remove"><X size={13} /></button>
    </li>
  );
}
