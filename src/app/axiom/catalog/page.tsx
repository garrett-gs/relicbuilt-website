"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import {
  ProductCatalog,
  Product,
  ProductMaterial,
  ProductPart,
  ProductLaborItem,
  ProductDocument,
} from "@/types/axiom";
import Button from "@/components/ui/Button";
import ImageUpload from "@/components/ui/ImageUpload";
import FileUpload from "@/components/ui/FileUpload";
import { cn } from "@/lib/utils";
import {
  Plus, X, Trash2, Pencil, FileText, Link as LinkIcon,
  Package, ChevronDown, ChevronRight, Archive, ArchiveRestore,
  ExternalLink,
} from "lucide-react";

const inp = "w-full bg-card border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent";
const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

export default function CatalogPage() {
  const [catalogs, setCatalogs] = useState<ProductCatalog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [creatingCatalog, setCreatingCatalog] = useState(false);
  const [newCatalogName, setNewCatalogName] = useState("");
  const [newCatalogClient, setNewCatalogClient] = useState("");
  const [loading, setLoading] = useState(true);

  const loadCatalogs = useCallback(async () => {
    const { data } = await axiom
      .from("product_catalogs")
      .select("*")
      .order("name");
    const list = (data as ProductCatalog[]) || [];
    setCatalogs(list);
    if (list.length > 0 && !selectedCatalogId) setSelectedCatalogId(list[0].id);
    setLoading(false);
  }, [selectedCatalogId]);

  const loadProducts = useCallback(async (catalogId: string) => {
    const { data } = await axiom
      .from("products")
      .select("*")
      .eq("catalog_id", catalogId)
      .order("name");
    setProducts((data as Product[]) || []);
  }, []);

  useEffect(() => { loadCatalogs(); }, [loadCatalogs]);
  useEffect(() => {
    if (selectedCatalogId) loadProducts(selectedCatalogId);
    else setProducts([]);
    setSelectedProductId(null);
  }, [selectedCatalogId, loadProducts]);

  const visibleProducts = useMemo(
    () => products.filter((p) => showArchived ? p.archived : !p.archived),
    [products, showArchived],
  );
  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;

  async function createCatalog() {
    const name = newCatalogName.trim();
    if (!name) return;
    const { data } = await axiom.from("product_catalogs").insert({
      name,
      client_name: newCatalogClient.trim() || null,
    }).select().single();
    if (data) {
      const cat = data as ProductCatalog;
      setCatalogs((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCatalogId(cat.id);
      setNewCatalogName("");
      setNewCatalogClient("");
      setCreatingCatalog(false);
    }
  }

  async function renameCatalog(id: string, name: string) {
    const { data } = await axiom.from("product_catalogs")
      .update({ name: name.trim() || "Untitled", updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (data) setCatalogs((prev) => prev.map((c) => c.id === id ? (data as ProductCatalog) : c));
  }

  async function deleteCatalog(id: string) {
    await axiom.from("product_catalogs").delete().eq("id", id);
    setCatalogs((prev) => prev.filter((c) => c.id !== id));
    if (selectedCatalogId === id) setSelectedCatalogId(catalogs.find((c) => c.id !== id)?.id || null);
  }

  async function createProduct() {
    if (!selectedCatalogId) return;
    const { data } = await axiom.from("products").insert({
      catalog_id: selectedCatalogId,
      name: "Untitled product",
      materials: [],
      parts: [],
      labor_items: [],
      markup_percent: 0,
      documents: [],
      archived: false,
    }).select().single();
    if (data) {
      const product = data as Product;
      setProducts((prev) => [...prev, product]);
      setSelectedProductId(product.id);
    }
  }

  async function updateProduct(id: string, patch: Partial<Product>) {
    const { data } = await axiom.from("products")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (data) {
      const updated = data as Product;
      setProducts((prev) => prev.map((p) => p.id === id ? updated : p));
    }
  }

  async function deleteProduct(id: string) {
    await axiom.from("products").delete().eq("id", id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    if (selectedProductId === id) setSelectedProductId(null);
  }

  if (loading) {
    return <div className="text-muted text-sm">Loading catalog…</div>;
  }

  return (
    <div className="flex gap-5 h-[calc(100vh-8rem)]">
      {/* Left: catalog + product list */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-heading font-bold">Catalog</h1>
        </div>

        {/* Catalog selector */}
        <div className="mb-3">
          <label className={lbl}>Catalog</label>
          {catalogs.length === 0 && !creatingCatalog ? (
            <button
              onClick={() => setCreatingCatalog(true)}
              className="w-full border border-dashed border-accent/50 text-accent text-sm px-3 py-3 hover:border-accent flex items-center justify-center gap-1"
            >
              <Plus size={13} /> Create your first catalog
            </button>
          ) : creatingCatalog ? (
            <div className="space-y-2 border border-border bg-card p-3">
              <input
                autoFocus
                value={newCatalogName}
                onChange={(e) => setNewCatalogName(e.target.value)}
                placeholder="Catalog name (e.g. Wallflower Relic)"
                className={inp}
                style={{ fontSize: 16 }}
                onKeyDown={(e) => { if (e.key === "Enter") createCatalog(); if (e.key === "Escape") setCreatingCatalog(false); }}
              />
              <input
                value={newCatalogClient}
                onChange={(e) => setNewCatalogClient(e.target.value)}
                placeholder="Client (optional)"
                className={inp}
                style={{ fontSize: 16 }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={createCatalog} disabled={!newCatalogName.trim()} className="flex-1">Create</Button>
                <Button size="sm" variant="outline" onClick={() => { setCreatingCatalog(false); setNewCatalogName(""); setNewCatalogClient(""); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <select
                value={selectedCatalogId ?? ""}
                onChange={(e) => setSelectedCatalogId(e.target.value)}
                className={inp + " flex-1"}
              >
                {catalogs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.client_name ? ` — ${c.client_name}` : ""}</option>
                ))}
              </select>
              <button
                onClick={() => setCreatingCatalog(true)}
                className="text-muted hover:text-accent p-2"
                title="New catalog"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Catalog header actions */}
        {selectedCatalogId && (
          <CatalogHeader
            catalog={catalogs.find((c) => c.id === selectedCatalogId)!}
            onRename={(name) => renameCatalog(selectedCatalogId, name)}
            onDelete={() => deleteCatalog(selectedCatalogId)}
          />
        )}

        {/* Product list */}
        {selectedCatalogId && (
          <>
            <div className="flex items-center justify-between mt-4 mb-2">
              <p className={lbl + " mb-0"}>
                Products ({visibleProducts.length}{products.length !== visibleProducts.length ? ` of ${products.length}` : ""})
              </p>
              <button
                onClick={createProduct}
                className="text-accent hover:text-foreground text-xs flex items-center gap-1"
              >
                <Plus size={12} /> New
              </button>
            </div>
            <div className="flex-1 overflow-y-auto border border-border bg-card">
              {visibleProducts.length === 0 ? (
                <p className="text-xs text-muted italic p-3">
                  {showArchived ? "No archived products." : "No products yet."}
                </p>
              ) : (
                <ul>
                  {visibleProducts.map((p) => {
                    const active = p.id === selectedProductId;
                    return (
                      <li key={p.id}>
                        <button
                          onClick={() => setSelectedProductId(p.id)}
                          className={cn(
                            "w-full text-left px-3 py-2.5 border-b border-border last:border-b-0 transition-colors flex items-start gap-2",
                            active ? "bg-accent/10 border-l-2 border-l-accent" : "hover:bg-background",
                          )}
                        >
                          <Package size={13} className={cn("mt-0.5 shrink-0", active ? "text-accent" : "text-muted")} />
                          <div className="min-w-0 flex-1">
                            <p className={cn("text-sm truncate", active ? "text-accent font-medium" : "text-foreground")}>{p.name}</p>
                            {p.sku && <p className="text-[10px] text-muted truncate mt-0.5 font-mono">{p.sku}</p>}
                          </div>
                          {p.archived && <Archive size={11} className="text-muted mt-0.5" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-xs text-muted hover:text-foreground mt-2 flex items-center gap-1"
            >
              {showArchived ? <><ArchiveRestore size={11} /> Show active</> : <><Archive size={11} /> Show archived</>}
            </button>
          </>
        )}
      </div>

      {/* Right: product detail */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedProduct ? (
          <ProductDetail
            key={selectedProduct.id}
            product={selectedProduct}
            onUpdate={(patch) => updateProduct(selectedProduct.id, patch)}
            onDelete={() => deleteProduct(selectedProduct.id)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted">
            <Package size={40} className="mb-3 opacity-40" />
            <p className="text-sm">
              {!selectedCatalogId
                ? "Create a catalog to get started."
                : visibleProducts.length === 0
                  ? "Add your first product to this catalog."
                  : "Pick a product from the left to view or edit it."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Catalog Header (rename / delete) ───────────────────────────────────

function CatalogHeader({ catalog, onRename, onDelete }: {
  catalog: ProductCatalog;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(catalog.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-center gap-2 text-xs">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft.trim() && draft !== catalog.name) onRename(draft);
            else setDraft(catalog.name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setDraft(catalog.name); setEditing(false); }
          }}
          className="flex-1 bg-background border border-border px-2 py-1 text-foreground"
          style={{ fontSize: 14 }}
        />
      ) : (
        <>
          {catalog.client_name && (
            <span className="text-muted truncate flex-1">For: {catalog.client_name}</span>
          )}
          {!catalog.client_name && <span className="flex-1" />}
          <button onClick={() => setEditing(true)} className="text-muted hover:text-foreground p-1" title="Rename catalog"><Pencil size={11} /></button>
        </>
      )}
      {!confirmDelete ? (
        <button onClick={() => setConfirmDelete(true)} className="text-muted hover:text-red-500 p-1" title="Delete catalog"><Trash2 size={11} /></button>
      ) : (
        <div className="flex items-center gap-1">
          <span className="text-red-500">Delete?</span>
          <button onClick={onDelete} className="bg-red-500 text-white px-1.5 py-0.5">Yes</button>
          <button onClick={() => setConfirmDelete(false)} className="border border-border px-1.5 py-0.5 text-muted">No</button>
        </div>
      )}
    </div>
  );
}

// ─── Product Detail ─────────────────────────────────────────────────────

function ProductDetail({ product, onUpdate, onDelete }: {
  product: Product;
  onUpdate: (patch: Partial<Product>) => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Totals
  const materialsTotal = (product.materials || []).reduce(
    (s, m) => s + (Number(m.quantity) || 0) * (Number(m.unit_cost) || 0), 0,
  );
  const partsTotal = (product.parts || []).reduce(
    (s, p) => s + (Number(p.cost) || 0) * (Number(p.quantity) || 0), 0,
  );
  const laborTotal = (product.labor_items || []).reduce(
    (s, l) => s + (Number(l.hours) || 0) * (Number(l.rate) || 0), 0,
  );
  const subtotal = materialsTotal + partsTotal + laborTotal;
  const markupAmount = subtotal * ((Number(product.markup_percent) || 0) / 100);
  const grandTotal = subtotal + markupAmount;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0 flex-1">
          <input
            value={product.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Product name"
            className="w-full bg-transparent text-2xl font-semibold text-foreground focus:outline-none focus:border-b focus:border-accent"
          />
          <div className="flex items-center gap-3 mt-1">
            <input
              value={product.sku || ""}
              onChange={(e) => onUpdate({ sku: e.target.value || undefined })}
              placeholder="SKU (optional)"
              className="bg-transparent text-xs text-muted focus:outline-none focus:text-foreground font-mono"
              style={{ width: 200 }}
            />
            <span className="text-sm text-accent font-bold ml-auto">{money(grandTotal)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onUpdate({ archived: !product.archived })}
            className="p-1.5 text-muted hover:text-foreground"
            title={product.archived ? "Restore" : "Archive"}
          >
            {product.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="p-1.5 text-muted hover:text-red-500" title="Delete">
              <Trash2 size={15} />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-500">Delete?</span>
              <button onClick={onDelete} className="text-xs bg-red-500 text-white px-2 py-1">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs border border-border px-2 py-1 text-muted">No</button>
            </div>
          )}
        </div>
      </div>

      {/* Image + description side by side on wide, stacked on narrow */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5">
        <div>
          <p className={lbl}>Image</p>
          {product.image_url ? (
            <div className="relative border border-border bg-card">
              <img src={product.image_url} alt={product.name} className="w-full aspect-square object-cover" />
              <button
                onClick={() => onUpdate({ image_url: undefined })}
                className="absolute top-1 right-1 bg-background/80 text-muted hover:text-red-500 p-1"
                title="Remove image"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <ImageUpload
              onUploaded={(url) => onUpdate({ image_url: url })}
              label="Add image"
            />
          )}
        </div>
        <div>
          <p className={lbl}>Description</p>
          <textarea
            value={product.description || ""}
            onChange={(e) => onUpdate({ description: e.target.value || undefined })}
            placeholder="What it is, dimensions, finish, any details you want to remember between builds…"
            rows={6}
            className={inp + " resize-y min-h-[140px]"}
          />
        </div>
      </div>

      {/* Materials */}
      <MaterialsSection
        items={product.materials || []}
        onChange={(items) => onUpdate({ materials: items })}
        subtotal={materialsTotal}
      />

      {/* Parts */}
      <PartsSection
        items={product.parts || []}
        onChange={(items) => onUpdate({ parts: items })}
        subtotal={partsTotal}
      />

      {/* Labor */}
      <LaborSection
        items={product.labor_items || []}
        onChange={(items) => onUpdate({ labor_items: items })}
        subtotal={laborTotal}
      />

      {/* Cost breakdown */}
      <div className="border border-border bg-card p-4">
        <p className={lbl}>Cost Breakdown</p>
        <table className="w-full text-sm">
          <tbody>
            <tr><td className="py-1 text-muted">Materials</td><td className="py-1 text-right font-mono">{money(materialsTotal)}</td></tr>
            <tr><td className="py-1 text-muted">Parts</td><td className="py-1 text-right font-mono">{money(partsTotal)}</td></tr>
            <tr><td className="py-1 text-muted">Labor</td><td className="py-1 text-right font-mono">{money(laborTotal)}</td></tr>
            <tr className="border-t border-border">
              <td className="py-1 text-foreground">Subtotal</td>
              <td className="py-1 text-right font-mono">{money(subtotal)}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted flex items-center gap-2">
                Markup
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={product.markup_percent ?? 0}
                  onChange={(e) => onUpdate({ markup_percent: Number(e.target.value) || 0 })}
                  className="w-16 bg-background border border-border px-2 py-0.5 text-xs text-foreground focus:outline-none focus:border-accent"
                />
                <span className="text-xs text-muted">%</span>
              </td>
              <td className="py-1 text-right font-mono">{money(markupAmount)}</td>
            </tr>
            <tr className="border-t-2 border-accent/40">
              <td className="py-2 text-foreground font-bold">Total</td>
              <td className="py-2 text-right font-mono text-accent font-bold text-lg">{money(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Documents */}
      <DocumentsSection
        docs={product.documents || []}
        onChange={(docs) => onUpdate({ documents: docs })}
      />

      {/* Internal Notes */}
      <div>
        <p className={lbl}>Internal Notes</p>
        <textarea
          value={product.notes || ""}
          onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
          placeholder="Build notes, gotchas, supplier preferences, etc."
          rows={4}
          className={inp + " resize-y"}
        />
      </div>
    </div>
  );
}

// ─── Sections ───────────────────────────────────────────────────────────

function SectionShell({
  title, subtotal, count, children, onAdd,
}: {
  title: string; subtotal: number; count: number;
  children: React.ReactNode; onAdd: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-card px-4 py-2.5 flex items-center justify-between"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {open ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-muted" />}
          {title}
          <span className="text-xs text-muted font-normal">({count})</span>
        </span>
        <span className="text-sm font-mono text-foreground">{money(subtotal)}</span>
      </button>
      {open && (
        <div className="border-t border-border">
          {children}
          <div className="p-3 border-t border-border">
            <button
              onClick={onAdd}
              className="text-xs text-accent hover:text-foreground flex items-center gap-1"
            >
              <Plus size={12} /> Add row
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialsSection({ items, onChange, subtotal }: {
  items: ProductMaterial[]; onChange: (items: ProductMaterial[]) => void; subtotal: number;
}) {
  function update(id: string, patch: Partial<ProductMaterial>) {
    onChange(items.map((m) => m.id === id ? { ...m, ...patch } : m));
  }
  function remove(id: string) { onChange(items.filter((m) => m.id !== id)); }
  function add() {
    onChange([...items, {
      id: crypto.randomUUID(), description: "", quantity: 1, unit: "ea", unit_cost: 0,
    }]);
  }
  return (
    <SectionShell title="Materials" subtotal={subtotal} count={items.length} onAdd={add}>
      {items.length === 0 ? (
        <p className="text-xs text-muted italic px-4 py-3">No materials yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted border-b border-border">
              <th className="text-left px-3 py-2 font-normal">Description</th>
              <th className="text-right px-2 py-2 font-normal w-16">Qty</th>
              <th className="text-left px-2 py-2 font-normal w-20">Unit</th>
              <th className="text-right px-2 py-2 font-normal w-28">Unit Cost</th>
              <th className="text-right px-2 py-2 font-normal w-28">Line Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-b-0 group">
                <td className="px-2 py-1">
                  <input value={m.description} onChange={(e) => update(m.id, { description: e.target.value })} placeholder="Walnut board 8/4…" className="w-full bg-transparent text-sm text-foreground focus:outline-none focus:border-b focus:border-accent" />
                </td>
                <td className="px-2 py-1">
                  <input type="number" step="0.01" value={m.quantity} onChange={(e) => update(m.id, { quantity: Number(e.target.value) })} className="w-full bg-transparent text-right text-sm text-foreground font-mono focus:outline-none" />
                </td>
                <td className="px-2 py-1">
                  <input value={m.unit} onChange={(e) => update(m.id, { unit: e.target.value })} placeholder="ea" className="w-full bg-transparent text-sm text-foreground focus:outline-none" />
                </td>
                <td className="px-2 py-1">
                  <input type="number" step="0.01" value={m.unit_cost} onChange={(e) => update(m.id, { unit_cost: Number(e.target.value) })} className="w-full bg-transparent text-right text-sm text-foreground font-mono focus:outline-none" />
                </td>
                <td className="px-2 py-1 text-right font-mono text-sm">{money((m.quantity || 0) * (m.unit_cost || 0))}</td>
                <td className="px-1 py-1 text-center">
                  <button onClick={() => remove(m.id)} className="text-muted opacity-0 group-hover:opacity-100 hover:text-red-500"><X size={11} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionShell>
  );
}

function PartsSection({ items, onChange, subtotal }: {
  items: ProductPart[]; onChange: (items: ProductPart[]) => void; subtotal: number;
}) {
  function update(id: string, patch: Partial<ProductPart>) {
    onChange(items.map((p) => p.id === id ? { ...p, ...patch } : p));
  }
  function remove(id: string) { onChange(items.filter((p) => p.id !== id)); }
  function add() {
    onChange([...items, {
      id: crypto.randomUUID(), description: "", quantity: 1, source: "", cost: 0,
    }]);
  }
  return (
    <SectionShell title="Parts" subtotal={subtotal} count={items.length} onAdd={add}>
      {items.length === 0 ? (
        <p className="text-xs text-muted italic px-4 py-3">No parts yet — use this for hardware, fasteners, components, etc.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted border-b border-border">
              <th className="text-left px-3 py-2 font-normal">Description</th>
              <th className="text-right px-2 py-2 font-normal w-16">Qty</th>
              <th className="text-left px-2 py-2 font-normal w-28">Source</th>
              <th className="text-right px-2 py-2 font-normal w-24">Unit Cost</th>
              <th className="text-right px-2 py-2 font-normal w-28">Line Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-b-0 group">
                <td className="px-2 py-1">
                  <input value={p.description} onChange={(e) => update(p.id, { description: e.target.value })} placeholder="Hidden bracket…" className="w-full bg-transparent text-sm text-foreground focus:outline-none" />
                </td>
                <td className="px-2 py-1">
                  <input type="number" step="1" value={p.quantity} onChange={(e) => update(p.id, { quantity: Number(e.target.value) })} className="w-full bg-transparent text-right text-sm font-mono text-foreground focus:outline-none" />
                </td>
                <td className="px-2 py-1">
                  <input value={p.source || ""} onChange={(e) => update(p.id, { source: e.target.value })} placeholder="Amazon, McMaster, in-house…" className="w-full bg-transparent text-sm text-foreground focus:outline-none" />
                </td>
                <td className="px-2 py-1">
                  <input type="number" step="0.01" value={p.cost || 0} onChange={(e) => update(p.id, { cost: Number(e.target.value) })} className="w-full bg-transparent text-right text-sm font-mono text-foreground focus:outline-none" />
                </td>
                <td className="px-2 py-1 text-right font-mono text-sm">{money((p.cost || 0) * (p.quantity || 0))}</td>
                <td className="px-1 py-1 text-center">
                  <button onClick={() => remove(p.id)} className="text-muted opacity-0 group-hover:opacity-100 hover:text-red-500"><X size={11} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionShell>
  );
}

function LaborSection({ items, onChange, subtotal }: {
  items: ProductLaborItem[]; onChange: (items: ProductLaborItem[]) => void; subtotal: number;
}) {
  function update(id: string, patch: Partial<ProductLaborItem>) {
    onChange(items.map((l) => l.id === id ? { ...l, ...patch } : l));
  }
  function remove(id: string) { onChange(items.filter((l) => l.id !== id)); }
  function add() {
    onChange([...items, {
      id: crypto.randomUUID(), description: "Fabrication", hours: 0, rate: 60,
    }]);
  }
  return (
    <SectionShell title="Labor" subtotal={subtotal} count={items.length} onAdd={add}>
      {items.length === 0 ? (
        <p className="text-xs text-muted italic px-4 py-3">No labor entries yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted border-b border-border">
              <th className="text-left px-3 py-2 font-normal">Phase / Description</th>
              <th className="text-right px-2 py-2 font-normal w-20">Hours</th>
              <th className="text-right px-2 py-2 font-normal w-24">Rate $/hr</th>
              <th className="text-right px-2 py-2 font-normal w-28">Line Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-b-0 group">
                <td className="px-2 py-1">
                  <input value={l.description} onChange={(e) => update(l.id, { description: e.target.value })} placeholder="Fabrication, Finishing…" className="w-full bg-transparent text-sm text-foreground focus:outline-none" />
                </td>
                <td className="px-2 py-1">
                  <input type="number" step="0.25" value={l.hours} onChange={(e) => update(l.id, { hours: Number(e.target.value) })} className="w-full bg-transparent text-right text-sm font-mono text-foreground focus:outline-none" />
                </td>
                <td className="px-2 py-1">
                  <input type="number" step="1" value={l.rate} onChange={(e) => update(l.id, { rate: Number(e.target.value) })} className="w-full bg-transparent text-right text-sm font-mono text-foreground focus:outline-none" />
                </td>
                <td className="px-2 py-1 text-right font-mono text-sm">{money((l.hours || 0) * (l.rate || 0))}</td>
                <td className="px-1 py-1 text-center">
                  <button onClick={() => remove(l.id)} className="text-muted opacity-0 group-hover:opacity-100 hover:text-red-500"><X size={11} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionShell>
  );
}

// ─── Documents ──────────────────────────────────────────────────────────

function DocumentsSection({ docs, onChange }: {
  docs: ProductDocument[]; onChange: (d: ProductDocument[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  function addUpload(u: { url: string; name: string; size: number }) {
    onChange([...docs, {
      id: crypto.randomUUID(),
      name: u.name,
      url: u.url,
      kind: "upload",
      size_bytes: u.size,
      uploaded_at: new Date().toISOString(),
    }]);
  }

  function addLink() {
    if (!linkUrl.trim()) return;
    onChange([...docs, {
      id: crypto.randomUUID(),
      name: linkName.trim() || linkUrl.trim(),
      url: linkUrl.trim(),
      kind: "link",
      uploaded_at: new Date().toISOString(),
    }]);
    setLinkName("");
    setLinkUrl("");
    setAdding(false);
  }

  function removeDoc(id: string) {
    onChange(docs.filter((d) => d.id !== id));
  }

  return (
    <div className="border border-border">
      <div className="bg-card px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm font-medium">Documents <span className="text-xs text-muted font-normal">({docs.length})</span></span>
      </div>
      <div className="border-t border-border">
        {docs.length === 0 ? (
          <p className="text-xs text-muted italic px-4 py-3">No documents attached yet. Upload PDFs / spec sheets, or paste a link to Dropbox / Google Drive.</p>
        ) : (
          <ul>
            {docs.map((d) => (
              <li key={d.id} className="px-4 py-2.5 border-b border-border last:border-b-0 flex items-center gap-3 group">
                {d.kind === "link" ? <LinkIcon size={14} className="text-muted shrink-0" /> : <FileText size={14} className="text-muted shrink-0" />}
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm text-foreground hover:text-accent flex items-center gap-1.5 truncate">
                  <span className="truncate">{d.name}</span>
                  <ExternalLink size={10} className="text-muted opacity-0 group-hover:opacity-100" />
                </a>
                {d.size_bytes && (
                  <span className="text-xs text-muted shrink-0">{(d.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                )}
                <button onClick={() => removeDoc(d.id)} className="text-muted opacity-0 group-hover:opacity-100 hover:text-red-500 shrink-0" title="Remove"><X size={12} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <FileUpload onUploaded={(u) => addUpload({ url: u.url, name: u.name, size: u.size })} label="Upload file" />
            <button
              onClick={() => setAdding((a) => !a)}
              className="text-xs text-accent hover:text-foreground border border-dashed border-accent/50 px-3 py-2 hover:border-accent flex items-center gap-1.5"
            >
              <LinkIcon size={12} /> Add link
            </button>
          </div>
          {adding && (
            <div className="flex gap-2 items-center">
              <input
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder="Label (optional)"
                className={inp + " flex-1"}
                style={{ fontSize: 16 }}
              />
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                className={inp + " flex-1"}
                style={{ fontSize: 16 }}
              />
              <Button size="sm" onClick={addLink} disabled={!linkUrl.trim()}>Add</Button>
              <button onClick={() => { setAdding(false); setLinkName(""); setLinkUrl(""); }} className="text-muted p-1"><X size={13} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
