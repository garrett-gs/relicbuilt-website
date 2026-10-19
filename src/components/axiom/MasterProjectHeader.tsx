"use client";

import { useState } from "react";
import Link from "next/link";
import { axiom } from "@/lib/axiom-supabase";
import { logActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";
import { CustomWork, Estimate, MasterProject, BusinessEntity } from "@/types/axiom";
import { masterPnl, estimateTotal, ExpenseLite } from "@/lib/master-pnl";
import { Layers, ChevronDown, ChevronRight, DollarSign, Plus, X, Check } from "lucide-react";

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
const money2 = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

/**
 * The master-project grouping, shown as a header on a single project. Replaces
 * the standalone Master Projects page: assign/create a master here, and when a
 * project belongs to one, this shows the rollup P&L and the sibling builds —
 * all grouped under the one parent.
 */
export default function MasterProjectHeader({
  project, projects, estimates, expenses, masters, entity, userEmail, onOpenProject, onChanged,
}: {
  project: CustomWork;
  projects: CustomWork[];
  estimates: Estimate[];
  expenses: ExpenseLite[];
  masters: MasterProject[];
  entity: BusinessEntity;
  userEmail: string;
  onOpenProject: (id: string) => void;
  onChanged: () => void;
}) {
  const master = masters.find((m) => m.id === project.master_project_id) || null;
  const [open, setOpen] = useState(true);
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  // Assign this project (and its linked estimate, so the rollup stays correct)
  // to a master — or detach when masterId is null.
  async function assign(masterId: string | null) {
    setBusy(true);
    await axiom.from("custom_work").update({ master_project_id: masterId, updated_at: new Date().toISOString() }).eq("id", project.id);
    await axiom.from("estimates").update({ master_project_id: masterId }).eq("custom_work_id", project.id);
    setBusy(false); setPicking(false); setCreating(false); setNewName("");
    onChanged();
  }

  async function createAndAssign() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { data } = await axiom.from("master_projects").insert({ entity, name, client_name: project.client_name || null }).select().single();
    if (data) {
      await logActivity({ action: "created", entity: "master_project", entity_id: data.id, label: `Created master project: ${name}`, user_name: userEmail });
      await axiom.from("custom_work").update({ master_project_id: data.id, updated_at: new Date().toISOString() }).eq("id", project.id);
      await axiom.from("estimates").update({ master_project_id: data.id }).eq("custom_work_id", project.id);
    }
    setBusy(false); setCreating(false); setPicking(false); setNewName("");
    onChanged();
  }

  async function updateFinance(patch: { charged_amount?: number | null; tax_collected?: number | null }) {
    if (!master) return;
    await axiom.from("master_projects").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", master.id);
    onChanged();
  }

  // ── No master yet: just the assign/create control ──────────────────────────
  if (!master) {
    return (
      <div className="bg-card border border-border p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Layers size={15} className="text-muted shrink-0" />
          <span className="text-xs uppercase tracking-wider text-muted">Master Project</span>
          {creating ? (
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <input
                autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createAndAssign(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
                placeholder="New master project name…"
                className="flex-1 bg-background border border-border px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <button onClick={createAndAssign} disabled={busy || !newName.trim()} className="text-accent hover:opacity-80 disabled:opacity-40" title="Create & link"><Check size={16} /></button>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="text-muted hover:text-foreground"><X size={16} /></button>
            </div>
          ) : (
            <>
              <select
                value="" disabled={busy}
                onChange={(e) => { if (e.target.value === "__new__") setCreating(true); else if (e.target.value) assign(e.target.value); }}
                className="bg-background border border-border px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
              >
                <option value="">Link to a master project…</option>
                {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value="__new__">＋ New master project…</option>
              </select>
              <span className="text-xs text-muted">Group this build with related ones.</span>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Has a master: full grouped header ──────────────────────────────────────
  const pnl = masterPnl(master, estimates, projects, expenses);
  const siblings = [
    ...pnl.estChildren.map((e) => ({
      key: e.id,
      name: e.project_name || e.estimate_number,
      sub: e.estimate_number,
      amount: estimateTotal(e),
      cwId: e.custom_work_id || null,
      estId: e.id,
    })),
    ...pnl.cwOrphans.map((p) => ({
      key: p.id, name: p.project_name, sub: "Project", amount: p.quoted_amount || 0, cwId: p.id, estId: null as string | null,
    })),
  ];

  return (
    <div className="bg-card border border-accent/40 mb-4">
      {/* Header row */}
      <div className="p-3 flex items-start justify-between gap-3">
        <button onClick={() => setOpen((o) => !o)} className="flex items-start gap-2 text-left min-w-0 flex-1">
          {open ? <ChevronDown size={16} className="mt-0.5 shrink-0 text-muted" /> : <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-accent shrink-0" />
              <span className="text-[10px] uppercase tracking-widest text-muted">Master Project</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="font-bold truncate">{master.name}</p>
              <span className="text-[11px] text-muted">({pnl.childCount} {pnl.childCount === 1 ? "build" : "builds"})</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs">
              <span className="inline-flex items-center gap-1 text-accent font-mono"><DollarSign size={12} />{money(pnl.quoted)} quoted</span>
              <span className={cn("font-mono", pnl.profit >= 0 ? "text-accent" : "text-red-500")}>{pnl.margin.toFixed(1)}% margin</span>
            </div>
          </div>
        </button>
        <button onClick={() => setPicking((p) => !p)} className="text-[11px] text-muted hover:text-foreground shrink-0 underline">Change</button>
      </div>

      {/* Change / detach control */}
      {picking && (
        <div className="px-3 pb-3 flex items-center gap-2 flex-wrap border-b border-border">
          {creating ? (
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <input
                autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createAndAssign(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
                placeholder="New master project name…"
                className="flex-1 bg-background border border-border px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <button onClick={createAndAssign} disabled={busy || !newName.trim()} className="text-accent hover:opacity-80 disabled:opacity-40"><Check size={16} /></button>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="text-muted hover:text-foreground"><X size={16} /></button>
            </div>
          ) : (
            <>
              <select
                value={master.id} disabled={busy}
                onChange={(e) => { if (e.target.value === "__new__") setCreating(true); else if (e.target.value) assign(e.target.value); }}
                className="bg-background border border-border px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent"
              >
                {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value="__new__">＋ New master project…</option>
              </select>
              <button onClick={() => assign(null)} disabled={busy} className="text-xs text-muted hover:text-red-500 flex items-center gap-1"><X size={13} /> Remove from master</button>
            </>
          )}
        </div>
      )}

      {open && (
        <div className="border-t border-border">
          {/* Sibling builds */}
          {siblings.map((s) => {
            const isThis = s.cwId === project.id;
            return (
              <div key={s.key} className={cn("px-3 py-2 flex items-center justify-between gap-3 border-b border-border/60 last:border-b-0", isThis && "bg-accent/5")}>
                {s.cwId && !isThis ? (
                  <button onClick={() => onOpenProject(s.cwId!)} className="min-w-0 flex-1 text-left group">
                    <p className="text-sm truncate group-hover:text-accent transition-colors">{s.name}</p>
                    <p className="text-[11px] text-muted font-mono">{s.sub}</p>
                  </button>
                ) : !s.cwId && s.estId ? (
                  <Link href={`/axiom/estimator?id=${s.estId}`} className="min-w-0 flex-1 group">
                    <p className="text-sm truncate group-hover:text-accent transition-colors">{s.name}</p>
                    <p className="text-[11px] text-muted font-mono">{s.sub}</p>
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate font-semibold">{s.name} <span className="text-[10px] uppercase tracking-wider text-accent ml-1">this build</span></p>
                    <p className="text-[11px] text-muted font-mono">{s.sub}</p>
                  </div>
                )}
                <span className="text-xs font-mono text-accent shrink-0">{money(s.amount)}</span>
              </div>
            );
          })}

          {/* P&L rollup */}
          <div className="bg-background/40 px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-muted font-medium">Profit &amp; Loss (all builds)</p>
              <span className={cn("text-[11px] font-mono px-1.5 py-0.5 rounded", pnl.margin >= 0 ? "text-accent" : "text-red-500")}>{pnl.margin.toFixed(1)}% margin</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">{pnl.hasCharged ? "Net sales (charged − tax)" : "Revenue (quoted)"}</span>
                <span className="font-mono">{money2(pnl.netSales)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Total cost</span>
                <span className="font-mono">{money2(pnl.cost)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="pl-3">· Labor</span><span className="font-mono">{money2(pnl.labor)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="pl-3">· Materials</span><span className="font-mono">{money2(pnl.materials)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border mt-3 pt-2.5">
              <span className="text-sm font-medium">Net profit</span>
              <span className={cn("font-mono font-bold", pnl.profit >= 0 ? "text-accent" : "text-red-500")}>{money2(pnl.profit)}</span>
            </div>

            {/* Actual billing entry — overrides quoted revenue when set */}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mt-4 pt-3 border-t border-border/60">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Amount charged</span>
                <input
                  type="number" step="0.01" inputMode="decimal"
                  defaultValue={master.charged_amount ?? ""}
                  key={`charged-${master.id}-${master.charged_amount ?? ""}`}
                  onBlur={(e) => { const v = e.target.value.trim(); const n = v === "" ? null : Number(v); if ((n ?? null) !== (master.charged_amount ?? null)) updateFinance({ charged_amount: n }); }}
                  placeholder="0.00"
                  className="w-32 bg-card border border-border px-2.5 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Sales tax</span>
                <input
                  type="number" step="0.01" inputMode="decimal"
                  defaultValue={master.tax_collected ?? ""}
                  key={`tax-${master.id}-${master.tax_collected ?? ""}`}
                  onBlur={(e) => { const v = e.target.value.trim(); const n = v === "" ? null : Number(v); if ((n ?? null) !== (master.tax_collected ?? null)) updateFinance({ tax_collected: n }); }}
                  placeholder="0.00"
                  className="w-28 bg-card border border-border px-2.5 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:border-accent"
                />
              </label>
              <p className="text-[11px] text-muted max-w-xs">
                {pnl.hasCharged
                  ? `Quoted was ${money2(pnl.quoted)}. Tax is excluded from profit (pass-through).`
                  : `Leave blank to use the quoted total (${money2(pnl.quoted)}) as revenue.`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
