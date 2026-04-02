"use client";

import { useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import {
  ProjectChecklist, ChecklistSection, ChecklistGroup, ChecklistItem, ChecklistStep,
} from "@/types/axiom";
import { Plus, X, ChevronDown, ChevronRight, Upload, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  initial: ProjectChecklist;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function sectionStats(section: ChecklistSection) {
  const items = section.groups.flatMap((g) => g.items);
  const total = items.length + section.steps.length;
  const done = items.filter((i) => i.completed).length + section.steps.filter((s) => s.completed).length;
  return { done, total };
}

export default function ChecklistPanel({ projectId, initial }: Props) {
  const [checklist, setChecklist] = useState<ProjectChecklist>(
    initial?.sections ? initial : { sections: [] }
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState("");
  const [editMode, setEditMode] = useState(false);

  // ── Persistence ──────────────────────────────────────────────
  async function persist(updated: ProjectChecklist) {
    setChecklist(updated);
    await axiom
      .from("custom_work")
      .update({ checklist: updated, updated_at: new Date().toISOString() })
      .eq("id", projectId);
  }

  function clone() {
    return JSON.parse(JSON.stringify(checklist)) as ProjectChecklist;
  }

  // ── Toggle ───────────────────────────────────────────────────
  function toggleItem(sId: string, gId: string, iId: string) {
    const u = clone();
    const sec = u.sections.find((s) => s.id === sId);
    const grp = sec?.groups.find((g) => g.id === gId);
    const item = grp?.items.find((i) => i.id === iId);
    if (item) { item.completed = !item.completed; persist(u); }
  }

  function toggleStep(sId: string, stId: string) {
    const u = clone();
    const step = u.sections.find((s) => s.id === sId)?.steps.find((st) => st.id === stId);
    if (step) { step.completed = !step.completed; persist(u); }
  }

  // ── Add ──────────────────────────────────────────────────────
  function addSection() {
    const u = clone();
    u.sections.push({ id: uid(), title: "New Section", groups: [], steps: [] });
    persist(u);
  }

  function addGroup(sId: string) {
    const u = clone();
    const sec = u.sections.find((s) => s.id === sId);
    if (sec) { sec.groups.push({ id: uid(), label: "New Group", items: [] }); persist(u); }
  }

  function addItem(sId: string, gId: string) {
    const u = clone();
    const grp = u.sections.find((s) => s.id === sId)?.groups.find((g) => g.id === gId);
    if (grp) { grp.items.push({ id: uid(), label: "New item", completed: false }); persist(u); }
  }

  function addStep(sId: string) {
    const u = clone();
    const sec = u.sections.find((s) => s.id === sId);
    if (sec) { sec.steps.push({ id: uid(), label: "New step", completed: false }); persist(u); }
  }

  // ── Delete ───────────────────────────────────────────────────
  function deleteSection(sId: string) {
    const u = clone();
    u.sections = u.sections.filter((s) => s.id !== sId);
    persist(u);
  }

  function deleteGroup(sId: string, gId: string) {
    const u = clone();
    const sec = u.sections.find((s) => s.id === sId);
    if (sec) { sec.groups = sec.groups.filter((g) => g.id !== gId); persist(u); }
  }

  function deleteItem(sId: string, gId: string, iId: string) {
    const u = clone();
    const grp = u.sections.find((s) => s.id === sId)?.groups.find((g) => g.id === gId);
    if (grp) { grp.items = grp.items.filter((i) => i.id !== iId); persist(u); }
  }

  function deleteStep(sId: string, stId: string) {
    const u = clone();
    const sec = u.sections.find((s) => s.id === sId);
    if (sec) { sec.steps = sec.steps.filter((st) => st.id !== stId); persist(u); }
  }

  // ── Rename ───────────────────────────────────────────────────
  function renameSection(sId: string, title: string) {
    const u = clone();
    const sec = u.sections.find((s) => s.id === sId);
    if (sec) { sec.title = title; persist(u); }
  }

  function renameGroup(sId: string, gId: string, label: string) {
    const u = clone();
    const grp = u.sections.find((s) => s.id === sId)?.groups.find((g) => g.id === gId);
    if (grp) { grp.label = label; persist(u); }
  }

  function renameItem(sId: string, gId: string, iId: string, label: string) {
    const u = clone();
    const item = u.sections.find((s) => s.id === sId)?.groups.find((g) => g.id === gId)?.items.find((i) => i.id === iId);
    if (item) { item.label = label; persist(u); }
  }

  function renameStep(sId: string, stId: string, label: string) {
    const u = clone();
    const step = u.sections.find((s) => s.id === sId)?.steps.find((st) => st.id === stId);
    if (step) { step.label = label; persist(u); }
  }

  // ── Import ───────────────────────────────────────────────────
  function importChecklist() {
    try {
      const parsed = JSON.parse(importJson);
      const rawSections: ChecklistSection[] = parsed.sections || [];
      const sections: ChecklistSection[] = rawSections.map((s) => ({
        id: s.id || uid(),
        title: s.title || "Untitled",
        groups: (s.groups || []).map((g: ChecklistGroup) => ({
          id: g.id || uid(),
          label: g.label || "Untitled",
          items: (g.items || []).map((i: ChecklistItem) => ({
            ...i,
            id: i.id || uid(),
            completed: false,
          })),
        })),
        steps: (s.steps || []).map((st: ChecklistStep) => ({
          ...st,
          id: st.id || uid(),
          completed: false,
        })),
      }));
      persist({ sections });
      setShowImport(false);
      setImportJson("");
      setImportError("");
    } catch {
      setImportError("Invalid JSON — check the format and try again.");
    }
  }

  // ── Stats ────────────────────────────────────────────────────
  const allItems = checklist.sections.flatMap((s) => [
    ...s.groups.flatMap((g) => g.items),
    ...s.steps,
  ]);
  const totalDone = allItems.filter((i) => i.completed).length;
  const totalAll = allItems.length;
  const pct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground border-l-2 border-accent pl-3">
            Checklist
          </h3>
          {totalAll > 0 && (
            <span className="text-xs text-muted font-mono">
              {totalDone}/{totalAll} · {pct}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode((e) => !e)}
            className={cn("text-xs px-2 py-1 border transition-colors", editMode ? "border-accent text-accent" : "border-border text-muted hover:text-foreground")}
          >
            {editMode ? "Done editing" : "Edit"}
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="text-xs flex items-center gap-1 text-muted hover:text-accent transition-colors"
          >
            <Upload size={12} /> Import
          </button>
          {editMode && (
            <button
              onClick={addSection}
              className="text-accent text-xs flex items-center gap-1"
            >
              <Plus size={12} /> Section
            </button>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      {totalAll > 0 && (
        <div className="mb-4 h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Empty state */}
      {checklist.sections.length === 0 && (
        <div className="text-center py-8 border border-dashed border-border">
          <p className="text-muted text-sm mb-3">No checklist yet.</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => setShowImport(true)} className="text-xs flex items-center gap-1 text-accent hover:underline">
              <Upload size={12} /> Import from JSON
            </button>
            <button onClick={addSection} className="text-xs flex items-center gap-1 text-accent hover:underline">
              <Plus size={12} /> Add section manually
            </button>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {checklist.sections.map((section) => {
          const { done, total } = sectionStats(section);
          const isOpen = expanded[section.id] !== false; // default open

          return (
            <div key={section.id} className="border border-border rounded overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-2 bg-card px-3 py-2 border-b border-border">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [section.id]: !isOpen }))}
                  className="text-muted hover:text-foreground shrink-0"
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {editMode ? (
                  <input
                    value={section.title}
                    onChange={(e) => renameSection(section.id, e.target.value)}
                    className="flex-1 bg-transparent text-sm font-semibold text-foreground focus:outline-none border-b border-dashed border-border"
                  />
                ) : (
                  <span className="flex-1 text-sm font-semibold text-foreground">{section.title}</span>
                )}

                <span className="text-xs font-mono text-muted shrink-0">
                  {done}/{total}
                </span>

                {/* Section progress mini-bar */}
                <div className="w-16 h-1 bg-border rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: total > 0 ? `${Math.round((done / total) * 100)}%` : "0%" }}
                  />
                </div>

                {editMode && (
                  <button onClick={() => deleteSection(section.id)} className="text-muted hover:text-red-500 shrink-0">
                    <X size={14} />
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="p-3 space-y-4">
                  {/* Groups + items */}
                  {section.groups.map((group) => (
                    <div key={group.id}>
                      <div className="flex items-center gap-2 mb-1.5">
                        {editMode ? (
                          <input
                            value={group.label}
                            onChange={(e) => renameGroup(section.id, group.id, e.target.value)}
                            className="flex-1 bg-transparent text-[11px] uppercase tracking-wider text-muted focus:outline-none border-b border-dashed border-border"
                          />
                        ) : (
                          <p className="text-[11px] uppercase tracking-wider text-muted flex-1">{group.label}</p>
                        )}
                        {editMode && (
                          <>
                            <button onClick={() => addItem(section.id, group.id)} className="text-accent" title="Add item"><Plus size={11} /></button>
                            <button onClick={() => deleteGroup(section.id, group.id)} className="text-muted hover:text-red-500" title="Delete group"><X size={11} /></button>
                          </>
                        )}
                      </div>

                      <div className="space-y-1">
                        {group.items.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 group/item">
                            <button
                              onClick={() => toggleItem(section.id, group.id, item.id)}
                              className={cn(
                                "w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors",
                                item.completed ? "bg-accent border-accent" : "border-border hover:border-accent"
                              )}
                            >
                              {item.completed && <Check size={10} className="text-white" strokeWidth={3} />}
                            </button>

                            {editMode ? (
                              <input
                                value={item.label}
                                onChange={(e) => renameItem(section.id, group.id, item.id, e.target.value)}
                                className={cn("flex-1 bg-transparent text-sm focus:outline-none border-b border-dashed border-border", item.completed && "line-through text-muted")}
                              />
                            ) : (
                              <span className={cn("text-sm flex-1", item.completed ? "line-through text-muted" : "text-foreground")}>
                                {item.label}
                              </span>
                            )}

                            {editMode && (
                              <button onClick={() => deleteItem(section.id, group.id, item.id)} className="text-muted hover:text-red-500 opacity-0 group-hover/item:opacity-100 shrink-0">
                                <X size={11} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Steps */}
                  {(section.steps.length > 0 || editMode) && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="text-[11px] uppercase tracking-wider text-muted flex-1">Process Steps</p>
                        {editMode && (
                          <button onClick={() => addStep(section.id)} className="text-accent" title="Add step"><Plus size={11} /></button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {section.steps.map((step) => (
                          <div key={step.id} className="flex items-center gap-2 group/step">
                            <button
                              onClick={() => toggleStep(section.id, step.id)}
                              className={cn(
                                "w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors",
                                step.completed ? "bg-accent border-accent" : "border-border hover:border-accent"
                              )}
                            >
                              {step.completed && <Check size={10} className="text-white" strokeWidth={3} />}
                            </button>

                            {editMode ? (
                              <input
                                value={step.label}
                                onChange={(e) => renameStep(section.id, step.id, e.target.value)}
                                className={cn("flex-1 bg-transparent text-sm focus:outline-none border-b border-dashed border-border", step.completed && "line-through text-muted")}
                              />
                            ) : (
                              <span className={cn("text-sm flex-1", step.completed ? "line-through text-muted" : "text-foreground")}>
                                {step.label}
                              </span>
                            )}

                            {editMode && (
                              <button onClick={() => deleteStep(section.id, step.id)} className="text-muted hover:text-red-500 opacity-0 group-hover/step:opacity-100 shrink-0">
                                <X size={11} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Edit mode: add group */}
                  {editMode && (
                    <button
                      onClick={() => addGroup(section.id)}
                      className="text-xs text-muted hover:text-accent flex items-center gap-1 transition-colors"
                    >
                      <Plus size={11} /> Add group
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Import modal */}
      {showImport && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowImport(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border p-5 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Import Checklist from JSON</h3>
              <button onClick={() => setShowImport(false)} className="text-muted hover:text-foreground"><X size={16} /></button>
            </div>
            <p className="text-xs text-muted mb-3">
              Paste a JSON checklist. Use the same format as your project_checklist.json file.
              Completion is reset on import.
            </p>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={'{\n  "sections": [...]\n}'}
              className="w-full h-48 bg-card border border-border px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-accent resize-none"
              autoFocus
            />
            {importError && <p className="text-red-500 text-xs mt-1">{importError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={importChecklist}
                disabled={!importJson.trim()}
                className="flex-1 bg-accent text-white py-2 text-sm font-medium hover:bg-accent/80 disabled:opacity-40 transition-colors"
              >
                Import
              </button>
              <button onClick={() => setShowImport(false)} className="px-4 border border-border text-sm text-muted hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
