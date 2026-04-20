"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { PurchaseOrder, InventoryItem } from "@/types/axiom";
import { Camera, ExternalLink, Trash2, ShoppingCart, Search, X, RefreshCw, Package, ArrowLeft, Warehouse } from "lucide-react";
import Link from "next/link";
import AddToPOModal, { AddToPOItem } from "@/components/ui/AddToPOModal";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";

interface LineItem {
  description: string;
  qty: number;
  unit_price: number;
  total: number;
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
  purchase_order_id?: string;
  notes?: string;
  submitted_by?: string;
  created_at: string;
}

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

export default function ReceiptsPage() {
  const { userEmail } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [search, setSearch] = useState("");
  const [filterPO, setFilterPO] = useState("");
  const [priceUpdating, setPriceUpdating] = useState<Record<string, string>>({});
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receiveMsg, setReceiveMsg] = useState<Record<string, string>>({});
  const [poItem, setPoItem] = useState<AddToPOItem | null>(null);

  const load = useCallback(async () => {
    const [{ data: rec }, { data: poData }] = await Promise.all([
      axiom.from("receipts").select("*").order("created_at", { ascending: false }),
      axiom.from("purchase_orders").select("*").order("created_at", { ascending: false }),
    ]);
    if (rec) setReceipts(rec as ReceiptRecord[]);
    if (poData) setPos(poData as PurchaseOrder[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function linkPO(r: ReceiptRecord, poId: string) {
    await axiom.from("receipts").update({ purchase_order_id: poId || null }).eq("id", r.id);
    setReceipts((prev) => prev.map((x) => x.id === r.id ? { ...x, purchase_order_id: poId } : x));
  }

  async function receiveIntoInventory(r: ReceiptRecord) {
    const po = pos.find((p) => p.id === r.purchase_order_id);
    if (!po || !po.line_items || po.line_items.length === 0) return;
    setReceivingId(r.id);

    try {
      // Calculate tax/delivery from receipt: total minus line items subtotal
      const receiptSubtotal = (r.line_items || []).reduce((s, li) => s + (Number(li.total) || 0), 0);
      const extras = Math.max(0, (r.total || 0) - receiptSubtotal);

      // PO subtotal for proportional distribution
      const poSubtotal = po.line_items.reduce((s, li) => s + (li.quantity * li.unit_price), 0);

      // Get all inventory items for matching
      const { data: invItems } = await axiom.from("inventory_items").select("*").eq("active", true);
      const allInv = (invItems || []) as InventoryItem[];

      let received = 0;
      for (const li of po.line_items) {
        // Landed unit price: original + proportional share of tax/delivery from receipt
        const lineTotal = li.quantity * li.unit_price;
        const lineShare = poSubtotal > 0 ? (lineTotal / poSubtotal) * extras : 0;
        const landedUnitPrice = Math.round(((lineTotal + lineShare) / li.quantity) * 100) / 100;

        // Match by item_number first, then description
        let match = allInv.find((inv) =>
          inv.item_number && li.item_number && inv.item_number === li.item_number
        );
        if (!match) {
          match = allInv.find((inv) =>
            inv.description.toLowerCase() === li.description.toLowerCase()
          );
        }

        if (match) {
          // Create "in" transaction
          await axiom.from("inventory_transactions").insert({
            inventory_item_id: match.id,
            type: "in",
            quantity: li.quantity,
            unit_cost: landedUnitPrice,
            notes: `Received from ${po.po_number}${extras > 0 ? ` (landed cost incl. $${extras.toFixed(2)} tax/delivery from receipt)` : ""}`,
            date: new Date().toISOString().split("T")[0],
            created_by: userEmail,
          });

          // Weighted average cost
          const oldQty = match.quantity_on_hand || 0;
          const oldCost = match.unit_cost || 0;
          const newQty = oldQty + li.quantity;
          const avgCost = newQty > 0 ? ((oldQty * oldCost) + (li.quantity * landedUnitPrice)) / newQty : landedUnitPrice;

          await axiom.from("inventory_items").update({
            quantity_on_hand: newQty,
            unit_cost: Math.round(avgCost * 100) / 100,
            updated_at: new Date().toISOString(),
          }).eq("id", match.id);

          received++;
        } else {
          // Create new inventory item with landed cost
          const { data: newItem } = await axiom.from("inventory_items").insert({
            vendor_id: po.vendor_id || null,
            item_number: li.item_number || null,
            description: li.description,
            unit: li.unit,
            unit_cost: landedUnitPrice,
            quantity_on_hand: li.quantity,
          }).select().single();

          if (newItem) {
            await axiom.from("inventory_transactions").insert({
              inventory_item_id: newItem.id,
              type: "in",
              quantity: li.quantity,
              unit_cost: landedUnitPrice,
              notes: `Received from ${po.po_number}${extras > 0 ? ` (landed cost incl. $${extras.toFixed(2)} tax/delivery from receipt)` : ""}`,
              date: new Date().toISOString().split("T")[0],
              created_by: userEmail,
            });
            received++;
          }
        }
      }

      await logActivity({
        action: "updated",
        entity: "inventory",
        entity_id: po.id,
        label: `Received PO ${po.po_number} into inventory via receipt (${received} items${extras > 0 ? `, +$${extras.toFixed(2)} landed` : ""})`,
        user_name: userEmail,
      });

      setReceiveMsg((prev) => ({ ...prev, [r.id]: `Received ${received} of ${po.line_items.length} items.${extras > 0 ? ` Tax/delivery $${extras.toFixed(2)} distributed.` : ""}` }));
    } catch (err) {
      console.error("receive error:", err);
      setReceiveMsg((prev) => ({ ...prev, [r.id]: "Error receiving inventory." }));
    }
    setReceivingId(null);
  }

  async function updateInventoryPrices(r: ReceiptRecord) {
    if (!r.line_items || r.line_items.length === 0) return;
    setPriceUpdating((prev) => ({ ...prev, [r.id]: "updating" }));

    try {
      // Calculate landed cost — distribute tax proportionally across line items
      const subtotal = r.line_items.reduce((s, li) => s + (Number(li.total) || 0), 0);
      const tax = (r.total || 0) - subtotal;
      const extras = tax > 0 ? tax : 0;

      const { data: invItems } = await axiom.from("inventory_items").select("*").eq("active", true);
      const allInv = invItems || [];
      let updated = 0;

      for (const li of r.line_items) {
        if (!li.unit_price || li.unit_price <= 0) continue;

        const lineTotal = Number(li.total) || (li.qty * li.unit_price);
        const lineShare = subtotal > 0 ? (lineTotal / subtotal) * extras : 0;
        const landedUnitPrice = li.qty > 0 ? Math.round(((lineTotal + lineShare) / li.qty) * 100) / 100 : li.unit_price;

        const match = allInv.find((inv: { description: string; item_number?: string }) =>
          inv.description.toLowerCase() === li.description.toLowerCase() ||
          (inv.item_number && li.description.toLowerCase().includes(inv.item_number.toLowerCase()))
        );

        if (match) {
          const oldQty = match.quantity_on_hand || 0;
          const oldCost = match.unit_cost || 0;
          const newQty = oldQty + li.qty;
          const avgCost = newQty > 0 ? ((oldQty * oldCost) + (li.qty * landedUnitPrice)) / newQty : landedUnitPrice;

          await axiom.from("inventory_items").update({
            unit_cost: Math.round(avgCost * 100) / 100,
            updated_at: new Date().toISOString(),
          }).eq("id", match.id);
          updated++;
        }
      }

      await logActivity({
        action: "updated",
        entity: "inventory",
        entity_id: r.id,
        label: `Updated ${updated} inventory price${updated !== 1 ? "s" : ""} from receipt — ${r.vendor || "Unknown vendor"}${extras > 0 ? ` (incl. $${extras.toFixed(2)} tax/fees)` : ""}`,
        user_name: userEmail,
      });

      setPriceUpdating((prev) => ({ ...prev, [r.id]: `${updated} updated` }));
    } catch {
      setPriceUpdating((prev) => ({ ...prev, [r.id]: "error" }));
    }
  }

  // Filter: by PO or search
  const openPOs = pos.filter((p) => p.status === "pending" || p.status === "approved");

  const filtered = receipts.filter((r) => {
    if (filterPO === "__none__" && r.purchase_order_id) return false;
    if (filterPO && filterPO !== "__none__" && r.purchase_order_id !== filterPO) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.vendor || "").toLowerCase().includes(q) || (r.submitted_by || "").toLowerCase().includes(q);
    }
    return true;
  });

  const total = filtered.reduce((s, r) => s + (r.total || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/axiom/dashboard" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent transition-colors mb-2">
            <ArrowLeft size={12} /> Back to Axiom
          </Link>
          <h1 className="text-2xl font-heading font-bold">Receipts</h1>
          <p className="text-muted text-sm mt-0.5">{filtered.length} receipt{filtered.length !== 1 ? "s" : ""} · {money(total)} total</p>
        </div>
        <a
          href="/receipts"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-accent text-background px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Camera size={14} />
          Receipt App
          <ExternalLink size={12} className="opacity-60" />
        </a>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor, person…"
            className="w-full bg-card border border-border pl-8 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={filterPO}
          onChange={(e) => setFilterPO(e.target.value)}
          className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent min-w-40"
        >
          <option value="">All Receipts</option>
          <option value="__none__">No P.O. Linked</option>
          {pos.map((p) => <option key={p.id} value={p.id}>{p.po_number} — {p.vendor_name}</option>)}
        </select>
      </div>

      {/* Receipt cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">
          {receipts.length === 0 ? (
            <>
              <Camera size={32} className="mx-auto mb-3 opacity-30" />
              <p>No receipts yet.</p>
              <p className="mt-1 text-xs">Use the <a href="/receipts" target="_blank" className="text-accent underline">Receipt App</a> on your phone to add receipts.</p>
            </>
          ) : "No receipts match your filters."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((r) => {
            const linkedPO = pos.find((p) => p.id === r.purchase_order_id);
            const priceStatus = priceUpdating[r.id];
            const rMsg = receiveMsg[r.id];
            const receiptSubtotal = (r.line_items || []).reduce((s, li) => s + (Number(li.total) || 0), 0);
            const taxDelivery = Math.max(0, (r.total || 0) - receiptSubtotal);

            return (
              <div key={r.id} className="bg-card border border-border flex flex-col">

                {/* Receipt image */}
                {r.image_url ? (
                  <a href={r.image_url} target="_blank" rel="noopener noreferrer" className="block shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.image_url} alt="" className="w-full h-40 object-cover border-b border-border hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <div className="w-full h-40 bg-border/10 border-b border-border flex items-center justify-center shrink-0">
                    <Camera size={28} className="text-muted/40" />
                  </div>
                )}

                {/* Card body */}
                <div className="p-3 flex flex-col gap-2.5 flex-1">

                  {/* Vendor + total */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-snug">{r.vendor || "Unknown vendor"}</p>
                    <p className="text-sm font-mono font-bold text-accent shrink-0">{money(r.total || 0)}</p>
                  </div>

                  {/* Date + submitted by */}
                  <p className="text-xs text-muted">
                    {r.receipt_date ? new Date(r.receipt_date + "T12:00:00").toLocaleDateString() : new Date(r.created_at).toLocaleDateString()}
                    {r.submitted_by && <span className="text-muted/60"> · {r.submitted_by}</span>}
                  </p>

                  {/* Tax/delivery badge */}
                  {taxDelivery > 0 && (
                    <p className="text-[10px] text-muted">Tax/delivery: {money(taxDelivery)}</p>
                  )}

                  {/* Linked PO badge */}
                  {linkedPO && (
                    <div className="flex items-center gap-1.5 text-[10px] text-blue-400 bg-blue-400/10 px-2 py-1">
                      <Package size={10} />
                      <span className="font-mono">{linkedPO.po_number}</span>
                      <span className="text-blue-400/60">· {linkedPO.status}</span>
                    </div>
                  )}

                  {/* Line items */}
                  {r.line_items?.length > 0 && (
                    <div className="space-y-0.5 border-t border-border pt-2">
                      {r.line_items.map((li, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          <span className="flex-1 text-muted truncate">{li.description}</span>
                          <span className="font-mono text-muted shrink-0">{money(li.total)}</span>
                          <button
                            onClick={() => setPoItem({ description: li.description, qty: li.qty, unit_price: li.unit_price, vendor_name: r.vendor })}
                            className="text-muted hover:text-accent transition-colors shrink-0" title="Add to P.O."
                          >
                            <ShoppingCart size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {r.notes && <p className="text-xs text-muted/60 italic">{r.notes}</p>}

                  {/* PO dropdown + actions */}
                  <div className="mt-auto pt-2 border-t border-border space-y-2">
                    <select
                      value={r.purchase_order_id || ""}
                      onChange={(e) => linkPO(r, e.target.value)}
                      className="w-full bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
                    >
                      <option value="">— No P.O. —</option>
                      {openPOs.map((p) => <option key={p.id} value={p.id}>{p.po_number} — {p.vendor_name}</option>)}
                      {/* Also show the currently linked PO if it's not in open list */}
                      {linkedPO && !openPOs.find((p) => p.id === linkedPO.id) && (
                        <option value={linkedPO.id}>{linkedPO.po_number} — {linkedPO.vendor_name}</option>
                      )}
                    </select>

                    {/* Receive into Inventory — when receipt is linked to an approved PO */}
                    {linkedPO && linkedPO.status === "approved" && linkedPO.line_items?.length > 0 && (
                      <button
                        onClick={() => receiveIntoInventory(r)}
                        disabled={receivingId === r.id}
                        className={`w-full flex items-center justify-center gap-1.5 text-[11px] py-1.5 border transition-colors font-medium ${
                          rMsg && !rMsg.startsWith("Error")
                            ? "border-green-500/30 text-green-400"
                            : "border-green-600/40 hover:border-green-500 hover:text-green-400 text-green-500/80 bg-green-500/5"
                        } disabled:opacity-50`}
                      >
                        <Warehouse size={11} />
                        {receivingId === r.id
                          ? "Receiving…"
                          : rMsg
                            ? rMsg.startsWith("Error") ? "Error — retry" : `✓ ${rMsg}`
                            : `Receive PO into Inventory${taxDelivery > 0 ? ` (+${money(taxDelivery)} landed)` : ""}`}
                      </button>
                    )}

                    {/* Update inventory prices (standalone, no PO needed) */}
                    {r.line_items?.length > 0 && (
                      <button
                        onClick={() => updateInventoryPrices(r)}
                        disabled={priceStatus === "updating"}
                        className={`w-full flex items-center justify-center gap-1.5 text-[11px] py-1 border transition-colors ${
                          priceStatus && priceStatus !== "updating"
                            ? "border-green-500/30 text-green-400"
                            : "border-border hover:border-blue-400 hover:text-blue-400 text-muted"
                        } disabled:opacity-50`}
                      >
                        <RefreshCw size={10} className={priceStatus === "updating" ? "animate-spin" : ""} />
                        {priceStatus === "updating"
                          ? "Updating…"
                          : priceStatus === "error"
                            ? "Error — retry"
                            : priceStatus
                              ? `✓ ${priceStatus}`
                              : "Update Inventory Prices"}
                      </button>
                    )}

                    {/* Delete */}
                    <div className="flex justify-end">
                      <button
                        onClick={async () => {
                          if (!confirm("Delete this receipt?")) return;
                          await axiom.from("receipts").delete().eq("id", r.id);
                          setReceipts((prev) => prev.filter((x) => x.id !== r.id));
                        }}
                        className="flex items-center gap-1 text-[11px] text-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {poItem && <AddToPOModal item={poItem} onClose={() => setPoItem(null)} onAdded={() => setPoItem(null)} />}
    </div>
  );
}
