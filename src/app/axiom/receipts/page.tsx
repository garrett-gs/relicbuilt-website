"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { CustomWork } from "@/types/axiom";
import { Camera, Check, Plus, X, Loader2, Trash2, Delete, ShoppingCart } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import AddToPOModal, { AddToPOItem } from "@/components/ui/AddToPOModal";

// ── PIN Gate ─────────────────────────────────────────────────

const PIN_SESSION_KEY = "relic_receipts_pin_ok";

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [entry, setEntry] = useState("");
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState("");

  async function checkPin(pin: string) {
    setChecking(true);
    setHint("");
    const { data, error } = await axiom.from("settings").select("receipts_pin").limit(1).single();
    setChecking(false);

    if (error) {
      setHint(`DB error: ${error.message}`);
      setEntry("");
      return;
    }
    if (!data?.receipts_pin) {
      setHint("No PIN set — go to Settings → General to set one.");
      setEntry("");
      return;
    }
    if (pin === data.receipts_pin) {
      sessionStorage.setItem(PIN_SESSION_KEY, "1");
      onUnlock();
    } else {
      setHint("Incorrect PIN");
      setShake(true);
      setTimeout(() => { setShake(false); setEntry(""); setHint(""); }, 1000);
    }
  }

  function press(val: string) {
    if (entry.length >= 4) return;
    const next = entry + val;
    setEntry(next);
    if (next.length === 4) checkPin(next);
  }

  function del() { setEntry((e) => e.slice(0, -1)); }

  const pad = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 gap-8">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
          <Camera size={22} className="text-accent" />
        </div>
        <h1 className="text-2xl font-heading font-bold">RELIC Receipts</h1>
        <p className="text-muted text-sm mt-1">Enter your PIN to continue</p>
      </div>

      {/* Dots */}
      <div className="flex flex-col items-center gap-3">
        <div className={cn("flex gap-4 transition-transform", shake && "animate-[shake_0.4s_ease-in-out]")}>
          {[0,1,2,3].map((i) => (
            <div
              key={i}
              className={cn(
                "w-4 h-4 rounded-full border-2 transition-colors",
                i < entry.length ? "bg-accent border-accent" : "border-border bg-transparent"
              )}
            />
          ))}
        </div>
        {hint && <p className="text-xs text-amber-400 text-center max-w-xs">{hint}</p>}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-64">
        {pad.map((k, i) => k === "" ? (
          <div key={i} />
        ) : k === "⌫" ? (
          <button key={i} onPointerDown={del} className="h-16 rounded-lg bg-card border border-border flex items-center justify-center text-muted hover:text-foreground active:scale-95 transition-transform">
            <Delete size={20} />
          </button>
        ) : (
          <button
            key={i}
            onPointerDown={() => press(k)}
            disabled={checking}
            className="h-16 rounded-lg bg-card border border-border text-xl font-medium text-foreground hover:border-accent hover:text-accent active:scale-95 transition-all"
          >
            {checking && entry.length === 4 ? <Loader2 size={18} className="animate-spin mx-auto text-accent" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}

interface LineItem {
  description: string;
  qty: number;
  unit_price: number;
  total: number;
}

interface ParsedReceipt {
  vendor?: string;
  date?: string;
  items?: Partial<LineItem>[];
  subtotal?: number;
  tax?: number;
  total?: number;
  error?: string;
}

interface ReceiptRecord {
  id: string;
  image_url?: string;
  vendor?: string;
  receipt_date?: string;
  total?: number;
  line_items: LineItem[];
  project_id?: string;
  project_name?: string;
  notes?: string;
  created_at: string;
}

const money = (n: number) => `$${(n || 0).toFixed(2)}`;

type Step = "capture" | "parsing" | "review" | "saving" | "saved";

export default function ReceiptsPage() {
  const [pinOk, setPinOk] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(PIN_SESSION_KEY) === "1") setPinOk(true);
  }, []);

  if (!pinOk) return <PinGate onUnlock={() => setPinOk(true)} />;

  return <ReceiptsMain />;
}

function ReceiptsMain() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("capture");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [vendor, setVendor] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [error, setError] = useState("");
  const [poItem, setPoItem] = useState<AddToPOItem | null>(null);

  const loadData = useCallback(async () => {
    const [{ data: pw }, { data: rec }] = await Promise.all([
      axiom.from("custom_work").select("*").order("project_name"),
      axiom.from("receipts").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    if (pw) setProjects(pw as CustomWork[]);
    if (rec) setReceipts(rec as ReceiptRecord[]);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleFile(file: File) {
    setError("");

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setStep("parsing");

    // Upload to Supabase storage
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data: uploadData, error: uploadErr } = await axiom.storage
      .from("receipts")
      .upload(path, file, { contentType: file.type });

    if (uploadErr) {
      setError("Upload failed: " + uploadErr.message);
      setStep("capture");
      return;
    }

    const { data: { publicUrl } } = axiom.storage.from("receipts").getPublicUrl(uploadData.path);
    setImageUrl(publicUrl);

    // Parse with AI
    try {
      const res = await fetch("/api/parse-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: publicUrl }),
      });
      const parsed: ParsedReceipt = await res.json();

      if (parsed.error) throw new Error(String(parsed.error));

      setVendor(parsed.vendor || "");
      if (parsed.date) setReceiptDate(parsed.date);
      setItems(
        (parsed.items || []).map((it) => ({
          description: it.description || "",
          qty: Number(it.qty) || 1,
          unit_price: Number(it.unit_price) || 0,
          total: Number(it.total) || (Number(it.qty) || 1) * (Number(it.unit_price) || 0),
        }))
      );
      setTax(Number(parsed.tax) || 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Parse error: ${msg}`);
      setItems([{ description: "", qty: 1, unit_price: 0, total: 0 }]);
    }

    setStep("review");
  }

  function updateItem(i: number, field: keyof LineItem, value: string | number) {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    if (field === "qty" || field === "unit_price") {
      updated[i].total = (Number(updated[i].qty) || 0) * (Number(updated[i].unit_price) || 0);
    }
    setItems(updated);
  }

  const subtotal = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const total = subtotal + (Number(tax) || 0);

  async function save() {
    setStep("saving");
    const linkedProject = projects.find((p) => p.id === selectedProjectId);

    // Insert receipt — line items stay on the receipt, not copied to project materials
    await axiom.from("receipts").insert({
      image_url: imageUrl || null,
      vendor: vendor || null,
      receipt_date: receiptDate || null,
      total,
      line_items: items,
      project_id: selectedProjectId || null,
      project_name: linkedProject?.project_name || null,
      notes: notes || null,
    });

    setStep("saved");
    loadData();
  }

  function reset() {
    setStep("capture");
    setImageUrl("");
    setImagePreview("");
    setVendor("");
    setReceiptDate(new Date().toISOString().split("T")[0]);
    setItems([]);
    setTax(0);
    setNotes("");
    setSelectedProjectId("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold">Receipts</h1>
        <p className="text-muted text-sm">Photograph a receipt — AI reads it, you link it to a project.</p>
      </div>

      {/* ── Step 1: Capture ── */}
      {step === "capture" && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-border hover:border-accent transition-colors p-12 flex flex-col items-center gap-4 text-muted hover:text-accent"
          >
            <Camera size={52} strokeWidth={1.2} />
            <div className="text-center">
              <p className="font-medium text-foreground text-lg">Photograph a Receipt</p>
              <p className="text-sm mt-1">Tap to open camera · or choose from library</p>
            </div>
          </button>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>
      )}

      {/* ── Step 2: Parsing ── */}
      {step === "parsing" && (
        <div className="flex flex-col items-center gap-5 py-16">
          {imagePreview && (
            <div className="relative w-36 h-36">
              <img
                src={imagePreview}
                alt="Receipt"
                className="w-full h-full object-cover rounded border border-border"
              />
              <div className="absolute inset-0 bg-background/70 rounded flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-accent" />
              </div>
            </div>
          )}
          <p className="text-muted text-sm">Analyzing receipt…</p>
        </div>
      )}

      {/* ── Step 3: Review ── */}
      {(step === "review" || step === "saving") && (
        <div className="space-y-5">
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Receipt"
              className="w-full max-h-52 object-contain border border-border bg-card rounded"
            />
          )}
          {error && (
            <p className="text-sm text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-2">
              {error}
            </p>
          )}

          {/* Vendor + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Vendor</label>
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Vendor name"
                className="w-full bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Date</label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs uppercase tracking-wider text-muted">Line Items</label>
              <button
                onClick={() => setItems([...items, { description: "", qty: 1, unit_price: 0, total: 0 }])}
                className="text-accent text-xs flex items-center gap-1"
              >
                <Plus size={12} /> Add
              </button>
            </div>

            <div className="space-y-2">
              {items.length === 0 && (
                <button
                  onClick={() => setItems([{ description: "", qty: 1, unit_price: 0, total: 0 }])}
                  className="w-full border border-dashed border-border py-4 text-sm text-muted hover:border-accent hover:text-accent transition-colors"
                >
                  + Add line item
                </button>
              )}
              {items.map((item, i) => (
                <div key={i} className="bg-card border border-border p-2 space-y-2">
                  <div className="flex gap-2 items-center">
                    <input
                      value={item.description}
                      onChange={(e) => updateItem(i, "description", e.target.value)}
                      placeholder="Description"
                      className="flex-1 bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent min-w-0"
                    />
                    <button
                      onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                      className="text-muted hover:text-red-500 shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5">Qty</label>
                      <input
                        type="number"
                        value={item.qty || ""}
                        onChange={(e) => updateItem(i, "qty", Number(e.target.value))}
                        className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent text-right"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5">Unit Price</label>
                      <input
                        type="number"
                        value={item.unit_price || ""}
                        onChange={(e) => updateItem(i, "unit_price", Number(e.target.value))}
                        className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent text-right"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5">Total</label>
                      <p className="text-sm font-mono text-right pt-1.5">{money(item.total)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPoItem({ description: item.description, qty: item.qty, unit_price: item.unit_price, vendor_name: vendor })}
                    className="flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
                  >
                    <ShoppingCart size={12} /> Add to P.O.
                  </button>
                </div>
              ))}
            </div>

            {items.length > 0 && (
              <div className="mt-2 space-y-1 text-sm border-t border-border pt-2">
                <div className="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span className="font-mono">{money(subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted items-center gap-4">
                  <span className="shrink-0">Tax</span>
                  <input
                    type="number"
                    value={tax || ""}
                    onChange={(e) => setTax(Number(e.target.value))}
                    placeholder="0.00"
                    className="w-24 bg-card border border-border px-2 py-1 text-sm text-right text-foreground focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span className="font-mono">{money(total)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Link to project */}
          <div>
            <label className="text-xs text-muted block mb-1">Link to Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
            >
              <option value="">— No project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_name}</option>
              ))}
            </select>
            {selectedProjectId && (
              <p className="text-xs text-muted mt-1">
                Line items will be added to this project&apos;s material log.
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes…"
              className="w-full bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent min-h-[60px] resize-y"
            />
          </div>

          <div className="flex gap-3 pb-8">
            <Button onClick={save} disabled={step === "saving"} className="flex-1">
              {step === "saving" ? "Saving…" : "Save Receipt"}
            </Button>
            <Button variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Saved ── */}
      {step === "saved" && (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
            <Check size={32} className="text-accent" />
          </div>
          <h2 className="text-xl font-heading font-bold">Receipt Saved</h2>
          {selectedProjectId && (
            <p className="text-muted text-sm">
              Materials added to {projects.find((p) => p.id === selectedProjectId)?.project_name}.
            </p>
          )}
          <Button onClick={reset} className="mt-2">Add Another</Button>
        </div>
      )}

      {/* ── Receipt history ── */}
      {step === "capture" && receipts.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs uppercase tracking-wider text-muted mb-3">Recent Receipts</h2>
          <div className="space-y-2">
            {receipts.map((r) => (
              <div key={r.id} className="bg-card border border-border p-3 flex gap-3 items-start">
                {r.image_url ? (
                  <img
                    src={r.image_url}
                    alt=""
                    className="w-12 h-12 object-cover rounded border border-border shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 bg-border/30 rounded border border-border shrink-0 flex items-center justify-center">
                    <Camera size={16} className="text-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.vendor || "Unknown vendor"}</p>
                  <p className="text-xs text-muted">
                    {r.receipt_date
                      ? new Date(r.receipt_date + "T12:00:00").toLocaleDateString()
                      : new Date(r.created_at).toLocaleDateString()}
                    {r.project_name ? ` · ${r.project_name}` : ""}
                  </p>
                  {r.line_items?.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {r.line_items.map((li, li_i) => (
                        <div key={li_i} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 text-muted truncate">{li.description}</span>
                          <span className="font-mono text-muted shrink-0">{money(li.total)}</span>
                          <button
                            onClick={() => setPoItem({ description: li.description, qty: li.qty, unit_price: li.unit_price, vendor_name: r.vendor })}
                            className="flex items-center gap-0.5 text-muted hover:text-accent transition-colors shrink-0"
                            title="Add to P.O."
                          >
                            <ShoppingCart size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <p className="text-sm font-mono">{money(r.total || 0)}</p>
                  <button
                    onClick={async () => {
                      if (!confirm("Delete this receipt?")) return;
                      await axiom.from("receipts").delete().eq("id", r.id);
                      setReceipts((prev) => prev.filter((x) => x.id !== r.id));
                    }}
                    className="text-muted hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add to P.O. modal */}
      {poItem && (
        <AddToPOModal
          item={poItem}
          onClose={() => setPoItem(null)}
          onAdded={() => setPoItem(null)}
        />
      )}
    </div>
  );
}
