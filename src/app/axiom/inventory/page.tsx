"use client";

import { useState, useEffect, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { useAuth } from "@/components/axiom/AuthProvider";
import { logActivity } from "@/lib/activity";
import { InventoryCategory, InventoryItem, InventoryTransaction } from "@/types/axiom";
import {
  Search,
  Plus,
  Minus,
  X,
  Pencil,
  Trash2,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Printer,
} from "lucide-react";

const inp = "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type Tab = "inventory" | "categories" | "transactions";

// ── Helpers ──────────────────────────────────────────────────────────────────

interface SimpleProject { id: string; project_name: string }
interface SimpleVendor { id: string; name: string }

// ── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { userEmail } = useAuth();
  const [tab, setTab] = useState<Tab>("inventory");
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [projects, setProjects] = useState<SimpleProject[]>([]);
  const [vendors, setVendors] = useState<SimpleVendor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [catsRes, itemsRes, txnRes, projRes, vendRes] = await Promise.all([
      axiom.from("inventory_categories").select("*").order("sort_order"),
      axiom.from("inventory_items").select("*").eq("active", true).order("description"),
      axiom.from("inventory_transactions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
      axiom.from("custom_work").select("id,project_name").in("status", ["new", "in_review", "quoted", "in_progress"]).order("project_name"),
      axiom.from("vendors").select("id,name").eq("status", "active").order("name"),
    ]);
    setCategories((catsRes.data ?? []) as InventoryCategory[]);
    setItems((itemsRes.data ?? []) as InventoryItem[]);
    setTransactions((txnRes.data ?? []) as InventoryTransaction[]);
    setProjects((projRes.data ?? []) as SimpleProject[]);
    setVendors((vendRes.data ?? []) as SimpleVendor[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "inventory", label: "Inventory" },
    { key: "categories", label: "Categories" },
    { key: "transactions", label: "Transactions" },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 pt-6 pb-0 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground tracking-wide mb-4">Inventory</h1>
          <div className="flex gap-0">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-16 text-center text-muted text-sm">Loading…</div>
      ) : (
        <div className="px-6 py-6">
          {tab === "inventory" && (
            <InventoryTab
              items={items}
              categories={categories}
              projects={projects}
              vendors={vendors}
              userEmail={userEmail || ""}
              onReload={load}
            />
          )}
          {tab === "categories" && (
            <CategoriesTab
              categories={categories}
              onReload={load}
            />
          )}
          {tab === "transactions" && (
            <TransactionsTab
              transactions={transactions}
              items={items}
              projects={projects}
              categories={categories}
              onReload={load}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Inventory Tab ────────────────────────────────────────────────────────────

function InventoryTab({
  items, categories, projects, vendors, userEmail, onReload,
}: {
  items: InventoryItem[];
  categories: InventoryCategory[];
  projects: SimpleProject[];
  vendors: SimpleVendor[];
  userEmail: string;
  onReload: () => void;
}) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [txnModal, setTxnModal] = useState<{ item: InventoryItem; type: "in" | "out" } | null>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);

  const filtered = items.filter((it) => {
    const q = search.toLowerCase();
    const matchSearch = !q || it.description.toLowerCase().includes(q) || (it.item_number ?? "").toLowerCase().includes(q);
    const matchCat = catFilter === "all" || it.category_id === catFilter;
    return matchSearch && matchCat;
  });

  // Group by category
  const grouped = categories
    .filter((c) => catFilter === "all" || c.id === catFilter)
    .map((cat) => ({
      category: cat,
      items: filtered.filter((it) => it.category_id === cat.id),
    }))
    .filter((g) => g.items.length > 0);

  const uncategorized = filtered.filter((it) => !it.category_id);

  const lowStock = items.filter((it) => it.min_stock_level > 0 && it.quantity_on_hand <= it.min_stock_level);
  const totalValue = items.reduce((s, it) => s + it.quantity_on_hand * it.unit_cost, 0);

  function printTakeSheet() {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Build grouped items for the sheet
    const groups = categories
      .map((cat) => ({
        category: cat,
        items: items.filter((it) => it.category_id === cat.id).sort((a, b) => a.description.localeCompare(b.description)),
      }))
      .filter((g) => g.items.length > 0);
    const uncat = items.filter((it) => !it.category_id).sort((a, b) => a.description.localeCompare(b.description));

    function renderRows(list: InventoryItem[]) {
      return list
        .map(
          (it) => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;font-family:monospace;color:#666;">${it.item_number || "—"}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${it.description}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;text-align:center;">${it.unit}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;text-align:center;font-family:monospace;">${it.quantity_on_hand}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #ddd;width:120px;">
              <div style="border-bottom:1.5px solid #999;height:20px;"></div>
            </td>
            <td style="padding:6px 10px;border-bottom:1px solid #ddd;width:140px;">
              <div style="border-bottom:1.5px solid #999;height:20px;"></div>
            </td>
          </tr>`
        )
        .join("");
    }

    const tableHead = `
      <tr style="background:#f5f5f5;">
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:2px solid #333;">Item #</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:2px solid #333;">Description</th>
        <th style="padding:8px 10px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:2px solid #333;">Unit</th>
        <th style="padding:8px 10px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:2px solid #333;">On Hand</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:2px solid #333;width:120px;">Count</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;border-bottom:2px solid #333;width:140px;">Notes</th>
      </tr>`;

    let sectionsHtml = "";
    for (const g of groups) {
      sectionsHtml += `
        <div style="margin-bottom:28px;page-break-inside:avoid;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="width:12px;height:12px;border-radius:2px;background:${g.category.color};"></div>
            <h2 style="margin:0;font-size:15px;text-transform:uppercase;letter-spacing:2px;font-weight:700;">${g.category.name}</h2>
            <span style="font-size:12px;color:#999;">(${g.items.length} items)</span>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${tableHead}
            ${renderRows(g.items)}
          </table>
        </div>`;
    }
    if (uncat.length > 0) {
      sectionsHtml += `
        <div style="margin-bottom:28px;page-break-inside:avoid;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="width:12px;height:12px;border-radius:2px;background:#ccc;"></div>
            <h2 style="margin:0;font-size:15px;text-transform:uppercase;letter-spacing:2px;font-weight:700;">Uncategorized</h2>
            <span style="font-size:12px;color:#999;">(${uncat.length} items)</span>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${tableHead}
            ${renderRows(uncat)}
          </table>
        </div>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Inventory Take Sheet — ${today}</title>
  <style>
    @page { margin: 0.5in; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; margin: 0; padding: 0; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print" style="padding:12px 20px;background:#111;display:flex;justify-content:space-between;align-items:center;">
    <span style="color:#fff;font-size:14px;">Inventory Take Sheet</span>
    <button onclick="window.print()" style="background:#c8a55a;color:#111;border:none;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:1px;">PRINT</button>
  </div>

  <div style="padding:24px 20px;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid #111;padding-bottom:16px;">
      <div>
        <h1 style="margin:0;font-size:22px;text-transform:uppercase;letter-spacing:3px;font-weight:800;">Inventory Take Sheet</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#666;">Physical Count Worksheet</p>
      </div>
      <div style="text-align:right;">
        <p style="margin:0;font-size:15px;font-weight:700;">${today}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#666;">${items.length} total items</p>
      </div>
    </div>

    <!-- Counted By -->
    <div style="display:flex;gap:40px;margin-bottom:24px;">
      <div style="flex:1;">
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;">Counted By:</span>
        <div style="border-bottom:1.5px solid #999;height:24px;margin-top:4px;"></div>
      </div>
      <div style="flex:1;">
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;">Verified By:</span>
        <div style="border-bottom:1.5px solid #999;height:24px;margin-top:4px;"></div>
      </div>
    </div>

    ${sectionsHtml}

    <!-- Footer -->
    <div style="margin-top:32px;padding-top:16px;border-top:2px solid #111;display:flex;justify-content:space-between;">
      <p style="margin:0;font-size:11px;color:#666;">Relic Built — Inventory Take Sheet</p>
      <p style="margin:0;font-size:11px;color:#666;">Printed: ${today}</p>
    </div>
  </div>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Total Items</p>
          <p className="text-2xl font-bold text-foreground mt-1">{items.length}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Categories</p>
          <p className="text-2xl font-bold text-foreground mt-1">{categories.length}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Low Stock</p>
          <p className={`text-2xl font-bold mt-1 ${lowStock.length > 0 ? "text-red-400" : "text-foreground"}`}>{lowStock.length}</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-xs text-muted uppercase tracking-wider">Total Value</p>
          <p className="text-2xl font-bold text-foreground mt-1">{money(totalValue)}</p>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" className="w-full bg-card border border-border pl-9 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent" />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="bg-card border border-border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent">
          <option value="all">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={printTakeSheet} className="flex items-center gap-1.5 border border-border text-muted hover:text-foreground px-4 py-2.5 text-sm font-medium transition-colors">
          <Printer size={14} /> Take Sheet
        </button>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-accent text-background px-4 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors">
          <Plus size={14} /> Add Item
        </button>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 px-4 py-3 mb-5 flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Low Stock Alert</p>
            <p className="text-xs text-red-400/80 mt-0.5">{lowStock.map((i) => i.description).join(", ")}</p>
          </div>
        </div>
      )}

      {/* Grouped items */}
      {grouped.map(({ category, items: catItems }) => (
        <div key={category.id} className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-sm" style={{ background: category.color }} />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{category.name}</h3>
            <span className="text-xs text-muted">({catItems.length})</span>
          </div>
          <div className="bg-card border border-border divide-y divide-border">
            {catItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                vendors={vendors}
                onUse={() => setTxnModal({ item, type: "out" })}
                onReceive={() => setTxnModal({ item, type: "in" })}
                onEdit={() => setEditItem(item)}
              />
            ))}
          </div>
        </div>
      ))}

      {uncategorized.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-sm bg-muted/40" />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Uncategorized</h3>
            <span className="text-xs text-muted">({uncategorized.length})</span>
          </div>
          <div className="bg-card border border-border divide-y divide-border">
            {uncategorized.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                vendors={vendors}
                onUse={() => setTxnModal({ item, type: "out" })}
                onReceive={() => setTxnModal({ item, type: "in" })}
                onEdit={() => setEditItem(item)}
              />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center text-muted text-sm py-12">
          {items.length === 0 ? "No inventory items yet. Add items from the vendor catalog or manually." : "No matches."}
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddItemModal
          categories={categories}
          vendors={vendors}
          onClose={() => setShowAdd(false)}
          onSaved={onReload}
        />
      )}
      {txnModal && (
        <TransactionModal
          item={txnModal.item}
          type={txnModal.type}
          projects={projects}
          userEmail={userEmail}
          onClose={() => setTxnModal(null)}
          onSaved={onReload}
        />
      )}
      {editItem && (
        <EditItemModal
          item={editItem}
          categories={categories}
          onClose={() => setEditItem(null)}
          onSaved={onReload}
        />
      )}
    </>
  );
}

// ── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item, vendors, onUse, onReceive, onEdit,
}: {
  item: InventoryItem;
  vendors: SimpleVendor[];
  onUse: () => void;
  onReceive: () => void;
  onEdit: () => void;
}) {
  const vendor = vendors.find((v) => v.id === item.vendor_id);
  const isLow = item.min_stock_level > 0 && item.quantity_on_hand <= item.min_stock_level;

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-background/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{item.description}</p>
          {item.item_number && <span className="text-xs text-muted font-mono shrink-0">#{item.item_number}</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted">
          {vendor && <span>{vendor.name}</span>}
          <span>{money(item.unit_cost)} / {item.unit}</span>
          {item.location && <span>{item.location}</span>}
        </div>
      </div>

      {/* Quantity */}
      <div className={`text-right shrink-0 ${isLow ? "text-red-400" : ""}`}>
        <p className={`text-lg font-bold font-mono ${isLow ? "text-red-400" : "text-foreground"}`}>
          {item.quantity_on_hand}
        </p>
        <p className="text-[10px] text-muted uppercase">{item.unit}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onReceive} title="Receive (in)" className="p-1.5 text-green-500 hover:bg-green-500/10 rounded transition-colors">
          <ArrowDownCircle size={16} />
        </button>
        <button onClick={onUse} title="Use (out)" className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-colors">
          <ArrowUpCircle size={16} />
        </button>
        <button onClick={onEdit} title="Edit" className="p-1.5 text-muted hover:text-foreground hover:bg-card rounded transition-colors">
          <Pencil size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Add Item Modal ───────────────────────────────────────────────────────────

function AddItemModal({
  categories, vendors, onClose, onSaved,
}: {
  categories: InventoryCategory[];
  vendors: SimpleVendor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [desc, setDesc] = useState("");
  const [itemNum, setItemNum] = useState("");
  const [unit, setUnit] = useState("ea");
  const [unitCost, setUnitCost] = useState("");
  const [qty, setQty] = useState("");
  const [catId, setCatId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [location, setLocation] = useState("");
  const [minStock, setMinStock] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!desc.trim()) return;
    setSaving(true);
    await axiom.from("inventory_items").insert({
      description: desc.trim(),
      item_number: itemNum.trim() || null,
      unit,
      unit_cost: Number(unitCost) || 0,
      quantity_on_hand: Number(qty) || 0,
      category_id: catId || null,
      vendor_id: vendorId || null,
      location: location.trim() || null,
      min_stock_level: Number(minStock) || 0,
    });
    await logActivity({ action: "created", entity: "inventory", label: `Added inventory item: ${desc}` });
    onSaved();
    onClose();
  }

  return (
    <Modal title="Add Inventory Item" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={lbl}>Description *</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className={inp} placeholder="Item description" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Item #</label>
            <input value={itemNum} onChange={(e) => setItemNum(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inp} placeholder="ea, bd ft, lbs…" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Unit Cost ($)</label>
            <input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Starting Qty</label>
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className={inp} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Category</label>
            <select value={catId} onChange={(e) => setCatId(e.target.value)} className={inp}>
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Vendor</label>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inp}>
              <option value="">None</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inp} placeholder="Shelf, bin, etc." />
          </div>
          <div>
            <label className={lbl}>Min Stock Level</label>
            <input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={inp} />
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={save} disabled={saving || !desc.trim()} className="flex-1 bg-accent text-background px-4 py-2.5 text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
          {saving ? "Saving…" : "Add Item"}
        </button>
        <button onClick={onClose} className="flex-1 border border-border px-4 py-2.5 text-sm text-muted hover:text-foreground">Cancel</button>
      </div>
    </Modal>
  );
}

// ── Edit Item Modal ──────────────────────────────────────────────────────────

function EditItemModal({
  item, categories, onClose, onSaved,
}: {
  item: InventoryItem;
  categories: InventoryCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [catId, setCatId] = useState(item.category_id ?? "");
  const [location, setLocation] = useState(item.location ?? "");
  const [minStock, setMinStock] = useState(String(item.min_stock_level || ""));
  const [desc, setDesc] = useState(item.description);
  const [unitCost, setUnitCost] = useState(String(item.unit_cost || ""));
  const [unit, setUnit] = useState(item.unit);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setSaving(true);
    await axiom.from("inventory_items").update({
      description: desc.trim(),
      category_id: catId || null,
      location: location.trim() || null,
      min_stock_level: Number(minStock) || 0,
      unit_cost: Number(unitCost) || 0,
      unit,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", item.id);
    onSaved();
    onClose();
  }

  async function handleDelete() {
    await axiom.from("inventory_items").update({ active: false, updated_at: new Date().toISOString() }).eq("id", item.id);
    await logActivity({ action: "deleted", entity: "inventory", entity_id: item.id, label: `Removed inventory item: ${item.description}` });
    onSaved();
    onClose();
  }

  return (
    <Modal title="Edit Item" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={lbl}>Description</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Unit Cost ($)</label>
            <input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inp} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Category</label>
            <select value={catId} onChange={(e) => setCatId(e.target.value)} className={inp}>
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inp} />
          </div>
        </div>
        <div>
          <label className={lbl}>Min Stock Level</label>
          <input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inp + " min-h-[60px] resize-y"} />
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={save} disabled={saving} className="flex-1 bg-accent text-background px-4 py-2.5 text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onClose} className="flex-1 border border-border px-4 py-2.5 text-sm text-muted hover:text-foreground">Cancel</button>
      </div>
      <div className="mt-4 pt-4 border-t border-border">
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
            <Trash2 size={12} /> Remove from inventory
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400">Confirm removal?</span>
            <button onClick={handleDelete} className="text-xs bg-red-500 text-white px-2 py-1 hover:bg-red-600">Yes</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs border border-border px-2 py-1 text-muted hover:text-foreground">No</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Transaction Modal ────────────────────────────────────────────────────────

function TransactionModal({
  item, type, projects, userEmail, onClose, onSaved,
}: {
  item: InventoryItem;
  type: "in" | "out";
  projects: SimpleProject[];
  userEmail: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState("");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const q = Number(qty);
    if (!q || q <= 0) return;
    setSaving(true);

    // Insert transaction
    await axiom.from("inventory_transactions").insert({
      inventory_item_id: item.id,
      type,
      quantity: q,
      unit_cost: item.unit_cost,
      custom_work_id: projectId || null,
      notes: notes.trim() || null,
      date: new Date().toISOString().split("T")[0],
      created_by: userEmail,
    });

    // Update quantity on hand
    const delta = type === "out" ? -q : q;
    const newQty = item.quantity_on_hand + delta;
    await axiom.from("inventory_items").update({
      quantity_on_hand: newQty,
      updated_at: new Date().toISOString(),
    }).eq("id", item.id);

    const proj = projects.find((p) => p.id === projectId);
    await logActivity({
      action: "updated",
      entity: "inventory",
      entity_id: item.id,
      label: `${type === "in" ? "Received" : "Used"} ${q} ${item.unit} of ${item.description}${proj ? ` → ${proj.project_name}` : ""}`,
      user_name: userEmail,
    });

    onSaved();
    onClose();
  }

  return (
    <Modal title={type === "in" ? "Receive Inventory" : "Use Inventory"} onClose={onClose}>
      <div className="bg-card border border-border p-3 mb-4 flex items-center gap-3">
        <Package size={18} className="text-muted shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">{item.description}</p>
          <p className="text-xs text-muted">Current stock: <strong>{item.quantity_on_hand} {item.unit}</strong></p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className={lbl}>Quantity *</label>
          <input type="number" min="0" step="1" value={qty} onChange={(e) => setQty(e.target.value)} className={inp} placeholder={`How many ${item.unit}?`} autoFocus />
        </div>
        {type === "out" && (
          <div>
            <label className={lbl}>Project *</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inp}>
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={lbl}>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} placeholder="Optional notes…" />
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button
          onClick={save}
          disabled={saving || !qty || Number(qty) <= 0 || (type === "out" && !projectId)}
          className={`flex-1 px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
            type === "in"
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-red-500 text-white hover:bg-red-600"
          }`}
        >
          {saving ? "Saving…" : type === "in" ? "Receive" : "Use"}
        </button>
        <button onClick={onClose} className="flex-1 border border-border px-4 py-2.5 text-sm text-muted hover:text-foreground">Cancel</button>
      </div>
    </Modal>
  );
}

// ── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab({
  categories, onReload,
}: {
  categories: InventoryCategory[];
  onReload: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editCat, setEditCat] = useState<InventoryCategory | null>(null);

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted">{categories.length} categories</p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-accent text-background px-4 py-2.5 text-sm font-medium hover:bg-accent/90">
          <Plus size={14} /> Add Category
        </button>
      </div>

      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat.id} className="bg-card border border-border p-4 flex items-start gap-4">
            <div className="w-4 h-4 rounded-sm shrink-0 mt-1" style={{ background: cat.color }} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{cat.name}</h3>
              {cat.description && <p className="text-xs text-muted mt-0.5">{cat.description}</p>}
              {cat.subcategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {cat.subcategories.map((sub) => (
                    <span key={sub} className="text-xs px-2 py-0.5 bg-muted/15 text-muted">{sub}</span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setEditCat(cat)} className="p-1.5 text-muted hover:text-foreground hover:bg-background rounded shrink-0">
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>

      {showAdd && <CategoryModal onClose={() => setShowAdd(false)} onSaved={onReload} />}
      {editCat && <CategoryModal category={editCat} onClose={() => setEditCat(null)} onSaved={onReload} />}
    </>
  );
}

// ── Category Modal ───────────────────────────────────────────────────────────

const COLORS = ["#f59e0b", "#22c55e", "#3b82f6", "#6366f1", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#6b7280"];

function CategoryModal({
  category, onClose, onSaved,
}: {
  category?: InventoryCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [desc, setDesc] = useState(category?.description ?? "");
  const [color, setColor] = useState(category?.color ?? "#6b7280");
  const [subs, setSubs] = useState<string[]>(category?.subcategories ?? []);
  const [newSub, setNewSub] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function addSub() {
    if (newSub.trim() && !subs.includes(newSub.trim())) {
      setSubs([...subs, newSub.trim()]);
      setNewSub("");
    }
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: desc.trim() || null,
      color,
      subcategories: subs,
    };
    if (category) {
      await axiom.from("inventory_categories").update(payload).eq("id", category.id);
    } else {
      const maxOrder = Math.max(0, ...((await axiom.from("inventory_categories").select("sort_order")).data ?? []).map((c: { sort_order: number }) => c.sort_order));
      await axiom.from("inventory_categories").insert({ ...payload, sort_order: maxOrder + 1 });
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!category) return;
    // Unlink items first
    await axiom.from("inventory_items").update({ category_id: null }).eq("category_id", category.id);
    await axiom.from("inventory_categories").delete().eq("id", category.id);
    onSaved();
    onClose();
  }

  return (
    <Modal title={category ? "Edit Category" : "Add Category"} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={lbl}>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Description</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Color</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-sm transition-transform"
                style={{ background: c, outline: color === c ? "2px solid #fff" : "none", outlineOffset: "1px", transform: color === c ? "scale(1.15)" : "scale(1)" }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Subcategories / Descriptors</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {subs.map((s) => (
              <span key={s} className="text-xs px-2 py-1 bg-muted/15 text-foreground flex items-center gap-1">
                {s}
                <button onClick={() => setSubs(subs.filter((x) => x !== s))} className="text-muted hover:text-red-400"><X size={10} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }}
              placeholder="Type and press Enter…"
              className={inp}
            />
            <button onClick={addSub} className="bg-accent text-background px-3 text-sm shrink-0 hover:bg-accent/90">Add</button>
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={save} disabled={saving || !name.trim()} className="flex-1 bg-accent text-background px-4 py-2.5 text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
          {saving ? "Saving…" : category ? "Save" : "Create"}
        </button>
        <button onClick={onClose} className="flex-1 border border-border px-4 py-2.5 text-sm text-muted hover:text-foreground">Cancel</button>
      </div>
      {category && (
        <div className="mt-4 pt-4 border-t border-border">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
              <Trash2 size={12} /> Delete category
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Items will become uncategorized. Delete?</span>
              <button onClick={handleDelete} className="text-xs bg-red-500 text-white px-2 py-1 hover:bg-red-600">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs border border-border px-2 py-1 text-muted hover:text-foreground">No</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Transactions Tab ─────────────────────────────────────────────────────────

function TransactionsTab({
  transactions, items, projects, categories, onReload,
}: {
  transactions: InventoryTransaction[];
  items: InventoryItem[];
  projects: SimpleProject[];
  categories: InventoryCategory[];
  onReload: () => void;
}) {
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out" | "adjustment">("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");

  const filtered = transactions.filter((txn) => {
    const matchType = typeFilter === "all" || txn.type === typeFilter;
    const matchProject = !projectFilter || txn.custom_work_id === projectFilter;
    const matchItem = !itemFilter || txn.inventory_item_id === itemFilter;
    return matchType && matchProject && matchItem;
  });

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="bg-card border border-border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent">
          <option value="all">All Types</option>
          <option value="in">Received (In)</option>
          <option value="out">Used (Out)</option>
          <option value="adjustment">Adjustments</option>
        </select>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="bg-card border border-border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent">
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
        </select>
        <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} className="bg-card border border-border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent">
          <option value="">All Items</option>
          {items.map((it) => <option key={it.id} value={it.id}>{it.description}</option>)}
        </select>
      </div>

      {/* Transaction table */}
      <div className="bg-card border border-border">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border text-xs text-muted uppercase tracking-wider font-semibold">
          <div className="col-span-2">Date</div>
          <div className="col-span-3">Item</div>
          <div className="col-span-1">Type</div>
          <div className="col-span-1 text-right">Qty</div>
          <div className="col-span-2">Project</div>
          <div className="col-span-2">Notes</div>
          <div className="col-span-1">By</div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted">No transactions found.</div>
        ) : (
          filtered.map((txn) => {
            const item = items.find((it) => it.id === txn.inventory_item_id);
            const project = projects.find((p) => p.id === txn.custom_work_id);
            return (
              <div key={txn.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border last:border-b-0 items-center text-sm hover:bg-background/50 transition-colors">
                <div className="col-span-2 text-muted text-xs">
                  {new Date(txn.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                <div className="col-span-3 text-foreground truncate">{item?.description ?? "—"}</div>
                <div className="col-span-1">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 ${
                    txn.type === "in" ? "bg-green-500/15 text-green-400" :
                    txn.type === "out" ? "bg-red-500/15 text-red-400" :
                    "bg-yellow-500/15 text-yellow-400"
                  }`}>
                    {txn.type === "in" ? "IN" : txn.type === "out" ? "OUT" : "ADJ"}
                  </span>
                </div>
                <div className="col-span-1 text-right font-mono text-foreground">{txn.quantity}</div>
                <div className="col-span-2 text-muted truncate text-xs">{project?.project_name ?? "—"}</div>
                <div className="col-span-2 text-muted truncate text-xs">{txn.notes ?? ""}</div>
                <div className="col-span-1 text-muted truncate text-xs">{txn.created_by?.split("@")[0] ?? ""}</div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted mt-3">{filtered.length} transaction{filtered.length !== 1 ? "s" : ""}</p>
    </>
  );
}

// ── Shared Modal Shell ───────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-background border border-border w-full max-w-lg mx-4 p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
