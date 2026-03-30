"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { CustomWork, Invoice, PurchaseOrder, ActivityEntry } from "@/types/axiom";

const statusColors: Record<string, string> = {
  new: "#4d9fff",
  in_review: "#f59e0b",
  quoted: "#a78bfa",
  in_progress: "#3b82f6",
  complete: "#22c55e",
};

const statusLabels: Record<string, string> = {
  new: "New",
  in_review: "In Review",
  quoted: "Quoted",
  in_progress: "In Progress",
  complete: "Complete",
};

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const load = useCallback(async () => {
    const [p, i, po, a] = await Promise.all([
      axiom.from("custom_work").select("*").order("created_at", { ascending: false }),
      axiom.from("invoices").select("*").order("created_at", { ascending: false }),
      axiom.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      axiom.from("activity_log").select("*").order("created_at", { ascending: false }).limit(10),
    ]);
    if (p.data) setProjects(p.data);
    if (i.data) setInvoices(i.data);
    if (po.data) setPos(po.data);
    if (a.data) setActivity(a.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Stats
  const activeProjects = projects.filter((p) => p.status !== "complete");
  const inProgress = projects.filter((p) => p.status === "in_progress");
  const totalQuoted = projects.reduce((s, p) => s + (p.quoted_amount || 0), 0);
  const totalCost = projects.filter((p) => p.status === "complete").reduce((s, p) => s + (p.actual_cost || 0), 0);
  const totalProfit = projects.filter((p) => p.status === "complete").reduce((s, p) => s + ((p.quoted_amount || 0) - (p.actual_cost || 0)), 0);

  const unpaidInvoices = invoices.filter((i) => i.status !== "paid");
  const outstandingBalance = unpaidInvoices.reduce((s, inv) => {
    const taxable = (inv.subtotal || 0) + (inv.delivery_fee || 0) - (inv.discount || 0);
    const total = taxable + taxable * ((inv.tax_rate || 0) / 100);
    const paid = (inv.payments || []).reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
    return s + (total - paid);
  }, 0);

  const pendingPOs = pos.filter((p) => p.status === "pending");
  const poTotal = pos.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);

  // Project counts by status
  const statusCounts = projects.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Margins
  const completedWithQuotes = projects.filter((p) => p.status === "complete" && p.quoted_amount > 0);
  const avgMargin =
    completedWithQuotes.length > 0
      ? completedWithQuotes.reduce((s, p) => s + ((p.quoted_amount - p.actual_cost) / p.quoted_amount) * 100, 0) /
        completedWithQuotes.length
      : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold">Dashboard</h1>
        <p className="text-muted text-sm mt-1">Overview of your shop operations</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Projects" value={activeProjects.length} />
        <StatCard label="In Progress" value={inProgress.length} />
        <StatCard label="Total Quoted" value={money(totalQuoted)} />
        <StatCard label="Avg Margin" value={avgMargin > 0 ? `${avgMargin.toFixed(1)}%` : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Projects by status */}
        <div className="bg-card border border-border p-5">
          <h2 className="text-sm uppercase tracking-wider text-muted mb-4">Projects by Status</h2>
          <div className="space-y-3">
            {Object.entries(statusLabels).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: statusColors[key] }}
                  />
                  <span className="text-sm">{label}</span>
                </div>
                <span className="text-sm font-mono">{statusCounts[key] || 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Financial summary */}
        <div className="bg-card border border-border p-5">
          <h2 className="text-sm uppercase tracking-wider text-muted mb-4">Financial Overview</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted">Outstanding Invoices</span>
              <span className="text-sm font-mono">{money(outstandingBalance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted">Unpaid Invoices</span>
              <span className="text-sm font-mono">{unpaidInvoices.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted">Pending P.O.s</span>
              <span className="text-sm font-mono">{pendingPOs.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted">P.O. Total (All)</span>
              <span className="text-sm font-mono">{money(poTotal)}</span>
            </div>
            <div className="border-t border-border pt-3 flex justify-between">
              <span className="text-sm text-muted">Total Profit (Completed)</span>
              <span className="text-sm font-mono text-green-500">{money(totalProfit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted">Total Cost (Completed)</span>
              <span className="text-sm font-mono">{money(totalCost)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent builds */}
      <div className="bg-card border border-border p-5 mb-8">
        <h2 className="text-sm uppercase tracking-wider text-muted mb-4">Recent Builds</h2>
        {projects.length === 0 ? (
          <p className="text-muted text-sm">No projects yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs uppercase tracking-wider border-b border-border">
                  <th className="pb-2 pr-4">Project</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4 text-right">Quoted</th>
                  <th className="pb-2 pr-4 text-right">Cost</th>
                  <th className="pb-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 8).map((p) => {
                  const margin =
                    p.quoted_amount > 0
                      ? ((p.quoted_amount - p.actual_cost) / p.quoted_amount) * 100
                      : 0;
                  return (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-2 pr-4">{p.project_name}</td>
                      <td className="py-2 pr-4">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: statusColors[p.status] + "20",
                            color: statusColors[p.status],
                          }}
                        >
                          {statusLabels[p.status]}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {p.quoted_amount ? money(p.quoted_amount) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {p.actual_cost ? money(p.actual_cost) : "—"}
                      </td>
                      <td
                        className="py-2 text-right font-mono"
                        style={{
                          color:
                            margin >= 40 ? "#22c55e" : margin >= 20 ? "#f59e0b" : "#ef4444",
                        }}
                      >
                        {p.quoted_amount > 0 ? `${margin.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="bg-card border border-border p-5">
        <h2 className="text-sm uppercase tracking-wider text-muted mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-muted text-sm">No activity yet</p>
        ) : (
          <div className="space-y-2">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm py-1.5 border-b border-border/30">
                <span className="text-muted text-xs whitespace-nowrap mt-0.5">
                  {new Date(a.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-foreground">{a.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border p-4">
      <p className="text-xs uppercase tracking-wider text-muted mb-1">{label}</p>
      <p className="text-xl font-bold font-mono">{value}</p>
    </div>
  );
}
