"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Task, TaskComment } from "@/types/axiom";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Plus, X, AlertTriangle, Trash2 } from "lucide-react";

const COLUMNS = [
  { key: "todo", label: "To Do", color: "#6b7280" },
  { key: "in_progress", label: "In Progress", color: "#3b82f6" },
  { key: "done", label: "Done", color: "#22c55e" },
] as const;

const PRIORITIES = [
  { key: "high", label: "High", color: "#ef4444" },
  { key: "medium", label: "Medium", color: "#f59e0b" },
  { key: "low", label: "Low", color: "#22c55e" },
];

const TEAM = ["Garrett", "Mike", "Dana", "Jesse", "Priya"];

export default function TasksPage() {
  const { userEmail } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState("all");

  const load = useCallback(async () => {
    const { data } = await axiom.from("tasks").select("*").order("created_at", { ascending: false });
    if (data) setTasks(data);
  }, []);

  useEffect(() => { load(); }, [load]);

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

  async function moveTask(id: string, newStatus: string) {
    await axiom.from("tasks").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Tasks</h1>
          <div className="flex gap-4 mt-1">
            <span className="text-muted text-sm">{tasks.length} total</span>
            <span className="text-blue-400 text-sm">{tasks.filter((t) => t.status === "in_progress").length} in progress</span>
            {overdue.length > 0 && <span className="text-red-400 text-sm">{overdue.length} overdue</span>}
          </div>
        </div>
        <div className="flex gap-3">
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent">
            <option value="all">All Team</option>
            {TEAM.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} className="mr-1" /> New Task</Button>
        </div>
      </div>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = filtered.filter((t) => t.status === col.key);
          return (
            <div
              key={col.key}
              className={cn("flex-shrink-0 w-80 bg-card border border-border rounded p-3 min-h-[400px]", dragOver === col.key && "border-accent")}
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
                      onClick={() => setSelected(t)}
                      className="bg-background border border-border p-3 cursor-pointer hover:border-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{t.title}</p>
                        {pri && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: pri.color + "20", color: pri.color }}>{pri.label}</span>}
                      </div>
                      {t.assignee && <p className="text-xs text-muted mt-1">{t.assignee}</p>}
                      {t.due_date && (
                        <p className={cn("text-xs mt-1 flex items-center gap-1", isOverdue ? "text-red-400" : "text-muted")}>
                          {isOverdue && <AlertTriangle size={10} />}
                          {new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
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

      {/* Create modal */}
      {showCreate && (
        <TaskModal title="New Task" onClose={() => setShowCreate(false)}>
          <TaskForm onSubmit={createTask} onCancel={() => setShowCreate(false)} />
        </TaskModal>
      )}

      {/* Detail modal */}
      {selected && (
        <TaskModal title={selected.title} onClose={() => { setSelected(null); load(); }}>
          <div className="space-y-4">
            {selected.description && <p className="text-sm text-muted">{selected.description}</p>}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-muted text-xs block">Priority</span>{selected.priority}</div>
              <div><span className="text-muted text-xs block">Assignee</span>{selected.assignee || "—"}</div>
              <div><span className="text-muted text-xs block">Due</span>{selected.due_date || "—"}</div>
            </div>
            {/* Quick move */}
            <div className="flex gap-2">
              {COLUMNS.filter((c) => c.key !== selected.status).map((c) => (
                <button key={c.key} onClick={() => { moveTask(selected.id, c.key); setSelected(null); }} className="text-xs px-3 py-1 border border-border text-muted hover:text-foreground hover:border-accent transition-colors">
                  Move to {c.label}
                </button>
              ))}
            </div>
            {/* Comments */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Comments</h3>
              <div className="space-y-2 mb-3">
                {(selected.comments || []).map((c: TaskComment, i: number) => (
                  <div key={i} className="bg-card border border-border p-2 text-sm">
                    <p>{c.text}</p>
                    <p className="text-xs text-muted mt-1">{c.author} &middot; {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
              <CommentBox onSubmit={(text) => addComment(selected.id, text)} />
            </div>
            <button onClick={() => deleteTask(selected.id)} className="text-muted hover:text-red-500 text-sm flex items-center gap-1"><Trash2 size={14} /> Delete Task</button>
          </div>
        </TaskModal>
      )}
    </div>
  );
}

function TaskModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed top-8 bottom-8 right-8 left-8 md:left-[35%] z-50 bg-background border border-border overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </>
  );
}

function TaskForm({ onSubmit, onCancel }: { onSubmit: (f: Record<string, string>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", assignee: "", due_date: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Title *</label>
        <input value={form.title} onChange={(e) => set("title", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Description</label>
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[80px] resize-y" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Priority</label>
          <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent">
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Assignee</label>
          <select value={form.assignee} onChange={(e) => set("assignee", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent">
            <option value="">Unassigned</option>
            {TEAM.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Due Date</label>
          <input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-accent" />
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit(form)} disabled={!form.title}>Create Task</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function CommentBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment..." className="flex-1 bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onSubmit(text.trim()); setText(""); } }} />
      <Button size="sm" onClick={() => { if (text.trim()) { onSubmit(text.trim()); setText(""); } }}>Add</Button>
    </div>
  );
}
