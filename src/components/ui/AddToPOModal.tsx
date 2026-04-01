"use client";

import { useEffect, useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { PurchaseOrder, Vendor } from "@/types/axiom";
import { X, Check, Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AddToPOItem {
  description: string;
  qty: number;
  unit_price: number;
  vendor_name?: string;
}

interface Props {
  item: AddToPOItem;
  onClose: () => void;
  onAdded?: (poNumber: string) => void;
}

const money = (n: number) => `$${(n || 0).toFixed(2)}`;

export default function AddToPOModal({ item, onClose, onAdded }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [openPOs, setOpenPOs] = useState<PurchaseOrder[]>([]);
  const [vendorSearch, setVendorSearch] = useState(item.vendor_name || "");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [selectedPOId, setSelectedPOId] = useState<"new" | string>("new");
  const [description, setDescription] = useState(item.description);
  const [qty, setQty] = useState(item.qty || 1);
  const [unitPrice, setUnitPrice] = useState(item.unit_price || 0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    async function load() {
      const [{ data: v }, { data: p }] = await Promise.all([
        axiom.from("vendors").select("*").eq("status", "active").order("name"),
        axiom.from("purchase_orders").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      ]);
      if (v) setVendors(v);
      if (p) setOpenPOs(p);

      // Auto-match vendor by name
      if (item.vendor_name && v) {
        const match = v.find((x: Vendor) =>
          x.name.toLowerCase().includes(item.vendor_name!.toLowerCase()) ||
          item.vendor_name!.toLowerCase().includes(x.name.toLowerCase())
        );
        if (match) setSelectedVendorId(match.id);
      }
    }
    load();
  }, [item.vendor_name]);

  const filteredVendors = vendors.filter((v) =>
    v.name.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  const vendorName = selectedVendorId
    ? vendors.find((v) => v.id === selectedVendorId)?.name || vendorSearch
    : vendorSearch;

  // Filter open POs to match selected vendor if one is chosen
  const relevantPOs = selectedVendorId
    ? openPOs.filter((p) => p.vendor_id === selectedVendorId)
    : openPOs;

  async function confirm() {
    setSaving(true);
    const lineItem = { description, quantity: qty, unit_price: unitPrice, unit: "each" };

    if (selectedPOId === "new") {
      // Create a new PO
      const total = qty * unitPrice;
      const { data } = await axiom.from("purchase_orders").insert({
        po_number: "PO-TEMP",
        vendor_id: selectedVendorId || null,
        vendor_name: vendorName || "Unknown Vendor",
        item_description: description,
        quantity: qty,
        unit_price: unitPrice,
        line_items: [lineItem],
        status: "pending",
        attachments: [],
      }).select("id").single();

      if (data) {
        const poNum = `PO-${new Date().getFullYear()}-${String(data.id).slice(0, 4).toUpperCase()}`;
        await axiom.from("purchase_orders").update({ po_number: poNum }).eq("id", data.id);
        setSaving(false);
        setDone(poNum);
        onAdded?.(poNum);
      }
    } else {
      // Append to existing PO
      const po = openPOs.find((p) => p.id === selectedPOId);
      if (!po) { setSaving(false); return; }
      const updatedItems = [...(po.line_items || []), lineItem];
      const newTotal = updatedItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
      await axiom.from("purchase_orders").update({
        line_items: updatedItems,
        item_description: updatedItems.map((li) => li.description).join(", "),
        unit_price: newTotal,
      }).eq("id", selectedPOId);
      setSaving(false);
      setDone(po.po_number);
      onAdded?.(po.po_number);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background border border-border w-full max-w-md rounded shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-accent" />
            <span className="text-sm font-semibold">Add to Purchase Order</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={16} /></button>
        </div>

        {done ? (
          /* Success state */
          <div className="p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
              <Check size={24} className="text-accent" />
            </div>
            <p className="font-medium">Added to {done}</p>
            <button onClick={onClose} className="text-sm text-accent hover:underline">Close</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Item being added */}
            <div className="bg-card border border-border p-3 rounded space-y-2">
              <label className="text-xs text-muted block">Item Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-background border border-border px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">Qty</label>
                  <input
                    type="number"
                    value={qty || ""}
                    onChange={(e) => setQty(Number(e.target.value))}
                    className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent text-right"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">Unit Price</label>
                  <input
                    type="number"
                    value={unitPrice || ""}
                    onChange={(e) => setUnitPrice(Number(e.target.value))}
                    className="w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent text-right"
                  />
                </div>
              </div>
              <p className="text-right text-xs font-mono text-muted">Total: {money(qty * unitPrice)}</p>
            </div>

            {/* Vendor */}
            <div>
              <label className="text-xs text-muted block mb-1">Vendor</label>
              <input
                value={vendorSearch}
                onChange={(e) => { setVendorSearch(e.target.value); setSelectedVendorId(""); }}
                placeholder="Search or type vendor name…"
                className="w-full bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
              />
              {vendorSearch && filteredVendors.length > 0 && !selectedVendorId && (
                <div className="border border-border bg-card mt-1 max-h-32 overflow-y-auto">
                  {filteredVendors.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => { setSelectedVendorId(v.id); setVendorSearch(v.name); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent/10 hover:text-accent"
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* PO selection */}
            <div>
              <label className="text-xs text-muted block mb-1">Purchase Order</label>
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedPOId("new")}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 border text-sm transition-colors text-left",
                    selectedPOId === "new"
                      ? "border-accent text-accent bg-accent/10"
                      : "border-border text-muted hover:border-accent/50"
                  )}
                >
                  <Plus size={14} />
                  Create new P.O.
                </button>
                {relevantPOs.length > 0 && (
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {relevantPOs.map((po) => (
                      <button
                        key={po.id}
                        onClick={() => setSelectedPOId(po.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 border text-sm transition-colors text-left",
                          selectedPOId === po.id
                            ? "border-accent text-accent bg-accent/10"
                            : "border-border text-muted hover:border-accent/50"
                        )}
                      >
                        <span>{po.po_number} — {po.vendor_name}</span>
                        <span className="text-xs font-mono">{(po.line_items?.length || 0)} items</span>
                      </button>
                    ))}
                  </div>
                )}
                {relevantPOs.length === 0 && selectedVendorId && openPOs.length > 0 && (
                  <p className="text-xs text-muted px-1">No open P.O.s for this vendor — a new one will be created.</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={confirm}
                disabled={saving || !description.trim()}
                className="flex-1 bg-accent text-white py-2 text-sm font-medium hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                {saving ? "Adding…" : selectedPOId === "new" ? "Create P.O." : "Add to P.O."}
              </button>
              <button onClick={onClose} className="px-4 py-2 border border-border text-sm text-muted hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
