"use client";

import { useCallback, useEffect, useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Note, BusinessEntity } from "@/types/axiom";
import { formatDateTime } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { StickyNote, Trash2, Share2 } from "lucide-react";

/**
 * The record side of the Notes feature: the notes tagged to one project, quote,
 * or order, shown directly on that record — so a note written on the Notes page
 * (or added by Claude over MCP) loads into the actual project here, and a note
 * added here shows up on the Notes page. One column per record type mirrors the
 * explicit-FK pattern already on the notes table (customer_id / custom_work_id).
 */
export type NoteRecordType = "project" | "quote" | "order";

export const NOTE_RECORD_COLUMN: Record<NoteRecordType, "custom_work_id" | "estimate_id" | "work_order_id"> = {
  project: "custom_work_id",
  quote: "estimate_id",
  order: "work_order_id",
};

const RECORD_LABEL: Record<NoteRecordType, string> = {
  project: "project",
  quote: "quote",
  order: "work order",
};

export default function RecordNotesPanel({
  recordType,
  recordId,
  entity,
  className,
}: {
  recordType: NoteRecordType;
  recordId: string;
  entity: BusinessEntity;
  className?: string;
}) {
  const { userEmail } = useAuth();
  const column = NOTE_RECORD_COLUMN[recordType];
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await axiom
      .from("notes")
      .select("*")
      .eq(column, recordId)
      .order("created_at", { ascending: false });
    setNotes((data as Note[]) || []);
    setLoading(false);
  }, [column, recordId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!body.trim()) return;
    setAdding(true);
    try {
      const { data, error } = await axiom
        .from("notes")
        .insert({ entity, body: body.trim(), [column]: recordId, created_by: userEmail || null })
        .select()
        .single();
      if (error || !data) {
        // Surface a failed write instead of silently dropping the note, and
        // keep the typed text so nothing is lost.
        alert(error?.message || "Couldn't add that note — nothing was saved. Your text is still here.");
        return;
      }
      await logActivity({
        action: "created",
        entity: "note",
        entity_id: data.id,
        label: `Added note on ${RECORD_LABEL[recordType]}`,
        user_name: userEmail,
      });
      setBody("");
      load();
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this note? This can't be undone.")) return;
    await axiom.from("notes").delete().eq("id", id);
    load();
  }

  return (
    <div className={`bg-card border border-border border-t-2 border-t-accent/30 p-4 ${className || ""}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground border-l-2 border-accent pl-3 flex items-center gap-2">
          <StickyNote size={14} className="text-accent" /> Notes
          <span className="text-muted text-xs font-normal">({notes.length})</span>
        </h3>
      </div>

      <div className="flex gap-2 mb-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={`Add a note on this ${RECORD_LABEL[recordType]}… (⌘↵ to post)`}
          rows={2}
          className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent resize-y min-h-[56px]"
        />
        <Button onClick={add} disabled={!body.trim() || adding} className="self-stretch">
          {adding ? "Adding…" : "Add"}
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted animate-pulse">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted italic">
          No notes yet. Notes tagged to this {RECORD_LABEL[recordType]} — here, on the Notes page, or by Claude over MCP — show up here.
        </p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {notes.map((n) => {
            const fromOtherSide = n.entity && n.entity !== entity;
            return (
              <div key={n.id} className="group bg-background border-l-2 border-accent/40 px-3 py-2">
                <div className="flex items-center justify-between mb-1 text-xs text-muted">
                  <span className="font-medium text-foreground/80 flex items-center gap-1.5">
                    {n.created_by ? n.created_by.split("@")[0] : "Team"}
                    {fromOtherSide && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted border border-border px-1 py-0.5">
                        <Share2 size={9} /> {n.entity === "relic" ? "RELIC" : "Wallflower"}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <span title={n.created_at}>{formatDateTime(n.created_at)}</span>
                    <button
                      onClick={() => remove(n.id)}
                      className="text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete note"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
                {n.title && <p className="text-sm font-medium text-foreground">{n.title}</p>}
                <p className="text-sm text-foreground whitespace-pre-wrap">{n.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
