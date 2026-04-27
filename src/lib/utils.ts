export function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Format any phone string to (###) ###-#### as the user types */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Formats an ISO date string (YYYY-MM-DD) as an unambiguous "MMM D, YYYY"
 * label and reports whether the date is within 30 days from today
 * (including any past/overdue dates).
 *
 * Parses the date as a local date — avoids the UTC offset bug where
 * "2026-05-26" can render as the day before in negative-offset zones.
 */
export function formatDueDate(iso: string | null | undefined): { text: string; soon: boolean } {
  if (!iso) return { text: "", soon: false };
  const datePart = iso.split("T")[0];
  const parts = datePart.split("-").map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
    return { text: iso, soon: false };
  }
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  const soon = diffDays <= 30; // overdue (negative) or within 30 days
  const text = `${MONTH_ABBR[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  return { text, soon };
}
