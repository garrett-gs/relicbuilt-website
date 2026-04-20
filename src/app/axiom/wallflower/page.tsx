"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { useAuth } from "@/components/axiom/AuthProvider";
import { WallflowerWorkOrder, TeamMember } from "@/types/axiom";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  Plus, X, Search, Trash2, Calculator, ClipboardList,
  ExternalLink, Copy, Check, ChevronDown,
} from "lucide-react";
import { useRouter } from "next/navigation";

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  accepted: "#3b82f6",
  in_progress: "#8b5cf6",
  estimated: "#22c55e",
  complete: "#6b7280",
  cancelled: "#ef4444",
};

const STATUS_OPTIONS = ["pending", "accepted", "in_progress", "estimated", "complete", "cancelled"];
const WORK_TYPES = ["Repair", "Fabrication", "Refinish", "Install", "Custom Build", "Modification", "Other"];
const SCOPES = ["Internal", "External", "Client-Facing", "Warranty"];

const inp = "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent";
const lbl = "text-xs uppercase tracking-wider text-muted block mb-1.5";

export default function WallflowerPage() {
  const { userEmail } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<WallflowerWorkOrder[]>([]);
  const [selected, setSelected] = useState<WallflowerWorkOrder | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [portalUrl, setPortalUrl] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);

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
    // Build portal URL
    if (typeof window !== "undefined") {
      setPortalUrl(`${window.location.origin}/wallflower`);
    }
  }, []);

  function copyPortalUrl() {
    navigator.clipboard.writeText(portalUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  const filtered = orders.filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
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
    }).select().single();

    if (data) {
      // Link estimate to work order
      await axiom.from("wallflower_work_orders").update({
        estimate_id: data.id,
        status: "estimated",
        updated_at: new Date().toISOString(),
      }).eq("id", wo.id);

      await logActivity({
        action: "created",
        entity: "estimate",
        entity_id: data.id,
        label: `Created estimate ${estimate_number} from Wallflower work order`,
        user_name: userEmail,
      });

      router.push("/axiom/estimator");
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Left — list */}
      <div className="w-80 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <ClipboardList size={22} className="text-accent" />
              Wallflower RELIC
            </h1>
            <p className="text-muted text-sm mt-0.5">{orders.length} work orders</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-1" /> New
          </Button>
        </div>

        {/* Portal link */}
        <div className="bg-card border border-border p-3 mb-3 flex items-center gap-2">
          <ExternalLink size={12} className="text-muted shrink-0" />
          <span className="text-xs text-muted truncate flex-1">Portal link for Wallflower</span>
          <button onClick={copyPortalUrl} className="text-accent text-xs flex items-center gap-1 shrink-0">
            {copiedUrl ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>

        {/* Search + filter */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search work orders..."
              className="w-full bg-card border border-border pl-9 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-card border border-border px-2 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
          >
            <option value="all">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {filtered.length === 0 && (
            <p className="text-muted text-sm text-center py-8">
              {orders.length === 0 ? "No work orders yet." : "No matches."}
            </p>
          )}
          {filtered.map((wo) => {
            const active = selected?.id === wo.id;
            return (
              <div
                key={wo.id}
                onClick={() => setSelected(wo)}
                className={cn(
                  "bg-card border border-border p-3 cursor-pointer transition-colors",
                  active ? "border-accent" : "hover:border-accent/40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{wo.item_name}</p>
                    <p className="text-muted text-xs">{wo.work_type} · {wo.scope}</p>
                    {wo.deadline && (
                      <p className="text-xs text-muted mt-0.5">Due: {new Date(wo.deadline).toLocaleDateString()}</p>
                    )}
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border shrink-0"
                    style={{ color: STATUS_COLORS[wo.status], borderColor: STATUS_COLORS[wo.status] + "40" }}
                  >
                    {wo.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right — detail */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex flex-col items-center justify-center text-muted text-sm gap-3">
            <ClipboardList size={48} className="text-muted/20" />
            <p>Select a work order or create a new one</p>
          </div>
        ) : (
          <OrderDetail
            key={selected.id}
            order={selected}
            teamMembers={teamMembers}
            onUpdate={(u) => updateOrder(selected.id, u)}
            onDelete={() => deleteOrder(selected.id)}
            onCreateEstimate={() => createEstimate(selected)}
          />
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          teamMembers={teamMembers}
          onSubmit={createOrder}
          onClose={() => setShowCreate(false)}
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
                {WORK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
              <input type="date" className={inp} value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className={lbl}>Description of Work</label>
            <textarea className={inp + " min-h-[80px] resize-y"} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe the work needed..." />
          </div>

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

function OrderDetail({ order, teamMembers, onUpdate, onDelete, onCreateEstimate }: {
  order: WallflowerWorkOrder;
  teamMembers: TeamMember[];
  onUpdate: (u: Partial<WallflowerWorkOrder>) => void;
  onDelete: () => void;
  onCreateEstimate: () => void;
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
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function markDirty() { setDirty(true); setSaved(false); }

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
    });
    setDirty(false);
    setSaved(true);
  }

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
            <option key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
          ))}
        </select>
      </div>

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
            {WORK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
          <input type="date" className={inp} value={deadline} onChange={(e) => { setDeadline(e.target.value); markDirty(); }} />
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

      {/* Linked estimate */}
      {order.estimate_id && (
        <div className="bg-card border border-accent/30 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted mb-1">Linked Estimate</p>
            <p className="text-sm text-accent font-mono">Estimate created</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.href = "/axiom/estimator"}>
            <Calculator size={14} className="mr-1" /> View in Estimator
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-border flex-wrap items-center">
        <Button onClick={save} disabled={!dirty}>
          {saved ? <><Check size={14} className="mr-1" /> Saved</> : "Save Changes"}
        </Button>

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
