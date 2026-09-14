"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Check, Ban, AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useEntity } from "./EntityProvider";

/**
 * Floating Axiom Assistant.
 *
 * A chat that can DO things — it calls a fixed, server-side whitelist of data
 * operations (add a customer, move a work order, draft an estimate, …). It can
 * never touch code, schema, or settings structure. Every write pauses for an
 * explicit confirm here in the UI; money and outbound actions are flagged red.
 *
 * The full Anthropic-format conversation lives in `raw` and is re-sent every
 * turn (the API is stateless). `view` is the human-readable transcript.
 */

// One message as Anthropic expects it; content is opaque to the client.
type RawMsg = { role: "user" | "assistant"; content: unknown };

type ViewMsg = { id: string; role: "user" | "assistant"; text: string };

interface Pending {
  toolUseId: string;
  tool: string;
  title: string;
  summary: string;
  risk: "money" | "outbound" | "normal";
}

interface ApiResponse {
  messages: RawMsg[];
  reply: string;
  pending?: Pending | null;
  error?: string;
}

let idSeq = 0;
const nextId = () => `m${++idSeq}`;

export default function Assistant() {
  const { session } = useAuth();
  const { entity } = useEntity();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState<RawMsg[]>([]);
  const [view, setView] = useState<ViewMsg[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isRelic = entity === "relic";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [view, pending, busy]);

  // Only signed-in users get the assistant (the page shell handles login).
  if (!session) return null;

  async function callApi(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/axiom/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify({ ...body, entity }),
      });
      const data: ApiResponse = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setRaw(data.messages || []);
      if (data.reply?.trim()) {
        setView((v) => [...v, { id: nextId(), role: "assistant", text: data.reply.trim() }]);
      }
      setPending(data.pending || null);
    } catch {
      setError("Couldn't reach the assistant.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || pending) return;
    setInput("");
    setView((v) => [...v, { id: nextId(), role: "user", text }]);
    const nextRaw: RawMsg[] = [...raw, { role: "user", content: text }];
    setRaw(nextRaw);
    await callApi({ messages: nextRaw });
  }

  async function resolve(approved: boolean) {
    if (!pending || busy) return;
    const p = pending;
    setPending(null);
    setView((v) => [
      ...v,
      {
        id: nextId(),
        role: "user",
        text: approved ? `✓ Confirmed: ${p.title}` : `✕ Cancelled: ${p.title}`,
      },
    ]);
    await callApi({ messages: raw, approve: { toolUseId: p.toolUseId, approved } });
  }

  function reset() {
    setRaw([]);
    setView([]);
    setPending(null);
    setError("");
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-white shadow-lg hover:opacity-90 transition"
        >
          <Sparkles size={18} />
          <span className="text-sm font-medium hidden sm:inline">Assistant</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[600px] max-h-[85vh] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              <span className="text-sm font-semibold text-foreground">Assistant</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  isRelic ? "bg-accent/15 text-accent" : "bg-muted/15 text-muted"
                }`}
              >
                {isRelic ? "RELIC" : "Wallflower"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {view.length > 0 && (
                <button onClick={reset} className="text-xs text-muted hover:text-foreground px-2 py-1">
                  New
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-foreground p-1">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {view.length === 0 && !busy && (
              <div className="mt-6 text-center text-sm text-muted">
                <p className="mb-2 font-medium text-foreground">How can I help?</p>
                <p className="leading-relaxed">
                  Add a client, update a job, move a work order, draft an estimate, log an expense, check
                  stock. I&apos;ll ask you to confirm before saving anything.
                </p>
              </div>
            )}

            {view.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-accent text-white"
                      : "bg-background text-foreground border border-border"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {/* Pending confirmation */}
            {pending && (
              <div
                className={`rounded-lg border p-3 ${
                  pending.risk === "normal" ? "border-accent/40 bg-accent/5" : "border-red-400/50 bg-red-500/5"
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  {pending.risk !== "normal" && <AlertTriangle size={14} className="text-red-500" />}
                  <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    {pending.risk === "money"
                      ? "Confirm — money"
                      : pending.risk === "outbound"
                        ? "Confirm — sends to client"
                        : "Confirm change"}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">{pending.title}</p>
                {pending.summary && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{pending.summary}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => resolve(true)}
                    disabled={busy}
                    className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Check size={13} /> Confirm
                  </button>
                  <button
                    onClick={() => resolve(false)}
                    disabled={busy}
                    className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Ban size={13} /> Cancel
                  </button>
                </div>
              </div>
            )}

            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 size={14} className="animate-spin" /> Working…
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-400/50 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={pending ? "Confirm or cancel above first…" : "Ask or tell me to do something…"}
                disabled={busy || !!pending}
                className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={send}
                disabled={busy || !!pending || !input.trim()}
                aria-label="Send"
                className="rounded-lg bg-accent p-2 text-white hover:opacity-90 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
