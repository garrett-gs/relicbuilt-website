"use client";

import React, { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { PurchaseOrder, POLineItem, Vendor, CatalogItem } from "@/types/axiom";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import AddressAutocomplete from "@/components/ui/AddressAutocomplete";
import {
  Plus, X, Search, Check, XCircle, RotateCcw, Trash2,
  ChevronDown, ChevronUp, Package, Send, Printer, Pencil, Warehouse,
} from "lucide-react";
import { generatePOHtml } from "@/lib/po-html";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const statusColors = { pending: "#f59e0b", approved: "#22c55e", rejected: "#ef4444" };
const TAX_RATE = 0.07; // 7% Valley, NE sales tax

// ═══════════════════════════════════════════════════════════════
// Main Page — Two Tabs
// ═══════════════════════════════════════════════════════════════

export default function PurchaseOrdersPage() {
  const [tab, setTab] = useState<"orders" | "vendors">("orders");

  return (
    <div>
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setTab("orders")}
          className={cn(
            "px-4 py-2 text-sm transition-colors border-b-2 -mb-px",
            tab === "orders" ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
          )}
        >
          Purchase Orders
        </button>
        <button
          onClick={() => setTab("vendors")}
          className={cn(
            "px-4 py-2 text-sm transition-colors border-b-2 -mb-px",
            tab === "vendors" ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
          )}
        >
          Vendors
        </button>
      </div>

      {tab === "orders" ? <OrdersTab /> : <VendorsTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ORDERS TAB
// ═══════════════════════════════════════════════════════════════

interface SimpleProject { id: string; project_name: string }

function OrdersTab() {
  const { userEmail } = useAuth();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<SimpleProject[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [approveId, setApproveId] = useState<string | null>(null);
  const [approveText, setApproveText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendPO, setSendPO] = useState<PurchaseOrder | null>(null);
  const [printPO, setPrintPO] = useState<PurchaseOrder | null>(null);
  const [editPO, setEditPO] = useState<PurchaseOrder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receiveMsg, setReceiveMsg] = useState("");
  const [receiveModal, setReceiveModal] = useState<PurchaseOrder | null>(null);
  const [receiveTax, setReceiveTax] = useState("");
  const [receiveDelivery, setReceiveDelivery] = useState("");

  const load = useCallback(async () => {
    const [p, v, proj] = await Promise.all([
      axiom.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      axiom.from("vendors").select("*").eq("status", "active").order("name"),
      axiom.from("custom_work").select("id,project_name").in("status", ["new", "in_review", "quoted", "in_progress"]).order("project_name"),
    ]);
    if (p.data) setPos(p.data);
    if (v.data) setVendors(v.data);
    if (proj.data) setProjects(proj.data as SimpleProject[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = pos.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search && !p.vendor_name.toLowerCase().includes(search.toLowerCase()) && !p.item_description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function poTotal(po: PurchaseOrder) {
    if (po.line_items && po.line_items.length > 0) {
      return po.line_items.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
    }
    return (po.quantity || 0) * (po.unit_price || 0);
  }

  const grandTotal = filtered.reduce((s, p) => s + poTotal(p), 0);

  async function createPO(vendorId: string, vendorName: string, lineItems: POLineItem[], notes: string, needByDate: string, deliveryMethod: string, deliveryDate: string, shipToAddress: string, customWorkId?: string) {
    const total = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
    const { data } = await axiom.from("purchase_orders").insert({
      po_number: "PO-TEMP",
      vendor_id: vendorId || null,
      vendor_name: vendorName,
      item_description: lineItems.map((li) => li.description).join(", "),
      quantity: lineItems.length,
      unit_price: total,
      line_items: lineItems,
      notes: notes || null,
      need_by_date: needByDate || null,
      delivery_method: deliveryMethod || null,
      delivery_date: deliveryDate || null,
      ship_to_address: shipToAddress || null,
      custom_work_id: customWorkId || null,
      status: "pending",
    }).select().single();
    if (data) {
      const poNum = `PO-${new Date().getFullYear()}-${String(data.id).slice(0, 4).toUpperCase()}`;
      await axiom.from("purchase_orders").update({ po_number: poNum }).eq("id", data.id);
      await logActivity({ action: "created", entity: "purchase_order", entity_id: data.id, label: `Created PO: ${poNum} — ${vendorName} (${lineItems.length} items, ${money(total)})`, user_name: userEmail });
      load();
      setShowCreate(false);
    }
  }

  async function approvePO(id: string) {
    await axiom.from("purchase_orders").update({ status: "approved", approved_by: userEmail, approved_at: new Date().toISOString() }).eq("id", id);
    const po = pos.find((p) => p.id === id);
    await logActivity({ action: "approved", entity: "purchase_order", entity_id: id, label: `Approved PO: ${po?.po_number}`, user_name: userEmail });
    setApproveId(null);
    setApproveText("");
    load();
  }

  async function rejectPO(id: string) {
    await axiom.from("purchase_orders").update({ status: "rejected" }).eq("id", id);
    load();
  }

  async function resetPO(id: string) {
    await axiom.from("purchase_orders").update({ status: "pending", approved_by: null, approved_at: null }).eq("id", id);
    load();
  }

  async function updatePO(id: string, vendorId: string, vendorName: string, lineItems: POLineItem[], notes: string, needByDate: string, deliveryMethod: string, deliveryDate: string, shipToAddress: string, customWorkId?: string) {
    const total = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
    await axiom.from("purchase_orders").update({
      vendor_id: vendorId || null,
      vendor_name: vendorName,
      item_description: lineItems.map((li) => li.description).join(", "),
      quantity: lineItems.length,
      unit_price: total,
      line_items: lineItems,
      notes: notes || null,
      need_by_date: needByDate || null,
      delivery_method: deliveryMethod || null,
      delivery_date: deliveryDate || null,
      ship_to_address: shipToAddress || null,
      custom_work_id: customWorkId || null,
    }).eq("id", id);
    await logActivity({ action: "updated", entity: "purchase_order", entity_id: id, label: `Updated PO: ${pos.find((p) => p.id === id)?.po_number} — ${vendorName}`, user_name: userEmail });
    setEditPO(null);
    load();
  }

  async function deletePO(id: string) {
    await axiom.from("purchase_orders").delete().eq("id", id);
    load();
  }

  async function receiveIntoInventory(po: PurchaseOrder, taxAmount: number, deliveryAmount: number) {
    if (!po.line_items || po.line_items.length === 0) return;
    setReceivingId(po.id);
    setReceiveMsg("");

    try {
      // Calculate landed cost — distribute tax + delivery proportionally
      const subtotal = po.line_items.reduce((s, li) => s + (li.quantity * li.unit_price), 0);
      const extras = taxAmount + deliveryAmount;

      // Get all inventory items for matching
      const { data: invItems } = await axiom.from("inventory_items").select("*").eq("active", true);
      const allInv = invItems || [];

      let received = 0;
      for (const li of po.line_items) {
        // Landed unit price: original + proportional share of tax/delivery
        const lineTotal = li.quantity * li.unit_price;
        const lineShare = subtotal > 0 ? (lineTotal / subtotal) * extras : 0;
        const landedUnitPrice = Math.round(((lineTotal + lineShare) / li.quantity) * 100) / 100;

        // Match by item_number + description, or just description
        let match = allInv.find((inv: { item_number?: string; description: string }) =>
          inv.item_number && li.item_number && inv.item_number === li.item_number
        );
        if (!match) {
          match = allInv.find((inv: { description: string }) =>
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
            notes: `Received from ${po.po_number}${extras > 0 ? ` (landed cost incl. $${extras.toFixed(2)} tax/delivery)` : ""}`,
            date: new Date().toISOString().split("T")[0],
            created_by: userEmail,
          });

          // Weighted average cost using landed price
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
          // Create new inventory item + transaction with landed cost
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
              notes: `Received from ${po.po_number}${extras > 0 ? ` (landed cost incl. $${extras.toFixed(2)} tax/delivery)` : ""}`,
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
        label: `Received PO ${po.po_number} into inventory (${received} items${extras > 0 ? `, +$${extras.toFixed(2)} landed` : ""})`,
        user_name: userEmail,
      });

      setReceiveMsg(`Received ${received} of ${po.line_items.length} items into inventory.${extras > 0 ? ` Tax/delivery $${extras.toFixed(2)} distributed.` : ""}`);
    } catch (err) {
      console.error("receive error:", err);
      setReceiveMsg("Error receiving inventory.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold">Purchase Orders</h1>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} className="mr-1" /> New P.O.</Button>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor or item..." className="w-full bg-card border border-border pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent">
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* PO List */}
      <div className="space-y-3">
        {filtered.map((po) => {
          const total = poTotal(po);
          const hasLines = po.line_items && po.line_items.length > 0;
          const hasDelivery = !!(po.delivery_method || po.delivery_date);
          const hasExpandable = hasLines || hasDelivery;
          const expanded = expandedId === po.id;
          return (
            <div key={po.id} className="bg-card border border-border">
              <div className="p-4 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-sm font-bold">{po.po_number}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: statusColors[po.status] + "20", color: statusColors[po.status] }}>
                      {po.status}
                    </span>
                    {hasLines && (
                      <span className="text-xs text-muted">{po.line_items.length} item{po.line_items.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                  <p className="text-sm"><span className="text-muted">Vendor:</span> {po.vendor_name}</p>
                  <div className="flex gap-6 mt-2 text-sm">
                    <span className="font-bold">Subtotal: {money(total)}</span>
                    <span className="text-muted">Est. Tax: {money(total * TAX_RATE)}</span>
                    <span className="font-bold text-accent">Est. Total: {money(total + total * TAX_RATE)}</span>
                    {po.need_by_date && <span className="text-muted">Need by: {po.need_by_date}</span>}
                    {po.custom_work_id && (() => {
                      const proj = projects.find((p) => p.id === po.custom_work_id);
                      return proj ? <span className="text-accent text-xs">Project: {proj.project_name}</span> : null;
                    })()}
                  </div>
                  {po.approved_by && <p className="text-xs text-muted mt-1">Approved by {po.approved_by} on {new Date(po.approved_at!).toLocaleDateString()}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0 items-center">
                  <button onClick={() => setPrintPO(po)} className="text-muted hover:text-foreground" title="Print"><Printer size={14} /></button>
                  <button onClick={() => setSendPO(po)} className="text-muted hover:text-accent" title="Send"><Send size={14} /></button>
                  <button onClick={() => setEditPO(po)} className="text-muted hover:text-foreground" title="Edit"><Pencil size={14} /></button>
                  {hasExpandable && (
                    <button onClick={() => setExpandedId(expanded ? null : po.id)} className="text-muted hover:text-foreground">
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                  {po.status === "pending" && (
                    <>
                      <button onClick={() => setApproveId(po.id)} className="text-green-500 hover:text-green-400" title="Approve"><Check size={16} /></button>
                      <button onClick={() => rejectPO(po.id)} className="text-red-500 hover:text-red-400" title="Reject"><XCircle size={16} /></button>
                    </>
                  )}
                  {po.status === "approved" && po.line_items && po.line_items.length > 0 && (
                    <button
                      onClick={() => { setReceiveModal(po); setReceiveTax(""); setReceiveDelivery(""); }}
                      disabled={receivingId === po.id}
                      className="text-green-500 hover:text-green-400 disabled:opacity-50"
                      title="Receive into Inventory"
                    >
                      <Warehouse size={14} />
                    </button>
                  )}
                  {po.status !== "pending" && (
                    <button onClick={() => resetPO(po.id)} className="text-muted hover:text-foreground" title="Reset"><RotateCcw size={14} /></button>
                  )}
                  <button onClick={() => setDeleteId(po.id)} className="text-muted hover:text-red-500 ml-2" title="Delete"><X size={14} /></button>
                </div>
              </div>
              {/* Expanded line items */}
              {expanded && hasLines && (
                <div className="border-t border-border px-4 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted">
                        <th className="pb-2 pr-4">Item #</th>
                        <th className="pb-2 pr-4">Description</th>
                        <th className="pb-2 pr-4 text-right">Qty</th>
                        <th className="pb-2 pr-4 text-right">Unit Price</th>
                        <th className="pb-2 pr-4">Unit</th>
                        <th className="pb-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.line_items.map((li, i) => (
                        <tr key={i} className="border-t border-border/30">
                          <td className="py-1.5 pr-4 font-mono text-muted">{li.item_number || "—"}</td>
                          <td className="py-1.5 pr-4">{li.description}</td>
                          <td className="py-1.5 pr-4 text-right font-mono">{li.quantity}</td>
                          <td className="py-1.5 pr-4 text-right font-mono">{money(li.unit_price)}</td>
                          <td className="py-1.5 pr-4 text-muted">{li.unit}</td>
                          <td className="py-1.5 text-right font-mono font-bold">{money(li.quantity * li.unit_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td colSpan={5} className="py-1.5 text-right text-xs uppercase tracking-wider text-muted">Subtotal</td>
                        <td className="py-1.5 text-right font-mono">{money(total)}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="py-1.5 text-right text-xs uppercase tracking-wider text-muted">Est. Tax (7%)</td>
                        <td className="py-1.5 text-right font-mono text-muted">{money(total * TAX_RATE)}</td>
                      </tr>
                      <tr className="border-t border-border">
                        <td colSpan={5} className="py-2 text-right font-bold text-xs uppercase tracking-wider text-muted">Est. Total</td>
                        <td className="py-2 text-right font-mono font-bold">{money(total + total * TAX_RATE)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {/* Show single-item fallback for old POs without line_items */}
              {!hasLines && po.item_description && (
                <div className="border-t border-border px-4 py-2 text-sm text-muted">
                  {po.item_description} — Qty: {po.quantity} × {money(po.unit_price)}
                </div>
              )}
              {/* Delivery info */}
              {expanded && (po.delivery_method || po.delivery_date) && (
                <div className="border-t border-border px-4 py-3 flex flex-wrap gap-6 text-sm">
                  {po.delivery_method && (
                    <div>
                      <span className="text-xs uppercase tracking-wider text-muted mr-2">Delivery</span>
                      <span className="font-medium capitalize">
                        {po.delivery_method === "will_call" ? "Will Call" : po.delivery_method === "ship" ? "Ship to Address" : "Pick Up"}
                      </span>
                    </div>
                  )}
                  {po.delivery_date && (
                    <div>
                      <span className="text-xs uppercase tracking-wider text-muted mr-2">Delivery Date</span>
                      <span className="font-medium">{new Date(po.delivery_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                  )}
                  {po.delivery_method === "ship" && po.ship_to_address && (
                    <div>
                      <span className="text-xs uppercase tracking-wider text-muted mr-2">Ship To</span>
                      <span className="font-medium whitespace-pre-line">{po.ship_to_address}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* Receive confirmation */}
        {receiveMsg && (
          <div className="bg-green-500/10 border border-green-500/30 px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-green-400 flex items-center gap-2"><Warehouse size={14} /> {receiveMsg}</p>
            <button onClick={() => { setReceivingId(null); setReceiveMsg(""); }} className="text-muted hover:text-foreground"><X size={14} /></button>
          </div>
        )}

        {filtered.length === 0 && <p className="text-center py-8 text-muted text-sm">No purchase orders found</p>}
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 text-right text-sm flex items-center justify-end gap-4">
          <span><span className="text-muted">Subtotal:</span> <span className="font-mono">{money(grandTotal)}</span></span>
          <span><span className="text-muted">Est. Tax:</span> <span className="font-mono text-muted">{money(grandTotal * TAX_RATE)}</span></span>
          <span><span className="text-muted">Est. Total:</span> <span className="font-mono font-bold">{money(grandTotal + grandTotal * TAX_RATE)}</span></span>
        </div>
      )}

      {/* Approve confirmation */}
      {approveId && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setApproveId(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-background border border-border p-6 z-50">
            <h2 className="text-lg font-heading font-bold mb-4">Approve P.O.</h2>
            <p className="text-sm text-muted mb-3">Type &quot;I approve this&quot; to confirm:</p>
            <input value={approveText} onChange={(e) => setApproveText(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent mb-4" />
            <div className="flex gap-3">
              <Button onClick={() => approvePO(approveId)} disabled={approveText.toLowerCase() !== "i approve this"} size="sm">Approve</Button>
              <Button variant="outline" size="sm" onClick={() => { setApproveId(null); setApproveText(""); }}>Cancel</Button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => { setDeleteId(null); setDeleteText(""); }} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-background border border-border p-6 z-50">
            <h2 className="text-lg font-heading font-bold mb-2 text-red-500">Delete P.O.</h2>
            <p className="text-sm text-muted mb-3">This action cannot be undone. Type &quot;Delete this item&quot; to confirm:</p>
            <input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent mb-4" placeholder="Delete this item" />
            <div className="flex gap-3">
              <button
                onClick={() => { deletePO(deleteId); setDeleteId(null); setDeleteText(""); }}
                disabled={deleteText.toLowerCase() !== "delete this item"}
                className={cn("px-4 py-2 text-sm font-medium uppercase tracking-wider transition-all", deleteText.toLowerCase() === "delete this item" ? "bg-red-500 text-white hover:bg-red-600" : "bg-card text-muted cursor-not-allowed")}
              >
                Delete
              </button>
              <Button variant="outline" size="sm" onClick={() => { setDeleteId(null); setDeleteText(""); }}>Cancel</Button>
            </div>
          </div>
        </>
      )}

      {/* Create PO modal */}
      {showCreate && (
        <CreatePOModal
          vendors={vendors}
          projects={projects}
          onSubmit={createPO}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Send PO modal */}
      {sendPO && (
        <SendPOModal
          po={sendPO}
          vendorEmail={vendors.find((v) => v.id === sendPO.vendor_id)?.email || ""}
          onClose={() => setSendPO(null)}
          onSent={() => { setSendPO(null); load(); }}
          userEmail={userEmail}
        />
      )}

      {/* Print PO view */}
      {printPO && (
        <PrintPOView po={printPO} onClose={() => setPrintPO(null)} />
      )}

      {/* Edit PO modal */}
      {editPO && (
        <EditPOModal
          po={editPO}
          vendors={vendors}
          projects={projects}
          onSubmit={(vendorId, vendorName, lineItems, notes, needByDate, deliveryMethod, deliveryDate, shipToAddress, customWorkId) =>
            updatePO(editPO.id, vendorId, vendorName, lineItems, notes, needByDate, deliveryMethod, deliveryDate, shipToAddress, customWorkId)
          }
          onClose={() => setEditPO(null)}
        />
      )}

      {/* Receive into Inventory modal — enter tax + delivery for landed cost */}
      {receiveModal && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setReceiveModal(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border w-full max-w-md p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-heading font-bold mb-1">Receive into Inventory</h2>
              <p className="text-sm text-muted mb-4">{receiveModal.po_number} — {receiveModal.vendor_name}</p>

              <div className="space-y-3 mb-4">
                <div className="bg-background border border-border p-3 text-sm">
                  <p className="text-muted text-xs uppercase tracking-wider mb-1">Line Items Subtotal</p>
                  <p className="font-mono font-bold">{money(receiveModal.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0))}</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted block mb-1">Tax Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={receiveTax}
                    onChange={(e) => setReceiveTax(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted block mb-1">Delivery / Shipping Fee</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={receiveDelivery}
                    onChange={(e) => setReceiveDelivery(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent font-mono"
                  />
                </div>
                {(Number(receiveTax) > 0 || Number(receiveDelivery) > 0) && (
                  <p className="text-xs text-muted">Tax + delivery will be distributed proportionally across all line items (landed cost).</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    const po = receiveModal;
                    setReceiveModal(null);
                    await receiveIntoInventory(po, Number(receiveTax) || 0, Number(receiveDelivery) || 0);
                  }}
                  disabled={receivingId === receiveModal.id}
                  className="flex-1 bg-green-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  {receivingId === receiveModal.id ? "Receiving…" : "Receive"}
                </button>
                <button onClick={() => setReceiveModal(null)} className="flex-1 border border-border px-4 py-2.5 text-sm text-muted hover:text-foreground">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CREATE PO MODAL — with vendor selection + catalog auto-populate
// ═══════════════════════════════════════════════════════════════

function CreatePOModal({ vendors, projects, onSubmit, onClose }: {
  vendors: Vendor[];
  projects: SimpleProject[];
  onSubmit: (vendorId: string, vendorName: string, lineItems: POLineItem[], notes: string, needByDate: string, deliveryMethod: string, deliveryDate: string, shipToAddress: string, customWorkId?: string) => void;
  onClose: () => void;
}) {
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [needByDate, setNeedByDate] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [shipToAddress, setShipToAddress] = useState("");
  const [projectId, setProjectId] = useState("");

  // Load catalog when vendor changes
  useEffect(() => {
    if (!vendorId) { setCatalog([]); return; }
    axiom.from("vendor_catalog").select("*").eq("vendor_id", vendorId).eq("active", true).order("description").then(({ data }) => {
      if (data) setCatalog(data);
    });
    const v = vendors.find((v) => v.id === vendorId);
    if (v) setVendorName(v.name);
  }, [vendorId, vendors]);

  function addFromCatalog(item: CatalogItem) {
    // Check if already in line items
    const existing = lineItems.findIndex((li) => li.item_number === item.item_number && li.description === item.description);
    if (existing >= 0) {
      const updated = [...lineItems];
      updated[existing].quantity += 1;
      setLineItems(updated);
      return;
    }
    setLineItems([...lineItems, {
      item_number: item.item_number || "",
      description: item.description,
      quantity: 1,
      unit_price: item.unit_price,
      unit: item.unit,
    }]);
  }

  function addBlankLine() {
    setLineItems([...lineItems, { item_number: "", description: "", quantity: 1, unit_price: 0, unit: "ea" }]);
  }

  function updateLine(i: number, field: keyof POLineItem, value: string | number) {
    const updated = [...lineItems];
    (updated[i] as unknown as Record<string, string | number>)[field] = value;
    setLineItems(updated);
  }

  function removeLine(i: number) {
    setLineItems(lineItems.filter((_, idx) => idx !== i));
  }

  const total = lineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);

  const filteredCatalog = catalog.filter((c) =>
    !catalogSearch ||
    c.description.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    c.item_number?.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed top-4 bottom-4 right-4 left-4 md:left-[15%] z-50 bg-background border border-border overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-heading font-bold">New Purchase Order</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={20} /></button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: PO form */}
            <div className="space-y-5">
              {/* Vendor selection */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Vendor *</label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
                >
                  <option value="">Select a vendor...</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                {vendors.length === 0 && (
                  <p className="text-xs text-muted mt-1">No vendors yet. Add one in the Vendors tab first.</p>
                )}
              </div>

              {/* Project */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Project (for inventory allocation)</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
                >
                  <option value="">None — general purchase</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>
              </div>

              {/* Line items table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-wider text-muted">Line Items</label>
                  <button onClick={addBlankLine} className="text-accent text-xs flex items-center gap-1"><Plus size={12} /> Add Manual Item</button>
                </div>
                {lineItems.length === 0 ? (
                  <p className="text-muted text-sm bg-card border border-border p-4">
                    {vendorId ? "Select items from the catalog on the right, or add manually." : "Select a vendor to load their catalog."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {lineItems.map((li, i) => (
                      <div key={i} className="bg-card border border-border p-3">
                        <div className="grid grid-cols-[80px_1fr_60px_90px_60px_28px] gap-2 items-center">
                          <input value={li.item_number || ""} onChange={(e) => updateLine(i, "item_number", e.target.value)} placeholder="Item #" className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent font-mono" />
                          <input value={li.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Description" className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent" />
                          <input type="number" value={li.quantity || ""} onChange={(e) => updateLine(i, "quantity", Number(e.target.value))} placeholder="Qty" className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent text-right" />
                          <input type="number" value={li.unit_price || ""} onChange={(e) => updateLine(i, "unit_price", Number(e.target.value))} placeholder="Price" className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent text-right" />
                          <input value={li.unit} onChange={(e) => updateLine(i, "unit", e.target.value)} className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent" />
                          <button onClick={() => removeLine(i)} className="text-muted hover:text-red-500"><Trash2 size={12} /></button>
                        </div>
                        <div className="text-right mt-1">
                          <span className="text-xs font-mono text-muted">{money((li.quantity || 0) * (li.unit_price || 0))}</span>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-border space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">Subtotal</span>
                        <span className="font-mono">{money(total)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">Est. Tax (7%)</span>
                        <span className="font-mono text-muted">{money(total * TAX_RATE)}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-1 border-t border-border">
                        <span className="font-bold">Est. Total</span>
                        <span className="text-lg font-mono font-bold">{money(total + total * TAX_RATE)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Delivery */}
              <div className="bg-card border border-border p-4 space-y-4">
                <h3 className="text-xs uppercase tracking-wider text-muted">Delivery</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Method</label>
                    <select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-accent">
                      <option value="">Select...</option>
                      <option value="pickup">Pick Up</option>
                      <option value="will_call">Will Call</option>
                      <option value="ship">Ship to Address</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Delivery Date</label>
                    <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-accent" />
                  </div>
                </div>
                {deliveryMethod === "ship" && (
                  <div>
                    <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Ship To Address</label>
                    <AddressAutocomplete value={shipToAddress} onChange={setShipToAddress} onSelect={(r) => setShipToAddress(r.formatted)} className="w-full bg-background border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Need By</label>
                  <input type="date" value={needByDate} onChange={(e) => setNeedByDate(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[80px] resize-y" />
              </div>

              <div className="flex gap-3">
                <Button onClick={() => onSubmit(vendorId, vendorName, lineItems, notes, needByDate, deliveryMethod, deliveryDate, shipToAddress, projectId)} disabled={!vendorName || lineItems.length === 0}>Create P.O.</Button>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
              </div>
            </div>

            {/* Right: Vendor catalog */}
            <div>
              {vendorId ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs uppercase tracking-wider text-muted">
                      <Package size={12} className="inline mr-1" />
                      {vendorName} Catalog ({catalog.length} items)
                    </h3>
                  </div>
                  {catalog.length > 0 && (
                    <div className="relative mb-3">
                      <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      <input value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Search catalog..." className="w-full bg-card border border-border pl-8 pr-4 py-2 text-xs text-foreground focus:outline-none focus:border-accent" />
                    </div>
                  )}
                  {catalog.length === 0 ? (
                    <p className="text-muted text-sm bg-card border border-border p-4">No items in this vendor&apos;s catalog yet. Add items in the Vendors tab.</p>
                  ) : (
                    <div className="space-y-1 max-h-[500px] overflow-y-auto">
                      {filteredCatalog.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => addFromCatalog(item)}
                          className="w-full text-left bg-card border border-border p-3 hover:border-accent/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              {item.item_number && <span className="text-xs font-mono text-muted mr-2">{item.item_number}</span>}
                              <span className="text-sm">{item.description}</span>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <span className="text-sm font-mono">{money(item.unit_price)}</span>
                              <span className="text-xs text-muted ml-1">/{item.unit}</span>
                            </div>
                          </div>
                          {item.category && <span className="text-[10px] text-muted">{item.category}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted text-sm">
                  Select a vendor to view their material catalog
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// EDIT PO MODAL
// ═══════════════════════════════════════════════════════════════

function EditPOModal({ po, vendors, projects, onSubmit, onClose }: {
  po: PurchaseOrder;
  vendors: Vendor[];
  projects: SimpleProject[];
  onSubmit: (vendorId: string, vendorName: string, lineItems: POLineItem[], notes: string, needByDate: string, deliveryMethod: string, deliveryDate: string, shipToAddress: string, customWorkId?: string) => void;
  onClose: () => void;
}) {
  const [vendorId, setVendorId] = useState(po.vendor_id || "");
  const [vendorName, setVendorName] = useState(po.vendor_name || "");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lineItems, setLineItems] = useState<POLineItem[]>(po.line_items || []);
  const [notes, setNotes] = useState(po.notes || "");
  const [needByDate, setNeedByDate] = useState(po.need_by_date || "");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState(po.delivery_method || "");
  const [deliveryDate, setDeliveryDate] = useState(po.delivery_date || "");
  const [shipToAddress, setShipToAddress] = useState(po.ship_to_address || "");
  const [projectId, setProjectId] = useState(po.custom_work_id || "");

  useEffect(() => {
    if (!vendorId) { setCatalog([]); return; }
    axiom.from("vendor_catalog").select("*").eq("vendor_id", vendorId).eq("active", true).order("description").then(({ data }) => {
      if (data) setCatalog(data);
    });
    const v = vendors.find((v) => v.id === vendorId);
    if (v) setVendorName(v.name);
  }, [vendorId, vendors]);

  function addFromCatalog(item: CatalogItem) {
    const existing = lineItems.findIndex((li) => li.item_number === item.item_number && li.description === item.description);
    if (existing >= 0) {
      const updated = [...lineItems];
      updated[existing].quantity += 1;
      setLineItems(updated);
      return;
    }
    setLineItems([...lineItems, { item_number: item.item_number || "", description: item.description, quantity: 1, unit_price: item.unit_price, unit: item.unit }]);
  }

  function addBlankLine() {
    setLineItems([...lineItems, { item_number: "", description: "", quantity: 1, unit_price: 0, unit: "ea" }]);
  }

  function updateLine(i: number, field: keyof POLineItem, value: string | number) {
    const updated = [...lineItems];
    (updated[i] as unknown as Record<string, string | number>)[field] = value;
    setLineItems(updated);
  }

  function removeLine(i: number) {
    setLineItems(lineItems.filter((_, idx) => idx !== i));
  }

  const total = lineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const filteredCatalog = catalog.filter((c) => !catalogSearch || c.description.toLowerCase().includes(catalogSearch.toLowerCase()) || c.item_number?.toLowerCase().includes(catalogSearch.toLowerCase()));

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed top-4 bottom-4 right-4 left-4 md:left-[15%] z-50 bg-background border border-border overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-heading font-bold">Edit Purchase Order</h2>
            <p className="text-xs text-muted font-mono mt-0.5">{po.po_number}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={20} /></button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: PO form */}
            <div className="space-y-5">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Vendor *</label>
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent">
                  <option value="">Select a vendor...</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              {/* Project */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Project (for inventory allocation)</label>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent">
                  <option value="">None — general purchase</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-wider text-muted">Line Items</label>
                  <button onClick={addBlankLine} className="text-accent text-xs flex items-center gap-1"><Plus size={12} /> Add Manual Item</button>
                </div>
                {lineItems.length === 0 ? (
                  <p className="text-muted text-sm bg-card border border-border p-4">
                    {vendorId ? "Select items from the catalog on the right, or add manually." : "Select a vendor to load their catalog."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {lineItems.map((li, i) => (
                      <div key={i} className="bg-card border border-border p-3">
                        <div className="grid grid-cols-[80px_1fr_60px_90px_60px_28px] gap-2 items-center">
                          <input value={li.item_number || ""} onChange={(e) => updateLine(i, "item_number", e.target.value)} placeholder="Item #" className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent font-mono" />
                          <input value={li.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Description" className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent" />
                          <input type="number" value={li.quantity || ""} onChange={(e) => updateLine(i, "quantity", Number(e.target.value))} placeholder="Qty" className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent text-right" />
                          <input type="number" value={li.unit_price || ""} onChange={(e) => updateLine(i, "unit_price", Number(e.target.value))} placeholder="Price" className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent text-right" />
                          <input value={li.unit} onChange={(e) => updateLine(i, "unit", e.target.value)} className="bg-background border border-border px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent" />
                          <button onClick={() => removeLine(i)} className="text-muted hover:text-red-500"><Trash2 size={12} /></button>
                        </div>
                        <div className="text-right mt-1">
                          <span className="text-xs font-mono text-muted">{money((li.quantity || 0) * (li.unit_price || 0))}</span>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-border space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">Subtotal</span>
                        <span className="font-mono">{money(total)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">Est. Tax (7%)</span>
                        <span className="font-mono text-muted">{money(total * TAX_RATE)}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-1 border-t border-border">
                        <span className="font-bold">Est. Total</span>
                        <span className="text-lg font-mono font-bold">{money(total + total * TAX_RATE)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-card border border-border p-4 space-y-4">
                <h3 className="text-xs uppercase tracking-wider text-muted">Delivery</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Method</label>
                    <select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-accent">
                      <option value="">Select...</option>
                      <option value="pickup">Pick Up</option>
                      <option value="will_call">Will Call</option>
                      <option value="ship">Ship to Address</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Delivery Date</label>
                    <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-accent" />
                  </div>
                </div>
                {deliveryMethod === "ship" && (
                  <div>
                    <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Ship To Address</label>
                    <AddressAutocomplete value={shipToAddress} onChange={setShipToAddress} onSelect={(r) => setShipToAddress(r.formatted)} className="w-full bg-background border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Need By</label>
                  <input type="date" value={needByDate} onChange={(e) => setNeedByDate(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[80px] resize-y" />
              </div>

              <div className="flex gap-3">
                <Button onClick={() => onSubmit(vendorId, vendorName, lineItems, notes, needByDate, deliveryMethod, deliveryDate, shipToAddress, projectId || undefined)} disabled={!vendorName || lineItems.length === 0}>Save Changes</Button>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
              </div>
            </div>

            {/* Right: Vendor catalog */}
            <div>
              {vendorId ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs uppercase tracking-wider text-muted">
                      <Package size={12} className="inline mr-1" />
                      {vendorName} Catalog ({catalog.length} items)
                    </h3>
                  </div>
                  {catalog.length > 0 && (
                    <div className="relative mb-3">
                      <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      <input value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Search catalog..." className="w-full bg-card border border-border pl-8 pr-4 py-2 text-xs text-foreground focus:outline-none focus:border-accent" />
                    </div>
                  )}
                  {catalog.length === 0 ? (
                    <p className="text-muted text-sm bg-card border border-border p-4">No items in this vendor&apos;s catalog yet.</p>
                  ) : (
                    <div className="space-y-1 max-h-[500px] overflow-y-auto">
                      {filteredCatalog.map((item) => (
                        <button key={item.id} onClick={() => addFromCatalog(item)} className="w-full text-left bg-card border border-border p-3 hover:border-accent/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div>
                              {item.item_number && <span className="text-xs font-mono text-muted mr-2">{item.item_number}</span>}
                              <span className="text-sm">{item.description}</span>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <span className="text-sm font-mono">{money(item.unit_price)}</span>
                              <span className="text-xs text-muted ml-1">/{item.unit}</span>
                            </div>
                          </div>
                          {item.category && <span className="text-[10px] text-muted">{item.category}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted text-sm">
                  Select a vendor to view their material catalog
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// VENDORS TAB
// ═══════════════════════════════════════════════════════════════

function VendorsTab() {
  const { userEmail } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const loadVendors = useCallback(async () => {
    const { data } = await axiom.from("vendors").select("*").order("name");
    if (data) setVendors(data);
  }, []);

  useEffect(() => { loadVendors(); }, [loadVendors]);

  // Load catalog when vendor selected
  useEffect(() => {
    if (!selected) { setCatalog([]); return; }
    axiom.from("vendor_catalog").select("*").eq("vendor_id", selected.id).order("description").then(({ data }) => {
      if (data) setCatalog(data);
    });
  }, [selected]);

  const filtered = vendors.filter((v) =>
    !search || v.name.toLowerCase().includes(search.toLowerCase())
  );

  async function createVendor(form: Record<string, string>) {
    const { data } = await axiom.from("vendors").insert({
      name: form.name,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      website: form.website || null,
    }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "purchase_order", label: `Added vendor: ${data.name}`, user_name: userEmail });
      loadVendors();
      setShowCreate(false);
      setSelected(data);
    }
  }

  async function deleteVendor(id: string) {
    await axiom.from("vendors").delete().eq("id", id);
    setSelected(null);
    loadVendors();
  }

  async function addCatalogItem(vendorId: string) {
    const { data } = await axiom.from("vendor_catalog").insert({
      vendor_id: vendorId,
      description: "New Item",
      unit_price: 0,
      unit: "ea",
    }).select().single();
    if (data) {
      setCatalog((prev) => [...prev, data]);
    }
  }

  const [catalogDirty, setCatalogDirty] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);

  function updateCatalogItem(id: string, field: string, value: string | number | boolean) {
    setCatalog((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
    setCatalogDirty(true);
  }

  async function saveCatalog() {
    setCatalogSaving(true);
    await Promise.all(catalog.map((item) =>
      axiom.from("vendor_catalog").update({
        item_number: item.item_number,
        description: item.description,
        unit_price: item.unit_price,
        unit: item.unit,
        category: item.category,
      }).eq("id", item.id)
    ));
    setCatalogDirty(false);
    setCatalogSaving(false);
  }

  async function deleteCatalogItem(id: string) {
    await axiom.from("vendor_catalog").delete().eq("id", id);
    setCatalog((prev) => prev.filter((c) => c.id !== id));
  }

  const [vendorDirty, setVendorDirty] = useState(false);
  const [vendorSaving, setVendorSaving] = useState(false);

  function updateVendorField(field: string, value: string) {
    setSelected((prev) => prev ? { ...prev, [field]: value } : prev);
    setVendorDirty(true);
  }

  async function saveVendor() {
    if (!selected) return;
    setVendorSaving(true);
    await axiom.from("vendors").update({
      name: selected.name,
      contact_name: selected.contact_name,
      email: selected.email,
      phone: selected.phone,
      address: selected.address,
      website: selected.website,
      notes: selected.notes,
    }).eq("id", selected.id);
    setVendorDirty(false);
    setVendorSaving(false);
    loadVendors();
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-10rem)]">
      {/* Vendor list */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-heading font-bold">Vendors</h2>
          <button onClick={() => setShowCreate(true)} className="text-accent"><Plus size={20} /></button>
        </div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full bg-card border border-border pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {filtered.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className={cn("w-full text-left px-3 py-2.5 rounded text-sm transition-colors", selected?.id === v.id ? "bg-accent/15 text-accent" : "hover:bg-card text-foreground")}
            >
              <p className="font-medium">{v.name}</p>
              <p className="text-xs text-muted">{v.contact_name || v.email || "No contact"}</p>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-muted text-sm text-center py-4">No vendors yet</p>}
        </div>
      </div>

      {/* Vendor detail */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex-1 mr-4">
                <input
                  value={selected.name}
                  onChange={(e) => updateVendorField("name", e.target.value)}
                  className="text-xl font-heading font-bold bg-transparent border-none focus:outline-none focus:bg-card px-0 py-0 w-full"
                />
                <p className="text-muted text-sm">{selected.status}</p>
              </div>
              <div className="flex items-center gap-2">
                {vendorDirty && (
                  <Button size="sm" onClick={saveVendor} disabled={vendorSaving}>
                    {vendorSaving ? "Saving..." : "Save"}
                  </Button>
                )}
                <button onClick={() => deleteVendor(selected.id)} className="text-muted hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            </div>

            {/* Contact info — editable */}
            <div className="grid grid-cols-2 gap-4 bg-card border border-border p-4">
              <div>
                <span className="text-xs text-muted block mb-1">Contact</span>
                <input value={selected.contact_name || ""} onChange={(e) => updateVendorField("contact_name", e.target.value)} placeholder="—" className="w-full bg-background/50 border border-border/50 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent rounded-sm" />
              </div>
              <div>
                <span className="text-xs text-muted block mb-1">Email</span>
                <input type="email" value={selected.email || ""} onChange={(e) => updateVendorField("email", e.target.value)} placeholder="—" className="w-full bg-background/50 border border-border/50 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent rounded-sm" />
              </div>
              <div>
                <span className="text-xs text-muted block mb-1">Phone</span>
                <input value={selected.phone || ""} onChange={(e) => updateVendorField("phone", e.target.value)} placeholder="—" className="w-full bg-background/50 border border-border/50 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent rounded-sm" />
              </div>
              <div>
                <span className="text-xs text-muted block mb-1">Website</span>
                <input value={selected.website || ""} onChange={(e) => updateVendorField("website", e.target.value)} placeholder="—" className="w-full bg-background/50 border border-border/50 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent rounded-sm" />
              </div>
              <div className="col-span-2">
                <span className="text-xs text-muted block mb-1">Address</span>
                <input value={selected.address || ""} onChange={(e) => updateVendorField("address", e.target.value)} placeholder="—" className="w-full bg-background/50 border border-border/50 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent rounded-sm" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Notes</label>
              <textarea
                value={selected.notes || ""}
                onChange={(e) => updateVendorField("notes", e.target.value)}
                className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[60px] resize-y"
                placeholder="Notes about this vendor..."
              />
            </div>

            {/* Material catalog */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm uppercase tracking-wider text-muted">Material Catalog ({catalog.length} items)</h3>
                <div className="flex items-center gap-3">
                  {catalogDirty && (
                    <Button size="sm" onClick={saveCatalog} disabled={catalogSaving}>
                      {catalogSaving ? "Saving..." : "Save Changes"}
                    </Button>
                  )}
                  <button onClick={() => addCatalogItem(selected.id)} className="text-accent text-xs flex items-center gap-1"><Plus size={12} /> Add Item</button>
                </div>
              </div>

              {catalog.length === 0 ? (
                <p className="text-muted text-sm bg-card border border-border p-4">No catalog items yet. Click &quot;Add Item&quot; to start building the catalog.</p>
              ) : (
                <div className="bg-card border border-border">
                  <div className="grid grid-cols-[100px_1fr_100px_80px_100px_28px] gap-2 px-3 py-2 text-xs uppercase tracking-wider text-muted border-b border-border">
                    <span>Item #</span>
                    <span>Description</span>
                    <span className="text-right">Price</span>
                    <span>Unit</span>
                    <span>Category</span>
                    <span></span>
                  </div>
                  {catalog.map((item) => (
                    <div key={item.id} className="grid grid-cols-[100px_1fr_100px_80px_100px_28px] gap-2 px-3 py-1.5 border-b border-border/30 items-center">
                      <input
                        value={item.item_number || ""}
                        onChange={(e) => updateCatalogItem(item.id, "item_number", e.target.value)}
                        className="bg-background/50 border border-border/50 text-xs font-mono text-foreground focus:outline-none focus:border-accent px-2 py-1.5 rounded-sm"
                        placeholder="—"
                      />
                      <input
                        value={item.description}
                        onChange={(e) => updateCatalogItem(item.id, "description", e.target.value)}
                        className="bg-background/50 border border-border/50 text-xs text-foreground focus:outline-none focus:border-accent px-2 py-1.5 rounded-sm"
                      />
                      <input
                        type="number"
                        value={item.unit_price || ""}
                        onChange={(e) => updateCatalogItem(item.id, "unit_price", Number(e.target.value))}
                        className="bg-background/50 border border-border/50 text-xs font-mono text-foreground focus:outline-none focus:border-accent px-2 py-1.5 rounded-sm text-right"
                      />
                      <input
                        value={item.unit}
                        onChange={(e) => updateCatalogItem(item.id, "unit", e.target.value)}
                        className="bg-background/50 border border-border/50 text-xs text-foreground focus:outline-none focus:border-accent px-2 py-1.5 rounded-sm"
                      />
                      <input
                        value={item.category || ""}
                        onChange={(e) => updateCatalogItem(item.id, "category", e.target.value)}
                        className="bg-background/50 border border-border/50 text-xs text-muted focus:outline-none focus:border-accent px-2 py-1.5 rounded-sm"
                        placeholder="—"
                      />
                      <button onClick={() => deleteCatalogItem(item.id)} className="text-muted hover:text-red-500"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">Select a vendor to view details and catalog</div>
        )}
      </div>

      {/* Create vendor modal */}
      {showCreate && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border p-6 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-bold">New Vendor</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted"><X size={20} /></button>
            </div>
            <VendorForm onSubmit={createVendor} onCancel={() => setShowCreate(false)} />
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SEND PO MODAL
// ═══════════════════════════════════════════════════════════════

function SendPOModal({ po, vendorEmail, onClose, onSent, userEmail }: {
  po: PurchaseOrder;
  vendorEmail: string;
  onClose: () => void;
  onSent: () => void;
  userEmail: string;
}) {
  const [to, setTo] = useState(vendorEmail);
  const [message, setMessage] = useState(`Hi,\n\nPlease find the attached purchase order ${po.po_number}.\n\nThank you,\nRELIC`);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  async function send() {
    setSending(true);
    const html = `
      <div style="font-family:Arial,sans-serif;color:#222;max-width:640px;margin:0 auto;">
        <div style="margin-bottom:24px;white-space:pre-wrap;font-size:14px;color:#444;">${message.replace(/\n/g, "<br>")}</div>
        <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
        ${generatePOHtml(po, true)}
      </div>
    `;
    try {
      const res = await fetch("/api/send-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject: `Purchase Order ${po.po_number} — RELIC`,
          html,
          from_name: "RELIC",
        }),
      });
      if (res.ok) {
        setStatus("sent");
        await logActivity({ action: "sent", entity: "purchase_order", entity_id: po.id, label: `Sent PO ${po.po_number} to ${to}`, user_name: userEmail });
        setTimeout(onSent, 1500);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
    setSending(false);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed inset-4 z-50 bg-background border border-border flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-heading font-bold">Send {po.po_number}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={20} /></button>
        </div>

        {/* Split body */}
        <div className="flex flex-1 min-h-0">
          {/* Left — compose */}
          <div className="w-full md:w-1/2 shrink-0 border-r border-border flex flex-col overflow-y-auto p-6 space-y-5">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">To *</label>
              <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="vendor@email.com" className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[180px] resize-y" />
            </div>

            <div className="flex gap-3">
              <Button onClick={send} disabled={!to || sending}>
                <Send size={14} className="mr-1" /> {sending ? "Sending..." : "Send PO"}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>

            {status === "sent" && <p className="text-green-500 text-sm">PO sent successfully!</p>}
            {status === "error" && <p className="text-red-500 text-sm">Failed to send. Check that RESEND_API_KEY is configured.</p>}
          </div>

          {/* Right — PO preview */}
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="min-h-full" dangerouslySetInnerHTML={{ __html: generatePOHtml(po, true) }} />
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRINT PO VIEW
// ═══════════════════════════════════════════════════════════════

function PrintPOView({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  useEffect(() => {
    setTimeout(() => window.print(), 300);
  }, []);

  return (
    <div className="fixed inset-0 bg-white z-[100] overflow-auto print:relative">
      <button onClick={onClose} className="fixed top-4 right-4 bg-black text-white px-4 py-2 text-sm rounded print:hidden z-10">
        Close
      </button>
      <div className="p-10 print:p-0" dangerouslySetInnerHTML={{ __html: generatePOHtml(po, false) }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════

function VendorForm({ onSubmit, onCancel }: { onSubmit: (f: Record<string, string>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: "", contact_name: "", email: "", phone: "", address: "", website: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Vendor Name *</label><input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Contact Name</label><input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Email</label><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Phone</label><input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
        <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Website</label><input value={form.website} onChange={(e) => set("website", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      </div>
      <div><label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Address</label><input value={form.address} onChange={(e) => set("address", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" /></div>
      <div className="flex gap-3">
        <Button onClick={() => onSubmit(form)} disabled={!form.name}>Add Vendor</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
