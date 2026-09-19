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
// 6 shop hours/day is the realistic build pace. Used for projecting a start
// date from labor hours: hours / SHOP_HOURS_PER_DAY rounded up = working days.
export const SHOP_HOURS_PER_DAY = 6;

function parseIsoDate(iso: string): Date | null {
  const parts = iso.split("-").map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function fmtIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isWeekday(d: Date): boolean {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6;
}

/**
 * Suggest a start date by walking back ceil(hours / SHOP_HOURS_PER_DAY)
 * working days from `dueDate` (Sat/Sun are not work days). Returns "" if
 * inputs are missing or invalid.
 */
export function suggestStartDate(dueDate: string | null | undefined, hours: number): string {
  if (!dueDate || !hours || hours <= 0) return "";
  const due = parseIsoDate(dueDate.split("T")[0]);
  if (!due) return "";
  const days = Math.ceil(hours / SHOP_HOURS_PER_DAY);
  while (!isWeekday(due)) due.setDate(due.getDate() - 1);
  let collected = 1;
  while (collected < days) {
    due.setDate(due.getDate() - 1);
    if (isWeekday(due)) collected++;
  }
  return fmtIsoDate(due);
}

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

/**
 * The Axiom date standard: always month/day/year (US), regardless of the
 * viewer's browser locale. Use this instead of a bare toLocaleDateString(),
 * which follows the browser locale and can render day/month/year.
 * Date-only strings (YYYY-MM-DD) are parsed as local dates to avoid a
 * timezone shifting the day.
 */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "";
  let date: Date;
  if (input instanceof Date) {
    date = input;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-").map(Number);
    date = new Date(y, m - 1, d);
  } else {
    date = new Date(input);
  }
  if (isNaN(date.getTime())) return typeof input === "string" ? input : "";
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

/** Month/day/year + time (US), for timestamps. */
export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}
