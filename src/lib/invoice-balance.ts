// Single source of truth for invoice money math. Previously this formula was
// re-implemented in the invoices page, the assistant tools, the project recap,
// and the payment-confirmation routes — and the payment routes force-set
// status:"paid" on any payment, which breaks the one-invoice + deposit model
// (a deposit payment on a full-total invoice must read as "partial", not
// "paid"). Everything now derives status from payments vs the computed total.

interface InvoiceLineItemLike {
  quantity?: number | null;
  unit_price?: number | null;
}
interface PaymentLike {
  amount?: number | null;
}
export interface InvoiceLike {
  line_items?: InvoiceLineItemLike[] | null;
  subtotal?: number | null;
  delivery_fee?: number | null;
  discount?: number | null;
  tax_rate?: number | null; // percent, e.g. 8.75
  payments?: PaymentLike[] | null;
  // Amount due up front (the deposit). null/undefined or >= total ⇒ the full
  // total is due now (the 100% default). The invoice total is always the full
  // project amount; the deposit is just how much of it is collected first.
  deposit_amount?: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function invoiceSubtotal(inv: InvoiceLike): number {
  if (inv.line_items && inv.line_items.length > 0) {
    return inv.line_items.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  }
  return (inv.subtotal || 0) + (inv.delivery_fee || 0);
}

export function calcTotal(inv: InvoiceLike): number {
  const sub = invoiceSubtotal(inv);
  const taxable = sub - (inv.discount || 0);
  return round2(taxable + taxable * ((inv.tax_rate || 0) / 100));
}

export function calcPaid(inv: InvoiceLike): number {
  return round2((inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0));
}

export function calcBalance(inv: InvoiceLike): number {
  return round2(calcTotal(inv) - calcPaid(inv));
}

export function deriveStatus(inv: InvoiceLike): "unpaid" | "partial" | "paid" {
  const paid = calcPaid(inv);
  const total = calcTotal(inv);
  if (total > 0 && paid >= total - 0.005) return "paid";
  if (paid > 0.005) return "partial";
  return "unpaid";
}

// What the client should pay right now: the still-unpaid portion of the deposit
// while the deposit isn't yet covered, otherwise the full remaining balance.
export function amountDueNow(inv: InvoiceLike): number {
  const paid = calcPaid(inv);
  const balance = calcBalance(inv);
  const dep = inv.deposit_amount;
  if (dep != null && paid < dep - 0.005) {
    return round2(Math.min(dep, calcTotal(inv)) - paid);
  }
  return balance;
}

// True once the deposit portion has been collected (so a project may be
// spun up). With no deposit set, any full payment counts.
export function depositCovered(inv: InvoiceLike): boolean {
  const paid = calcPaid(inv);
  const dep = inv.deposit_amount;
  const threshold = dep != null ? Math.min(dep, calcTotal(inv)) : calcTotal(inv);
  return threshold > 0 && paid >= threshold - 0.005;
}
