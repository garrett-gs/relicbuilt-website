"use client";

// Notepad UI extracted from the old /axiom/tasks page so it can live in
// the Tracker's Notes tab. Self-contained — owns its own data fetch,
// editor styles, and helpers (NoteToolBtn, FolderItem, NoteViewModal).
//
// Storage: task_notes table. The schema name predates this move; not
// worth renaming since the data still represents the same thing.

import { useEffect, useState, useCallback, useRef } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { cn } from "@/lib/utils";
import {
  Plus, X, Trash2, ChevronDown, Folder, FileText,
  Image as ImageIcon, Link as LinkIcon, BookOpen,
  IndentIncrease, IndentDecrease,
} from "lucide-react";
import ImageUpload from "@/components/ui/ImageUpload";

interface Note {
  id: string;
  title: string;
  content: string;
  folder: string | null;
  is_filed: boolean;
  created_at: string;
  updated_at: string;
}

export default function NotesPanel() {
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
      '<div style="display:flex;align-items:flex-start;gap:5px;margin:1px 0"><input type="checkbox" style="margin-top:3px;" /><span style="flex:1;outline:none;min-width:4px;">​</span></div><br/>'
    );
  }

  function insertImage(urlOverride?: string) {
    const url = (urlOverride || imageUrl).trim();
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, `<img src="${url}" alt="" style="max-width:100%" />`);
    setImageUrl(""); setShowImageInput(false);
  }

  function openLinkInput() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    setShowLinkInput(true);
    setShowImageInput(false);
  }

  function insertLink() {
    const url = linkUrl.trim();
    if (!url) return;
    editorRef.current?.focus();
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRangeRef.current);
    }
    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed;
    if (hasSelection) {
      document.execCommand("createLink", false, url);
      editorRef.current?.querySelectorAll(`a[href="${url}"]`).forEach((a) => {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
        (a as HTMLElement).style.color = "#5b642e";
        (a as HTMLElement).style.textDecoration = "underline";
      });
    } else {
      const text = linkText.trim() || url;
      document.execCommand("insertHTML", false,
        `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#5b642e;text-decoration:underline;">${text}</a>`
      );
    }
    setLinkUrl(""); setLinkText(""); setShowLinkInput(false);
    savedRangeRef.current = null;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-13rem)]">
      {/* Editor + view styles travel with the panel */}
      <style>{`
        .notes-editor:empty::before {
          content: "Start typing your note…";
          color: #6b7280;
          pointer-events: none;
          font-style: italic;
        }
        /* Cascading list styles so nested numbered lists go 1. → a. → i. → 1.
           and nested bullet lists go • → ◦ → ▪ → • */
        .notes-editor ul, .note-view ul { list-style-type: disc; padding-left: 1.4em; margin: 2px 0; }
        .notes-editor ul ul, .note-view ul ul { list-style-type: circle; }
        .notes-editor ul ul ul, .note-view ul ul ul { list-style-type: square; }
        .notes-editor ol, .note-view ol { list-style-type: decimal; padding-left: 1.4em; margin: 2px 0; }
        .notes-editor ol ol, .note-view ol ol { list-style-type: lower-alpha; }
        .notes-editor ol ol ol, .note-view ol ol ol { list-style-type: lower-roman; }
        .notes-editor ol ol ol ol, .note-view ol ol ol ol { list-style-type: decimal; }
        .notes-editor li, .note-view li { margin: 1px 0; }
        .notes-editor img, .note-view img { max-width: 100%; height: auto; display: block; margin: 4px 0; border-radius: 2px; }
        .notes-editor a, .note-view a { color: #5b642e; text-decoration: underline; }
        .note-view a { cursor: pointer; }
        .notes-editor input[type="checkbox"] { accent-color: #5b642e; cursor: pointer; margin-right: 4px; }
        .note-view input[type="checkbox"] { accent-color: #5b642e; margin-right: 4px; }
      `}</style>

      <div className="flex items-center justify-between pb-3 mb-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <BookOpen size={13} className="text-muted" />
          <h2 className="text-xs uppercase tracking-wider text-muted font-semibold">Notepad</h2>
        </div>
        <button onClick={newNote} className="text-accent text-xs flex items-center gap-1 hover:text-accent/80">
          <Plus size={12} /> New
        </button>
      </div>

      {activeNotes.length > 0 && (
        <div className="flex gap-1 mb-2 overflow-x-auto shrink-0 pb-1">
          {activeNotes.map((n) => (
            <button
              key={n.id}
              onClick={() => switchNote(n.id)}
              className={cn(
                "shrink-0 text-xs px-2 py-1 border transition-colors max-w-[110px] truncate",
                activeId === n.id ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:border-accent/50",
              )}
            >
              {n.title || "Untitled"}
            </button>
          ))}
        </div>
      )}

      {activeId ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-0.5 mb-1.5 flex-wrap shrink-0">
            <NoteToolBtn onMouseDown={() => execCmd("bold")} title="Bold"><span className="font-bold text-xs">B</span></NoteToolBtn>
            <NoteToolBtn onMouseDown={() => execCmd("italic")} title="Italic"><span className="italic text-xs">I</span></NoteToolBtn>
            <NoteToolBtn onMouseDown={() => execCmd("underline")} title="Underline"><span className="underline text-xs">U</span></NoteToolBtn>
            <div className="w-px h-4 bg-border mx-0.5 shrink-0" />
            <NoteToolBtn onMouseDown={() => execCmd("insertUnorderedList")} title="Bullet list"><span className="text-sm leading-none">•</span></NoteToolBtn>
            <NoteToolBtn onMouseDown={() => execCmd("insertOrderedList")} title="Numbered list"><span className="text-xs">1.</span></NoteToolBtn>
            <NoteToolBtn onMouseDown={() => execCmd("outdent")} title="Outdent (Shift+Tab)"><IndentDecrease size={11} /></NoteToolBtn>
            <NoteToolBtn onMouseDown={() => execCmd("indent")} title="Indent sub-item (Tab)"><IndentIncrease size={11} /></NoteToolBtn>
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

          {showImageInput && (
            <div className="mb-1.5 shrink-0 flex items-start gap-2">
              <div className="flex-1">
                <ImageUpload
                  label="Upload image"
                  onUploaded={(url) => { insertImage(url); }}
                  className="text-xs"
                />
              </div>
              <button onClick={() => setShowImageInput(false)} className="text-muted hover:text-foreground mt-1"><X size={12} /></button>
            </div>
          )}

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

          <input
            value={title}
            onChange={(e) => saveTitle(e.target.value)}
            placeholder="Note title…"
            className="text-sm font-semibold bg-transparent border-b border-border px-0 py-1.5 mb-1.5 text-foreground focus:outline-none focus:border-accent w-full shrink-0"
          />

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => scheduleAutoSave(getCurrentContent())}
            onKeyDown={(e) => {
              // Tab inside a list = nest sub-item; Shift+Tab = unnest.
              // Outside a list, default browser behavior (focus move) wins
              // so the user can still tab out of the editor.
              if (e.key !== "Tab") return;
              const sel = window.getSelection();
              if (!sel || sel.rangeCount === 0) return;
              const node = sel.anchorNode;
              let el: HTMLElement | null = node instanceof HTMLElement ? node : node?.parentElement || null;
              while (el && el !== editorRef.current) {
                if (el.tagName === "LI") {
                  e.preventDefault();
                  document.execCommand(e.shiftKey ? "outdent" : "indent");
                  scheduleAutoSave(getCurrentContent());
                  return;
                }
                el = el.parentElement;
              }
            }}
            className="notes-editor flex-1 overflow-auto bg-card border border-border p-3 text-sm text-foreground focus:outline-none"
            style={{ lineHeight: "1.7", minHeight: "120px" }}
          />

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

        <div
          className="note-view flex-1 overflow-auto px-6 py-5 text-sm text-gray-800"
          style={{ lineHeight: "1.75" }}
          dangerouslySetInnerHTML={{ __html: note.content || "<p style='color:#9ca3af;font-style:italic;'>Empty note</p>" }}
        />
      </div>
    </div>
  );
}
