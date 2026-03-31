"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Task, TaskComment } from "@/types/axiom";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  Plus, X, AlertTriangle, Trash2,
  ChevronDown, Folder, FileText, ImageIcon, Link as LinkIcon, BookOpen,
} from "lucide-react";

// ── Note type ────────────────────────────────────────────────

interface Note {
  id: string;
  title: string;
  content: string;
  folder: string | null;
  is_filed: boolean;
  created_at: string;
  updated_at: string;
}

// ── Constants ────────────────────────────────────────────────

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

// Team loaded from settings at runtime

// ── Tasks page ───────────────────────────────────────────────

export default function TasksPage() {
  const { userEmail } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<string[]>([]);
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
    <>
      {/* Shared note editor styles */}
      <style>{`
        .notes-editor:empty::before {
          content: "Start typing your note…";
          color: #6b7280;
          pointer-events: none;
          font-style: italic;
        }
        .notes-editor ul, .note-view ul { list-style: disc; padding-left: 1.4em; margin: 2px 0; }
        .notes-editor ol, .note-view ol { list-style: decimal; padding-left: 1.4em; margin: 2px 0; }
        .notes-editor li, .note-view li { margin: 1px 0; }
        .notes-editor img, .note-view img { max-width: 100%; height: auto; display: block; margin: 4px 0; border-radius: 2px; }
        .notes-editor a, .note-view a { color: #c4a24d; text-decoration: underline; }
        .note-view a { cursor: pointer; }
        .notes-editor input[type="checkbox"] { accent-color: #c4a24d; cursor: pointer; margin-right: 4px; }
        .note-view input[type="checkbox"] { accent-color: #c4a24d; margin-right: 4px; }
      `}</style>

      <div className="flex gap-5">
        {/* ── Left: Tasks ── */}
        <div className="flex-1 min-w-0">
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
                {team.map((t) => <option key={t} value={t}>{t}</option>)}
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
                  className={cn("flex-shrink-0 w-72 bg-card border border-border rounded p-3 min-h-[400px]", dragOver === col.key && "border-accent")}
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
                            {pri && <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: pri.color + "20", color: pri.color }}>{pri.label}</span>}
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
              <TaskForm onSubmit={createTask} onCancel={() => setShowCreate(false)} team={team} />
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
                <div className="flex gap-2">
                  {COLUMNS.filter((c) => c.key !== selected.status).map((c) => (
                    <button key={c.key} onClick={() => { moveTask(selected.id, c.key); setSelected(null); }} className="text-xs px-3 py-1 border border-border text-muted hover:text-foreground hover:border-accent transition-colors">
                      Move to {c.label}
                    </button>
                  ))}
                </div>
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

        {/* ── Right: Notes panel ── */}
        <div
          className="w-72 shrink-0 border-l border-border pl-5 flex flex-col"
          style={{ position: "sticky", top: "1.5rem", height: "calc(100vh - 7rem)", overflow: "hidden" }}
        >
          <NotesPanel />
        </div>
      </div>
    </>
  );
}

// ── Task Modal ───────────────────────────────────────────────

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

// ── Task Form ────────────────────────────────────────────────

function TaskForm({ onSubmit, onCancel, team }: { onSubmit: (f: Record<string, string>) => void; onCancel: () => void; team: string[] }) {
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
            {team.map((t) => <option key={t} value={t}>{t}</option>)}
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

// ── Comment box ──────────────────────────────────────────────

function CommentBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment..." className="flex-1 bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onSubmit(text.trim()); setText(""); } }} />
      <Button size="sm" onClick={() => { if (text.trim()) { onSubmit(text.trim()); setText(""); } }}>Add</Button>
    </div>
  );
}

// ── Notes Panel ──────────────────────────────────────────────

function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("Untitled Note");
  const [showFiled, setShowFiled] = useState(true);
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [folderName, setFolderName] = useState("General");
  const [showImageInput, setShowImageInput] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [viewingNote, setViewingNote] = useState<Note | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const activeNotes = notes.filter((n) => !n.is_filed);
  const filedNotes = notes.filter((n) => n.is_filed);
  const folders = filedNotes.reduce<Record<string, Note[]>>((acc, n) => {
    const key = n.folder || "General";
    (acc[key] = acc[key] || []).push(n);
    return acc;
  }, {});

  const loadNotes = useCallback(async () => {
    const { data } = await axiom.from("task_notes").select("*").order("updated_at", { ascending: false });
    if (data) setNotes(data as Note[]);
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // Sync editor when active note changes
  useEffect(() => {
    const note = notes.find((n) => n.id === activeId);
    if (editorRef.current && note) {
      editorRef.current.innerHTML = note.content || "";
      setTitle(note.title || "Untitled Note");
    } else if (editorRef.current && !activeId) {
      editorRef.current.innerHTML = "";
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function getCurrentContent() {
    if (!editorRef.current) return "";
    // Sync checkbox DOM state to HTML attributes before serializing
    editorRef.current.querySelectorAll("input[type='checkbox']").forEach((cb) => {
      if ((cb as HTMLInputElement).checked) cb.setAttribute("checked", "checked");
      else cb.removeAttribute("checked");
    });
    return editorRef.current.innerHTML;
  }

  function scheduleAutoSave(content: string) {
    if (!activeId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await axiom.from("task_notes").update({ content, updated_at: new Date().toISOString() }).eq("id", activeId);
      setNotes((prev) => prev.map((n) => n.id === activeId ? { ...n, content } : n));
    }, 900);
  }

  async function saveCurrentNote() {
    if (!activeId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const content = getCurrentContent();
    await axiom.from("task_notes").update({ title, content, updated_at: new Date().toISOString() }).eq("id", activeId);
    setNotes((prev) => prev.map((n) => n.id === activeId ? { ...n, title, content } : n));
  }

  async function newNote() {
    await saveCurrentNote();
    const { data } = await axiom.from("task_notes").insert({ title: "Untitled Note", content: "" }).select().single();
    if (data) {
      setNotes((prev) => [data as Note, ...prev]);
      setActiveId(data.id);
      setTitle("Untitled Note");
      setTimeout(() => { editorRef.current?.focus(); }, 60);
    }
  }

  async function switchNote(id: string) {
    if (id === activeId) return;
    await saveCurrentNote();
    setActiveId(id);
  }

  async function saveTitle(val: string) {
    setTitle(val);
    if (!activeId) return;
    await axiom.from("task_notes").update({ title: val, updated_at: new Date().toISOString() }).eq("id", activeId);
    setNotes((prev) => prev.map((n) => n.id === activeId ? { ...n, title: val } : n));
  }

  async function fileAway() {
    if (!activeId) return;
    const content = getCurrentContent();
    await axiom.from("task_notes").update({
      content, title,
      folder: folderName.trim() || "General",
      is_filed: true,
      updated_at: new Date().toISOString(),
    }).eq("id", activeId);
    setShowFileDialog(false);
    setActiveId(null);
    await loadNotes();
  }

  async function unfileNote(id: string) {
    await axiom.from("task_notes").update({ is_filed: false, folder: null }).eq("id", id);
    setViewingNote(null);
    await loadNotes();
    setActiveId(id);
  }

  async function deleteNote(id: string) {
    await axiom.from("task_notes").delete().eq("id", id);
    if (activeId === id) setActiveId(null);
    setViewingNote(null);
    await loadNotes();
  }

  function execCmd(cmd: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  function insertCheckbox() {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false,
      '<div style="display:flex;align-items:flex-start;gap:5px;margin:1px 0"><input type="checkbox" style="margin-top:3px;" /><span style="flex:1;outline:none;min-width:4px;">\u200b</span></div><br/>'
    );
  }

  function insertImage() {
    const url = imageUrl.trim();
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, `<img src="${url}" alt="" />`);
    setImageUrl(""); setShowImageInput(false);
  }

  function openLinkInput() {
    // Save current selection before toolbar steals focus
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    setShowLinkInput(true);
    setShowImageInput(false);
  }

  function insertLink() {
    const url = linkUrl.trim();
    if (!url) return;
    editorRef.current?.focus();
    // Restore saved selection
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRangeRef.current);
    }
    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed;
    if (hasSelection) {
      document.execCommand("createLink", false, url);
      // Style the new link
      editorRef.current?.querySelectorAll(`a[href="${url}"]`).forEach((a) => {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
        (a as HTMLElement).style.color = "#c4a24d";
        (a as HTMLElement).style.textDecoration = "underline";
      });
    } else {
      const text = linkText.trim() || url;
      document.execCommand("insertHTML", false,
        `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#c4a24d;text-decoration:underline;">${text}</a>`
      );
    }
    setLinkUrl(""); setLinkText(""); setShowLinkInput(false);
    savedRangeRef.current = null;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <BookOpen size={13} className="text-muted" />
          <h2 className="text-xs uppercase tracking-wider text-muted font-semibold">Notepad</h2>
        </div>
        <button onClick={newNote} className="text-accent text-xs flex items-center gap-1 hover:text-accent/80">
          <Plus size={12} /> New
        </button>
      </div>

      {/* Note tabs */}
      {activeNotes.length > 0 && (
        <div className="flex gap-1 mb-2 overflow-x-auto shrink-0 pb-1">
          {activeNotes.map((n) => (
            <button
              key={n.id}
              onClick={() => switchNote(n.id)}
              className={cn(
                "shrink-0 text-xs px-2 py-1 border transition-colors max-w-[110px] truncate",
                activeId === n.id ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:border-accent/50"
              )}
            >
              {n.title || "Untitled"}
            </button>
          ))}
        </div>
      )}

      {activeId ? (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Toolbar */}
          <div className="flex items-center gap-0.5 mb-1.5 flex-wrap shrink-0">
            <NoteToolBtn onMouseDown={() => execCmd("bold")} title="Bold"><span className="font-bold text-xs">B</span></NoteToolBtn>
            <NoteToolBtn onMouseDown={() => execCmd("italic")} title="Italic"><span className="italic text-xs">I</span></NoteToolBtn>
            <NoteToolBtn onMouseDown={() => execCmd("underline")} title="Underline"><span className="underline text-xs">U</span></NoteToolBtn>
            <div className="w-px h-4 bg-border mx-0.5 shrink-0" />
            <NoteToolBtn onMouseDown={() => execCmd("insertUnorderedList")} title="Bullet list"><span className="text-sm leading-none">•</span></NoteToolBtn>
            <NoteToolBtn onMouseDown={() => execCmd("insertOrderedList")} title="Numbered list"><span className="text-xs">1.</span></NoteToolBtn>
            <NoteToolBtn onMouseDown={insertCheckbox} title="Checkbox"><span className="text-xs">☐</span></NoteToolBtn>
            <div className="w-px h-4 bg-border mx-0.5 shrink-0" />
            <NoteToolBtn onMouseDown={() => { setShowImageInput((v) => !v); setShowLinkInput(false); }} title="Insert image">
              <ImageIcon size={11} />
            </NoteToolBtn>
            <NoteToolBtn onMouseDown={openLinkInput} title="Insert link">
              <LinkIcon size={11} />
            </NoteToolBtn>
            <div className="flex-1" />
            <button
              onMouseDown={(e) => { e.preventDefault(); setShowFileDialog(true); }}
              className="text-[10px] px-2 py-0.5 border border-border text-muted hover:border-accent hover:text-accent transition-colors ml-1 shrink-0"
            >File Away</button>
          </div>

          {/* Image URL input */}
          {showImageInput && (
            <div className="flex gap-1 mb-1.5 shrink-0">
              <input
                type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Paste image URL…"
                className="flex-1 text-xs bg-card border border-border px-2 py-1.5 text-foreground focus:outline-none focus:border-accent"
                onKeyDown={(e) => { if (e.key === "Enter") insertImage(); }}
              />
              <button onClick={insertImage} className="text-xs border border-accent text-accent px-2 hover:bg-accent/10">Insert</button>
              <button onClick={() => setShowImageInput(false)} className="text-muted hover:text-foreground"><X size={12} /></button>
            </div>
          )}

          {/* Link input */}
          {showLinkInput && (
            <div className="mb-1.5 shrink-0 bg-card border border-border p-2 space-y-1.5">
              <input
                type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="URL (https://…)"
                className="w-full text-xs bg-background border border-border px-2 py-1.5 text-foreground focus:outline-none focus:border-accent"
                onKeyDown={(e) => { if (e.key === "Enter") insertLink(); }}
                autoFocus
              />
              <input
                type="text" value={linkText} onChange={(e) => setLinkText(e.target.value)}
                placeholder="Link text (optional — uses selected text if any)"
                className="w-full text-xs bg-background border border-border px-2 py-1.5 text-foreground focus:outline-none focus:border-accent"
                onKeyDown={(e) => { if (e.key === "Enter") insertLink(); }}
              />
              <div className="flex gap-1.5">
                <button onClick={insertLink} disabled={!linkUrl.trim()} className="flex-1 text-xs bg-accent text-white py-1 hover:bg-accent/80 disabled:opacity-40">Insert Link</button>
                <button onClick={() => setShowLinkInput(false)} className="text-xs border border-border px-2 text-muted hover:text-foreground">Cancel</button>
              </div>
            </div>
          )}

          {/* Title */}
          <input
            value={title}
            onChange={(e) => saveTitle(e.target.value)}
            placeholder="Note title…"
            className="text-sm font-semibold bg-transparent border-b border-border px-0 py-1.5 mb-1.5 text-foreground focus:outline-none focus:border-accent w-full shrink-0"
          />

          {/* Editor */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => scheduleAutoSave(getCurrentContent())}
            className="notes-editor flex-1 overflow-auto bg-card border border-border p-3 text-sm text-foreground focus:outline-none"
            style={{ lineHeight: "1.7", minHeight: "120px" }}
          />

          {/* File away dialog */}
          {showFileDialog && (
            <div className="mt-2 border border-border bg-card p-3 space-y-2 shrink-0">
              <p className="text-xs text-muted uppercase tracking-wider">File into folder</p>
              <input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Folder name…"
                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                onKeyDown={(e) => { if (e.key === "Enter") fileAway(); }}
              />
              <div className="flex gap-2">
                <button onClick={fileAway} className="flex-1 bg-accent text-white text-xs py-1.5 hover:bg-accent/80">File Away</button>
                <button onClick={() => setShowFileDialog(false)} className="text-xs border border-border px-3 py-1.5 text-muted hover:text-foreground">Cancel</button>
              </div>
            </div>
          )}

          {/* Delete active note */}
          <button onClick={() => deleteNote(activeId)} className="mt-1 text-[10px] text-muted hover:text-red-500 flex items-center gap-1 self-end shrink-0">
            <Trash2 size={10} /> Delete note
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted gap-3">
          <BookOpen size={26} className="opacity-20" />
          <p className="text-xs text-center text-muted">
            {activeNotes.length > 0 ? "Select a note above" : "No active notes"}
          </p>
          <button onClick={newNote} className="text-xs text-accent border border-accent px-3 py-1.5 hover:bg-accent/10">
            + New Note
          </button>
        </div>
      )}

      {/* Filed folders */}
      {Object.keys(folders).length > 0 && (
        <div className="mt-3 border-t border-border pt-3 shrink-0">
          <button
            onClick={() => setShowFiled(!showFiled)}
            className="w-full flex items-center justify-between text-xs uppercase tracking-wider text-muted mb-2"
          >
            <span>Filed Notes</span>
            <ChevronDown size={12} className={cn("transition-transform duration-150", showFiled ? "" : "-rotate-90")} />
          </button>
          {showFiled && (
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {Object.entries(folders).map(([folder, folderNotes]) => (
                <FolderItem
                  key={folder}
                  folder={folder}
                  notes={folderNotes}
                  onView={(note) => setViewingNote(note)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filed note full-view modal */}
      {viewingNote && (
        <NoteViewModal
          note={viewingNote}
          onClose={() => setViewingNote(null)}
          onUnfile={unfileNote}
          onDelete={deleteNote}
        />
      )}
    </div>
  );
}

// ── Toolbar button ───────────────────────────────────────────

function NoteToolBtn({ onMouseDown, children, title }: { onMouseDown: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onMouseDown(); }}
      title={title}
      className="w-7 h-6 flex items-center justify-center text-muted hover:text-foreground hover:bg-card border border-transparent hover:border-border transition-colors shrink-0"
    >
      {children}
    </button>
  );
}

// ── Folder accordion in the notes panel ─────────────────────

function FolderItem({ folder, notes, onView }: {
  folder: string;
  notes: Note[];
  onView: (note: Note) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 text-xs text-muted hover:text-foreground py-1 px-1"
      >
        <Folder size={11} className="shrink-0" />
        <span className="flex-1 text-left truncate">{folder}</span>
        <span className="text-muted opacity-50 shrink-0">({notes.length})</span>
        <ChevronDown size={10} className={cn("transition-transform duration-150 shrink-0", open ? "" : "-rotate-90")} />
      </button>
      {open && (
        <div className="ml-4 space-y-0.5">
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => onView(n)}
              className="w-full flex items-center gap-1.5 text-xs text-muted hover:text-foreground py-1 px-1 text-left"
            >
              <FileText size={10} className="shrink-0" />
              <span className="truncate">{n.title || "Untitled"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filed note full-view overlay ─────────────────────────────

function NoteViewModal({ note, onClose, onUnfile, onDelete }: {
  note: Note;
  onClose: () => void;
  onUnfile: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-8" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-base">{note.title || "Untitled Note"}</h2>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Folder size={10} /> {note.folder || "General"} &middot; Filed {new Date(note.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={() => onUnfile(note.id)}
              className="text-xs border border-amber-300 text-amber-700 px-3 py-1.5 hover:bg-amber-50"
            >Unfile & Edit</button>
            {confirmDel ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-500">Delete?</span>
                <button onClick={() => onDelete(note.id)} className="text-xs border border-red-300 text-red-600 px-2 py-1.5 hover:bg-red-50">Yes</button>
                <button onClick={() => setConfirmDel(false)} className="text-xs border border-gray-200 text-gray-500 px-2 py-1.5 hover:bg-gray-50">No</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDel(true)}
                className="text-xs border border-gray-200 text-gray-400 px-3 py-1.5 hover:border-red-200 hover:text-red-500"
              >Delete</button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 ml-1"><X size={18} /></button>
          </div>
        </div>

        {/* Read-only content */}
        <div
          className="note-view flex-1 overflow-auto px-6 py-5 text-sm text-gray-800"
          style={{ lineHeight: "1.75" }}
          dangerouslySetInnerHTML={{ __html: note.content || "<p style='color:#9ca3af;font-style:italic;'>Empty note</p>" }}
        />
      </div>
    </div>
  );
}
