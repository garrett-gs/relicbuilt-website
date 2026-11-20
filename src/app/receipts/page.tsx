"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PurchaseOrder, TeamMember } from "@/types/axiom";
import { Camera, Check, Plus, X, Loader2, Trash2, ShoppingCart, Package, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Session } from "@supabase/supabase-js";
import Button from "@/components/ui/Button";
import AddToPOModal, { AddToPOItem } from "@/components/ui/AddToPOModal";
import DateField from "@/components/ui/DateField";
import { axiom } from "@/lib/axiom-supabase";
import { authedFetch } from "@/lib/authed-fetch";
import { SITE_ENTITY } from "@/lib/axiom-site";

// ── Identity ─────────────────────────────────────────────────
// The receipts app is part of Axiom: whoever is signed into Axiom on this
// device owns the receipts they add. No separate PIN — the receipt is stamped
// with the signed-in team member's name (submitted_by). Reads and writes go
// through the anon-key `axiom` client under RLS, exactly like /axiom/receipts.

// ── RELIC masthead ───────────────────────────────────────────
// Branded RELIC (not the Wallflower marketing nav), with a way back into Axiom.

function ReceiptsHeader() {
  return (
    <div className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/relic-shield-gold.png" alt="RELIC" className="h-7 w-7 object-contain shrink-0" />
          <span className="font-heading font-bold tracking-[0.18em] text-sm whitespace-nowrap">RELIC RECEIPTS</span>
        </div>
        <Link
          href="/axiom/receipts"
          className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold text-muted hover:text-accent transition-colors whitespace-nowrap"
        >
          <ArrowLeft size={13} /> Back to Axiom
        </Link>
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
  purchase_order_id?: string;
  notes?: string;
  submitted_by?: string;
  created_at: string;
}

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

type Step = "capture" | "parsing" | "review" | "saving" | "saved";

export default function ReceiptsApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [memberName, setMemberName] = useState("");

  // Share the Axiom auth session (same browser session as the main app).
  useEffect(() => {
    axiom.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = axiom.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Resolve the signed-in user's display name for submitted_by.
  const email = session?.user?.email?.toLowerCase() || "";
  useEffect(() => {
    if (!email) return;
    let active = true;
    axiom.from("settings").select("team_members").limit(1).single().then(({ data }) => {
      if (!active) return;
      const members = (data?.team_members || []) as TeamMember[];
      const m = members.find((x) => x.email?.toLowerCase() === email);
      setMemberName(m?.name || email);
    });
    return () => { active = false; };
  }, [email]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ReceiptsHeader />
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5 text-center">
          <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
            <Camera size={22} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold">RELIC Receipts</h1>
            <p className="text-muted text-sm mt-1 max-w-xs">
              Sign in to Axiom to add receipts — each one is saved under your name.
            </p>
          </div>
          <Link
            href="/axiom/receipts"
            className="bg-accent text-background px-5 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Go to Axiom to sign in
          </Link>
        </div>
      </div>
    );
  }

  return <ReceiptsMain memberName={memberName || email} />;
}

function ReceiptsMain({ memberName }: { memberName: string }) {
  const entity = SITE_ENTITY || "relic";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("capture");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [vendor, setVendor] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");
  const [selectedPOId, setSelectedPOId] = useState("");
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [error, setError] = useState("");
  const [poItem, setPoItem] = useState<AddToPOItem | null>(null);

  const loadData = useCallback(async () => {
    const [{ data: po }, { data: rec }] = await Promise.all([
      axiom.from("purchase_orders").select("*").in("status", ["pending", "approved"]).order("created_at", { ascending: false }),
      axiom.from("receipts").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setPurchaseOrders((po || []) as PurchaseOrder[]);
    setReceipts((rec || []) as ReceiptRecord[]);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleFile(file: File) {
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setStep("parsing");

    const fd = new FormData();
    fd.append("file", file);
    const up = await authedFetch("/api/receipts/upload", { method: "POST", body: fd });
    const upBody = await up.json().catch(() => ({}));
    if (!up.ok || !upBody.url) {
      setError(upBody.error || "Upload failed.");
      setStep("capture");
      return;
    }
    const publicUrl: string = upBody.url;
    setImageUrl(publicUrl);

    try {
      const res = await authedFetch("/api/parse-receipt", {
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
    const { error: saveErr } = await axiom.from("receipts").insert({
      image_url: imageUrl || null,
      vendor: vendor || null,
      receipt_date: receiptDate || null,
      total,
      line_items: items,
      purchase_order_id: selectedPOId || null,
      notes: notes || null,
      submitted_by: memberName, // the signed-in person
    });
    if (saveErr) {
      setError(saveErr.message || "Couldn't save the receipt. Try again.");
      setStep("review");
      return;
    }
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
    setSelectedPOId("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-background">
      <ReceiptsHeader />
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-heading font-bold">Receipts</h1>
          <p className="text-muted text-sm">Saving as <span className="text-foreground font-medium">{memberName}</span></p>
        </div>

      {step === "capture" && (
        <div>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <button onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-border hover:border-accent transition-colors p-12 flex flex-col items-center gap-4 text-muted hover:text-accent">
            <Camera size={52} strokeWidth={1.2} />
            <div className="text-center">
              <p className="font-medium text-foreground text-lg">Photograph a Receipt</p>
              <p className="text-sm mt-1">Tap to open camera · or choose from library</p>
            </div>
          </button>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>
      )}

      {step === "parsing" && (
        <div className="flex flex-col items-center gap-5 py-16">
          {imagePreview && (
            <div className="relative w-36 h-36">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Receipt" className="w-full h-full object-cover rounded border border-border" />
              <div className="absolute inset-0 bg-background/70 rounded flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-accent" />
              </div>
            </div>
          )}
          <p className="text-muted text-sm">Analyzing receipt…</p>
        </div>
      )}

      {(step === "review" || step === "saving") && (
        <div className="space-y-5">
          {imagePreview && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={imagePreview} alt="Receipt" className="w-full max-h-52 object-contain border border-border bg-card rounded" />
          )}
          {error && (
            <p className="text-sm text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-2">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Vendor</label>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor name"
                className="w-full bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Date</label>
              <DateField
                value={receiptDate}
                onChange={setReceiptDate}
                inputClassName="w-full bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent hover:border-accent transition-colors text-left"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs uppercase tracking-wider text-muted">Line Items</label>
              <button onClick={() => setItems([...items, { description: "", qty: 1, unit_price: 0, total: 0 }])}
                className="text-accent text-xs flex items-center gap-1"><Plus size={12} /> Add</button>
            </div>
            <div className="space-y-2">
              {items.length === 0 && (
                <button onClick={() => setItems([{ description: "", qty: 1, unit_price: 0, total: 0 }])}
                  className="w-full border border-dashed border-border py-4 text-sm text-muted hover:border-accent hover:text-accent transition-colors">
                  + Add line item
                </button>
              )}
              {items.map((item, i) => (
                <div key={i} className="bg-card border border-border p-2 space-y-2">
                  <div className="flex gap-2 items-center">
                    <input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)}
                      placeholder="Description"
                      className="flex-1 bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent min-w-0" />
                    <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="text-muted hover:text-red-500 shrink-0"><X size={14} /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5">Qty</label>
                      <input type="number" value={item.qty || ""} onChange={(e) => updateItem(i, "qty", Number(e.target.value))}
                        className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent text-right" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5">Unit Price</label>
                      <input type="number" value={item.unit_price || ""} onChange={(e) => updateItem(i, "unit_price", Number(e.target.value))}
                        className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent text-right" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5">Total</label>
                      <p className="text-sm font-mono text-right pt-1.5">{money(item.total)}</p>
                    </div>
                  </div>
                  <button onClick={() => setPoItem({ description: item.description, qty: item.qty, unit_price: item.unit_price, vendor_name: vendor })}
                    className="flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors">
                    <ShoppingCart size={12} /> Add to P.O.
                  </button>
                </div>
              ))}
            </div>
            {items.length > 0 && (
              <div className="mt-2 space-y-1 text-sm border-t border-border pt-2">
                <div className="flex justify-between text-muted"><span>Subtotal</span><span className="font-mono">{money(subtotal)}</span></div>
                <div className="flex justify-between text-muted items-center gap-4">
                  <span className="shrink-0">Tax</span>
                  <input type="number" value={tax || ""} onChange={(e) => setTax(Number(e.target.value))} placeholder="0.00"
                    className="w-24 bg-card border border-border px-2 py-1 text-sm text-right text-foreground focus:outline-none focus:border-accent" />
                </div>
                <div className="flex justify-between font-medium"><span>Total</span><span className="font-mono">{money(total)}</span></div>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Link to Purchase Order</label>
            <select value={selectedPOId} onChange={(e) => setSelectedPOId(e.target.value)}
              className="w-full bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent">
              <option value="">— No P.O. —</option>
              {purchaseOrders.map((p) => <option key={p.id} value={p.id}>{p.po_number} — {p.vendor_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional notes…"
              className="w-full bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent min-h-[60px] resize-y" />
          </div>
          <div className="flex gap-3 pb-8">
            <Button onClick={save} disabled={step === "saving"} className="flex-1">{step === "saving" ? "Saving…" : "Save Receipt"}</Button>
            <Button variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}

      {step === "saved" && (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
            <Check size={32} className="text-accent" />
          </div>
          <h2 className="text-xl font-heading font-bold">Receipt Saved</h2>
          {selectedPOId && (
            <p className="text-muted text-sm">Linked to {purchaseOrders.find((p) => p.id === selectedPOId)?.po_number}.</p>
          )}
          <Button onClick={reset} className="mt-2">Add Another</Button>
        </div>
      )}

      {step === "capture" && receipts.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs uppercase tracking-wider text-muted mb-3">Recent Receipts</h2>
          <div className="space-y-2">
            {receipts.map((r) => {
              const linkedPO = purchaseOrders.find((p) => p.id === r.purchase_order_id);
              return (
                <div key={r.id} className="bg-card border border-border p-3 flex gap-3 items-start">
                  {r.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.image_url} alt="" className="w-12 h-12 object-cover rounded border border-border shrink-0" />
                  ) : (
                    <div className="w-12 h-12 bg-border/30 rounded border border-border shrink-0 flex items-center justify-center">
                      <Camera size={16} className="text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.vendor || "Unknown vendor"}</p>
                    <p className="text-xs text-muted">
                      {r.receipt_date ? new Date(r.receipt_date + "T12:00:00").toLocaleDateString() : new Date(r.created_at).toLocaleDateString()}
                    </p>
                    {linkedPO && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-400">
                        <Package size={10} />
                        <span className="font-mono">{linkedPO.po_number}</span>
                      </div>
                    )}
                    {r.line_items?.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {r.line_items.map((li, li_i) => (
                          <div key={li_i} className="flex items-center gap-2 text-xs">
                            <span className="flex-1 text-muted truncate">{li.description}</span>
                            <span className="font-mono text-muted shrink-0">{money(li.total)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!linkedPO && (
                      <div className="mt-2">
                        <select className="text-[10px] bg-card border border-border px-2 py-1 text-muted focus:outline-none focus:border-accent w-full"
                          defaultValue=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const poId = e.target.value;
                            axiom.from("receipts").update({ purchase_order_id: poId }).eq("id", r.id).then(({ error: linkErr }) => {
                              if (!linkErr) setReceipts((prev) => prev.map((x) => x.id === r.id ? { ...x, purchase_order_id: poId } : x));
                            });
                          }}>
                          <option value="">Link to P.O.…</option>
                          {purchaseOrders.map((p) => <option key={p.id} value={p.id}>{p.po_number} — {p.vendor_name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <p className="text-sm font-mono">{money(r.total || 0)}</p>
                    <button onClick={async () => {
                      if (!confirm("Delete this receipt?")) return;
                      const { error: delErr } = await axiom.from("receipts").delete().eq("id", r.id);
                      if (!delErr) setReceipts((prev) => prev.filter((x) => x.id !== r.id));
                    }} className="text-muted hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {poItem && <AddToPOModal item={poItem} entity={entity} onClose={() => setPoItem(null)} onAdded={() => { setPoItem(null); loadData(); }} />}
      </div>
    </div>
  );
}
