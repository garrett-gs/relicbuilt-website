import { Estimate, CustomWork, MasterProject } from "@/types/axiom";

/** A quoted estimate total: (materials + labor) grossed up by markup %. */
export function estimateTotal(e: Estimate): number {
  const material = (e.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const labor = (e.labor_items || []).reduce((s, l) => s + (l.cost || 0), 0);
  const subtotal = material + labor;
  return subtotal + subtotal * ((e.markup_percent || 0) / 100);
}

export type ExpenseLite = { amount?: number | null; category?: string | null; custom_work_id?: string | null };

/** Children of a master = estimates tagged to it, plus any tagged project that
 *  has no estimate pointing at it (avoids double-counting approved estimates). */
export function masterChildren(masterId: string, estimates: Estimate[], projects: CustomWork[]) {
  const estChildren = estimates.filter((e) => e.master_project_id === masterId);
  const linkedCw = new Set(estChildren.map((e) => e.custom_work_id).filter(Boolean));
  const cwOrphans = projects.filter((p) => p.master_project_id === masterId && !linkedCw.has(p.id));
  return { estChildren, cwOrphans };
}

/** min start → max due across a set of dated items. */
export function combinedWindow(items: { start_date?: string; due_date?: string }[]): string[] {
  const starts = items.map((i) => i.start_date).filter(Boolean) as string[];
  const dues = items.map((i) => i.due_date).filter(Boolean) as string[];
  const all = [...starts, ...dues];
  if (all.length === 0) return [];
  const min = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : all.reduce((a, b) => (a < b ? a : b));
  const max = dues.length ? dues.reduce((a, b) => (a > b ? a : b)) : all.reduce((a, b) => (a > b ? a : b));
  return min === max ? [min] : [min, max];
}

/** Roll up a master project's P&L across every child build. Costs pulled from
 *  all three places costs actually live:
 *    labor     — estimate labor_items + project labor_log + "Labor" expenses
 *    materials — project materials[] + non-Labor expenses
 *  Revenue is the quoted total unless an actual charged amount is entered on the
 *  master (then it's net sales = charged − tax, since tax is a pass-through). */
export function masterPnl(master: MasterProject, estimates: Estimate[], projects: CustomWork[], expenses: ExpenseLite[]) {
  const { estChildren, cwOrphans } = masterChildren(master.id, estimates, projects);
  const childCwIds = new Set<string>();
  estChildren.forEach((e) => { if (e.custom_work_id) childCwIds.add(e.custom_work_id); });
  cwOrphans.forEach((p) => childCwIds.add(p.id));
  const childProjects = projects.filter((p) => childCwIds.has(p.id));

  const quoted =
    estChildren.reduce((s, e) => s + estimateTotal(e), 0) +
    cwOrphans.reduce((s, p) => s + (p.quoted_amount || 0), 0);

  const laborFromEstimates = estChildren.reduce((s, e) => s + (e.labor_items || []).reduce((a, l) => a + (l.cost || 0), 0), 0);
  const laborFromLog = childProjects.reduce((s, p) => s + (p.labor_log || []).reduce((a, l) => a + (l.cost || 0), 0), 0);
  const matFromProjects = childProjects.reduce((s, p) => s + (p.materials || []).reduce((a, m) => a + (m.cost || 0), 0), 0);

  const childExpenses = expenses.filter((x) => x.custom_work_id && childCwIds.has(x.custom_work_id));
  const laborFromExpenses = childExpenses.filter((x) => (x.category || "").toLowerCase() === "labor").reduce((s, x) => s + (x.amount || 0), 0);
  const matFromExpenses = childExpenses.filter((x) => (x.category || "").toLowerCase() !== "labor").reduce((s, x) => s + (x.amount || 0), 0);

  const labor = laborFromEstimates + laborFromLog + laborFromExpenses;
  const materials = matFromProjects + matFromExpenses;
  const cost = labor + materials;

  const charged = master.charged_amount ?? null;
  const tax = master.tax_collected ?? 0;
  const hasCharged = charged != null && charged > 0;
  const netSales = hasCharged ? (charged as number) - tax : quoted;
  const profit = netSales - cost;
  const margin = netSales > 0 ? (profit / netSales) * 100 : 0;

  return { estChildren, cwOrphans, childCount: estChildren.length + cwOrphans.length, quoted, labor, materials, cost, charged, tax, hasCharged, netSales, profit, margin };
}
