"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { useAutosave } from "@/components/axiom/useAutosave";
import { WallflowerWorkOrder, TeamMember, NexusRef } from "@/types/axiom";
import NexusRefPicker from "@/components/axiom/NexusRefPicker";
import Button from "@/components/ui/Button";
import SaveButton from "@/components/ui/SaveButton";
import DateField from "@/components/ui/DateField";
import EstimateDrawer from "@/components/axiom/EstimateDrawer";
import { cn, formatDueDate } from "@/lib/utils";
import {
  Plus, X, Search, Trash2, Calculator, ClipboardList,
  Image as ImageIcon, Loader2, Upload, Paperclip,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  accepted: "#3b82f6",
  in_progress: "#8b5cf6",
  estimated: "#22c55e",
  complete: "#6b7280",
  cancelled: "#ef4444",
};

const STATUS_OPTIONS = ["pending", "accepted", "in_progress", "estimated", "complete", "cancelled"];
// Union of Nexus's work-type vocabulary (the source for inbound orders:
// New Build, Touch-Up, Clean, Repaint, Structural Fix, Upholstery,
// Hardware Replace) and Axiom's own local types (Fabrication, Install, …),
// so a category set in Nexus always has a matching option here.
const WORK_TYPES = [
  "New Build", "Repair", "Touch-Up", "Refinish", "Clean", "Repaint",
  "Structural Fix", "Upholstery", "Hardware Replace",
  "Fabrication", "Install", "Custom Build", "Modification",
  "Other",
];
// If a stored value isn't in the list (e.g. a new Nexus category we don't
// know yet), surface it as its own option so the select never silently
// falls back to showing the wrong type.
function workTypeOptions(current?: string): string[] {
  return current && !WORK_TYPES.includes(current) ? [current, ...WORK_TYPES] : WORK_TYPES;
}
const SCOPES = ["Internal", "External", "Client-Facing", "Warranty"];

// One display label per status value, shared by the board columns and the
// detail status dropdown so they never drift. "pending" reads as "New"
// (inbound Nexus orders land here); "cancelled" reads as "Canceled".
const STATUS_LABELS: Record<string, string> = {
  pending: "New",
  estimated: "Estimated",
  accepted: "Accepted",
  in_progress: "In Progress",
  complete: "Complete",
  cancelled: "Canceled",
};

// Board columns, left→right in workflow order. Each maps to a status value.
// "In Progress" is included so accepted-and-underway orders aren't hidden —
// every possible status has a home here (nothing silently drops off the board).
const COLUMNS: { key: WallflowerWorkOrder["status"]; label: string }[] = [
  { key: "pending", label: STATUS_LABELS.pending },
  { key: "estimated", label: STATUS_LABELS.estimated },
  { key: "accepted", label: STATUS_LABELS.accepted },
  { key: "in_progress", label: STATUS_LABELS.in_progress },
  { key: "complete", label: STATUS_LABELS.complete },
  { key: "cancelled", label: STATUS_LABELS.cancelled },
];
const COLUMN_KEYS = new Set<string>(COLUMNS.map((c) => c.key));

const inp = "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";

export default function WallflowerPage() {
  const { userEmail } = useAuth();
  const [orders, setOrders] = useState<WallflowerWorkOrder[]>([]);
  const [selected, setSelected] = useState<WallflowerWorkOrder | null>(null);
  const [drawerEstimateId, setDrawerEstimateId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const load = useCallback(async () => {
    const { data } = await axiom
      .from("wallflower_work_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setOrders(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    axiom.from("settings").select("team_members").limit(1).single().then(({ data }) => {
      if (data?.team_members) setTeamMembers(data.team_members.filter((m: TeamMember) => m.name));
    });
  }, []);

  const filtered = orders.filter((o) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        o.item_name.toLowerCase().includes(q) ||
        (o.description || "").toLowerCase().includes(q) ||
        (o.work_type || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Bucket orders into their status column. Any unexpected status value lands
  // in a trailing "Other" column so an order can never vanish from the board.
  const grouped = filtered.reduce<Record<string, WallflowerWorkOrder[]>>((acc, o) => {
    const key = COLUMN_KEYS.has(o.status) ? o.status : "__other";
    (acc[key] ||= []).push(o);
    return acc;
  }, {});
  const boardColumns: { key: string; label: string }[] = [...COLUMNS];
  if (grouped["__other"]?.length) boardColumns.push({ key: "__other", label: "Other" });

  async function createOrder(form: Partial<WallflowerWorkOrder>) {
    const { data } = await axiom.from("wallflower_work_orders").insert({
      item_name: form.item_name || "Untitled",
      item_source: form.item_source || "custom",
      work_type: form.work_type || "Repair",
      scope: form.scope || "Internal",
      assigned_to: form.assigned_to || null,
      deadline: form.deadline || null,
      status: "pending",
      description: form.description || null,
      quantity: form.quantity || 1,
      submitted_by: form.submitted_by || userEmail,
      nexus_ref: form.nexus_ref || null,
    }).select().single();
    if (data) {
      await logActivity({
        action: "created",
        entity: "wallflower_work_order",
        entity_id: data.id,
        label: `New Wallflower work order: ${form.item_name}`,
        user_name: userEmail,
      });
      load();
      setSelected(data);
      setShowCreate(false);
    }
  }

  async function updateOrder(id: string, updates: Partial<WallflowerWorkOrder>) {
    await axiom.from("wallflower_work_orders").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    load();
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, ...updates } : prev);
    // Mirror status changes back to Wallflower. The /api/wallflower-status
    // route looks up the wallflower_order_id, dedupes against the last sent
    // value, and swallows errors so we never block the local update.
    if (updates.status) {
      fetch("/api/wallflower-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { workOrderId: id }, status: updates.status }),
      }).catch((err) => console.error("[wallflower-status] notify failed:", err));
    }
  }

  async function deleteOrder(id: string) {
    await axiom.from("wallflower_work_orders").delete().eq("id", id);
    await logActivity({ action: "deleted", entity: "wallflower_work_order", entity_id: id, label: "Deleted Wallflower work order", user_name: userEmail });
    setSelected(null);
    load();
  }

  async function createEstimate(wo: WallflowerWorkOrder) {
    // Generate estimate number
    const year = new Date().getFullYear();
    const { data: latest } = await axiom.from("estimates")
      .select("estimate_number")
      .like("estimate_number", `EST-${year}-%`)
      .order("estimate_number", { ascending: false })
      .limit(1)
      .single();
    const lastNum = latest?.estimate_number ? parseInt(latest.estimate_number.split("-").pop() || "0", 10) : 0;
    const estimate_number = `EST-${year}-${String(lastNum + 1).padStart(4, "0")}`;

    const { data } = await axiom.from("estimates").insert({
      estimate_number,
      project_name: `Wallflower — ${wo.item_name}`,
      client_name: wo.assigned_to || "",
      status: "draft",
      line_items: [],
      labor_items: [],
      markup_percent: 0,
      notes: [
        `Work Order: ${wo.item_name}`,
        `Type: ${wo.work_type}`,
        `Scope: ${wo.scope}`,
        wo.description ? `Description: ${wo.description}` : "",
        wo.quantity > 1 ? `Quantity: ${wo.quantity}` : "",
      ].filter(Boolean).join("\n"),
      images: wo.images && wo.images.length > 0 ? wo.images : undefined,
    }).select().single();

    if (data) {
      // Link estimate to work order
      await axiom.from("wallflower_work_orders").update({
        estimate_id: data.id,
        status: "estimated",
        updated_at: new Date().toISOString(),
      }).eq("id", wo.id);

      // Tell Wallflower we've quoted it. Non-blocking.
      fetch("/api/wallflower-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { workOrderId: wo.id }, status: "estimated" }),
      }).catch((err) => console.error("[wallflower-status] notify failed:", err));

      await logActivity({
        action: "created",
        entity: "estimate",
        entity_id: data.id,
        label: `Created estimate ${estimate_number} from Wallflower work order`,
        user_name: userEmail,
      });

      // Reflect the new link locally and open the editor inline.
      setSelected((prev) => prev && prev.id === wo.id ? { ...prev, estimate_id: data.id, status: "estimated" } : prev);
      load();
      setDrawerEstimateId(data.id);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <ClipboardList size={22} className="text-accent" />
            Work Orders
          </h1>
          <p className="text-muted text-sm mt-0.5">{orders.length} work orders</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search work orders..."
              className="w-56 bg-card border border-border pl-9 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
            />
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-1" /> New
          </Button>
        </div>
      </div>

      {/* Board — one column per status */}
      {orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted text-sm gap-3">
          <ClipboardList size={48} className="text-muted/20" />
          <p>No work orders yet. They arrive from Nexus, or add one with “New”.</p>
        </div>
      ) : (
        <div className="flex-1 flex gap-4 overflow-x-auto pb-2 min-h-0">
          {boardColumns.map((col) => {
            const items = grouped[col.key] || [];
            const dot = STATUS_COLORS[col.key] || "#6b7280";
            return (
              <div key={col.key} className="w-72 shrink-0 flex flex-col border border-border bg-card/20 min-h-0">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
                    <span className="text-xs uppercase tracking-wider font-medium text-foreground">{col.label}</span>
                  </div>
                  <span className="text-xs text-muted tabular-nums">{items.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                  {items.length === 0 && (
                    <p className="text-muted/50 text-xs text-center py-6">—</p>
                  )}
                  {items.map((wo) => {
                    const active = selected?.id === wo.id;
                    const thumbUrl = wo.item_image_url || wo.reference_images?.[0]?.url;
                    const imgCount = (wo.item_image_url ? 1 : 0) + (wo.reference_images?.length || 0);
                    return (
                      <div
                        key={wo.id}
                        onClick={() => setSelected(wo)}
                        className={cn(
                          "bg-card border border-border p-3 cursor-pointer transition-colors",
                          active ? "border-accent" : "hover:border-accent/40"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {thumbUrl && (
                            <div className="relative shrink-0">
                              <img src={thumbUrl} alt="" className="w-10 h-10 object-cover border border-border" />
                              {imgCount > 1 && (
                                <span className="absolute -bottom-1 -right-1 bg-background border border-border text-[9px] leading-none px-1 py-0.5 text-muted flex items-center gap-0.5">
                                  <Paperclip size={8} />{imgCount}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{wo.item_name}</p>
                            <p className="text-muted text-xs truncate">{wo.work_type} · {wo.scope}</p>
                            {wo.nexus_ref && (
                              <p className="text-accent/80 text-[11px] mt-0.5 truncate" title={`Nexus ${wo.nexus_ref.type} ${wo.nexus_ref.number}`}>
                                ↗ {wo.nexus_ref.number}
                              </p>
                            )}
                            {wo.deadline && (() => {
                              const due = formatDueDate(wo.deadline);
                              return (
                                <p className={`text-xs mt-0.5 ${due.soon ? "text-orange-400 font-medium" : "text-muted"}`}>
                                  Due: {due.text}
                                </p>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail — slide-over drawer */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelected(null)} />
          <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-background border-l border-border z-40 overflow-y-auto p-6">
            <button
              onClick={() => setSelected(null)}
              className="absolute top-4 right-4 text-muted hover:text-foreground"
              title="Close"
            >
              <X size={20} />
            </button>
            <OrderDetail
              key={selected.id}
              order={selected}
              teamMembers={teamMembers}
              onUpdate={(u) => updateOrder(selected.id, u)}
              onDelete={() => deleteOrder(selected.id)}
              onCreateEstimate={() => createEstimate(selected)}
              onViewEstimate={() => selected.estimate_id && setDrawerEstimateId(selected.estimate_id)}
            />
          </div>
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          teamMembers={teamMembers}
          onSubmit={createOrder}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Inline estimate editor */}
      {drawerEstimateId && (
        <EstimateDrawer
          estimateId={drawerEstimateId}
          onClose={() => setDrawerEstimateId(null)}
          onChange={load}
        />
      )}
    </div>
  );
}

// ── Create Modal ─────────────────────────────────────────────

function CreateModal({ teamMembers, onSubmit, onClose }: {
  teamMembers: TeamMember[];
  onSubmit: (f: Partial<WallflowerWorkOrder>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    item_name: "",
    item_source: "custom" as "inventory" | "custom",
    work_type: "Repair",
    scope: "Internal",
    assigned_to: "",
    deadline: "",
    description: "",
    quantity: 1,
    nexus_ref: null as NexusRef | null,
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-bold">New Work Order</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className={lbl}>Item Name <span className="text-accent">*</span></label>
            <input className={inp} value={form.item_name} onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))} placeholder="e.g. Oak Dining Table Repair" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Item Source</label>
              <select className={inp} value={form.item_source} onChange={(e) => setForm((f) => ({ ...f, item_source: e.target.value as "inventory" | "custom" }))}>
                <option value="custom">Custom Item</option>
                <option value="inventory">From Inventory</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Quantity</label>
              <input type="number" min={1} className={inp} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Work Type</label>
              <select className={inp} value={form.work_type} onChange={(e) => setForm((f) => ({ ...f, work_type: e.target.value }))}>
                {workTypeOptions(form.work_type).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Scope</label>
              <select className={inp} value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
                {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Assigned To</label>
              <select className={inp} value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}>
                <option value="">— Unassigned —</option>
                {teamMembers.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Deadline</label>
              <DateField
                value={form.deadline}
                onChange={(v) => setForm((f) => ({ ...f, deadline: v }))}
                inputClassName={`${inp} hover:border-accent transition-colors text-left`}
              />
            </div>
          </div>

          <div>
            <label className={lbl}>Description of Work</label>
            <textarea className={inp + " min-h-[80px] resize-y"} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe the work needed..." />
          </div>

          <NexusRefPicker
            value={form.nexus_ref}
            onChange={(ref) => setForm((f) => ({ ...f, nexus_ref: ref }))}
          />

          <div className="flex gap-3 pt-2">
            <Button onClick={() => onSubmit(form)} disabled={!form.item_name.trim()}>Create Work Order</Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Order Detail ─────────────────────────────────────────────

function OrderDetail({ order, teamMembers, onUpdate, onDelete, onCreateEstimate, onViewEstimate }: {
  order: WallflowerWorkOrder;
  teamMembers: TeamMember[];
  onUpdate: (u: Partial<WallflowerWorkOrder>) => void;
  onDelete: () => void;
  onCreateEstimate: () => void;
  onViewEstimate: () => void;
}) {
  const [itemName, setItemName] = useState(order.item_name);
  const [itemSource, setItemSource] = useState(order.item_source);
  const [workType, setWorkType] = useState(order.work_type);
  const [scope, setScope] = useState(order.scope);
  const [assignedTo, setAssignedTo] = useState(order.assigned_to || "");
  const [deadline, setDeadline] = useState(order.deadline || "");
  const [status, setStatus] = useState(order.status);
  const [description, setDescription] = useState(order.description || "");
  const [quantity, setQuantity] = useState(order.quantity || 1);
  const [notes, setNotes] = useState(order.notes || "");
  const [images, setImages] = useState<string[]>(order.images || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rev, setRev] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function markDirty() { setDirty(true); setSaved(false); setRev((r) => r + 1); }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploadError("");
    setUploading(true);
    const newUrls: string[] = [];
    for (const file of Array.from(fileList)) {
      // JPEG and PNG only — keeps the gallery clean and Supabase happy
      if (file.type !== "image/jpeg" && file.type !== "image/png") {
        setUploadError("Only JPEG and PNG images are supported.");
        continue;
      }
      if (file.size > 15 * 1024 * 1024) {
        setUploadError(`"${file.name}" is over 15 MB.`);
        continue;
      }
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `wallflower-photos/${order.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await axiom.storage.from("portal-images").upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) {
        setUploadError(`Upload failed for "${file.name}".`);
        continue;
      }
      const { data } = axiom.storage.from("portal-images").getPublicUrl(path);
      newUrls.push(data.publicUrl);
    }
    if (newUrls.length > 0) {
      setImages((prev) => [...prev, ...newUrls]);
      markDirty();
    }
    setUploading(false);
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
    markDirty();
  }

  function save() {
    onUpdate({
      item_name: itemName,
      item_source: itemSource,
      work_type: workType,
      scope,
      assigned_to: assignedTo || undefined,
      deadline: deadline || undefined,
      status,
      description: description || undefined,
      quantity,
      notes: notes || undefined,
      images: images.length > 0 ? images : undefined,
    });
    setDirty(false);
    setSaved(true);
  }

  useAutosave(dirty, rev, save);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <input
            value={itemName}
            onChange={(e) => { setItemName(e.target.value); markDirty(); }}
            className="text-2xl font-heading font-bold bg-transparent border-none focus:outline-none text-foreground w-full"
          />
          <div className="flex items-center gap-3 mt-1 text-sm text-muted">
            <span>{workType}</span>
            <span>·</span>
            <span>{scope}</span>
            {order.submitted_by && (
              <>
                <span>·</span>
                <span>Submitted by {order.submitted_by}</span>
              </>
            )}
          </div>
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as WallflowerWorkOrder["status"]); markDirty(); }}
          className="bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent shrink-0"
          style={{ color: STATUS_COLORS[status] }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
          ))}
        </select>
      </div>

      {/* Inbound from Wallflower — item photo + reference images (read-only).
          These live on Wallflower's public storage; we only render the URLs. */}
      {(order.item_image_url || (order.reference_images && order.reference_images.length > 0)) && (
        <div className="bg-card border border-border p-4 space-y-4">
          <p className="text-xs uppercase tracking-wider text-muted">From Wallflower</p>

          {order.item_image_url && (
            <div>
              <div className={lbl}>Item</div>
              <a href={order.item_image_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={order.item_image_url}
                  alt={order.item_name}
                  className="w-32 h-32 object-cover border border-border hover:opacity-90 transition-opacity"
                />
              </a>
            </div>
          )}

          {order.reference_images && order.reference_images.length > 0 && (
            <div>
              <div className={cn(lbl, "flex items-center gap-1.5")}>
                <Paperclip size={12} />
                Reference / Inspiration ({order.reference_images.length})
              </div>
              <div className="grid grid-cols-4 gap-2">
                {order.reference_images.map((img, i) => (
                  <a
                    key={i}
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={img.name || ""}
                    className="aspect-square overflow-hidden border border-border bg-card hover:opacity-90 transition-opacity"
                  >
                    <img src={img.url} alt={img.name || ""} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className={lbl}>Item Source</label>
          <select className={inp} value={itemSource} onChange={(e) => { setItemSource(e.target.value as "inventory" | "custom"); markDirty(); }}>
            <option value="custom">Custom Item</option>
            <option value="inventory">From Inventory</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Work Type</label>
          <select className={inp} value={workType} onChange={(e) => { setWorkType(e.target.value); markDirty(); }}>
            {workTypeOptions(workType).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Scope</label>
          <select className={inp} value={scope} onChange={(e) => { setScope(e.target.value); markDirty(); }}>
            {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Assigned To</label>
          <select className={inp} value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); markDirty(); }}>
            <option value="">— Unassigned —</option>
            {teamMembers.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Deadline</label>
          <DateField
            value={deadline}
            onChange={(v) => { setDeadline(v); markDirty(); }}
            inputClassName={`${inp} hover:border-accent transition-colors text-left`}
          />
        </div>
        <div>
          <label className={lbl}>Quantity</label>
          <input type="number" min={1} className={inp} value={quantity} onChange={(e) => { setQuantity(parseInt(e.target.value) || 1); markDirty(); }} />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className={lbl}>Description of Work</label>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); markDirty(); }}
          className={inp + " min-h-[120px] resize-y"}
          placeholder="Detailed description of work requested..."
        />
      </div>

      {/* Notes */}
      <div>
        <label className={lbl}>Internal Notes</label>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); markDirty(); }}
          className={inp + " min-h-[80px] resize-y"}
          placeholder="Internal notes (not visible to Wallflower)..."
        />
      </div>

      {/* Photos */}
      <div>
        <label className={lbl}>
          <ImageIcon size={12} className="inline mr-1.5" />
          Photos
          {images.length > 0 && <span className="text-muted ml-2">({images.length})</span>}
        </label>
        {images.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-3">
            {images.map((url) => (
              <div key={url} className="relative group aspect-square">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt="Work order photo" className="w-full h-full object-cover border border-border" />
                </a>
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  title="Remove photo"
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground border border-dashed border-border px-4 py-3 hover:border-accent/50 transition-colors cursor-pointer">
          {uploading ? (
            <><Loader2 size={13} className="animate-spin" /> Uploading…</>
          ) : (
            <><Upload size={13} /> Add Photos (JPEG / PNG)</>
          )}
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png"
            className="hidden"
            disabled={uploading}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
        </label>
        {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
        <p className="text-xs text-muted mt-2">Photos transfer to the estimate and project when you convert this work order.</p>
      </div>

      {/* Nexus reference — link to a Nexus order or quote */}
      <NexusRefPicker
        value={order.nexus_ref ?? null}
        onChange={(ref) => onUpdate({ nexus_ref: ref })}
      />

      {/* Linked estimate */}
      {order.estimate_id && (
        <div className="bg-card border border-accent/30 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted mb-1">Linked Estimate</p>
            <p className="text-sm text-accent font-mono">Estimate created</p>
          </div>
          <Button variant="outline" size="sm" onClick={onViewEstimate}>
            <Calculator size={14} className="mr-1" /> View / Edit Estimate
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-border flex-wrap items-center">
        <SaveButton dirty={dirty} saved={saved} onClick={save} />

        {!order.estimate_id && (
          <Button variant="outline" onClick={onCreateEstimate}>
            <Calculator size={14} className="mr-1" /> Create Estimate
          </Button>
        )}

        {confirmDelete ? (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-red-500 text-sm">Delete this work order?</span>
            <Button variant="outline" size="sm" onClick={onDelete}>Yes, Delete</Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-muted hover:text-red-500 text-sm flex items-center gap-1 ml-auto">
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
