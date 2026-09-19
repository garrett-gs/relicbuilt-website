"use client";

import { cn, formatDate } from "@/lib/utils";

/**
 * A date input that always DISPLAYS month/day/year, regardless of the OS/browser
 * locale (a native <input type="date"> follows the OS locale — here it was
 * rendering dd/mm/yyyy). We keep the native input for its calendar picker and
 * value handling, hide its locale-formatted text, and overlay our own
 * MM/DD/YYYY label. Value in/out is the ISO YYYY-MM-DD the app stores.
 */
export default function DateField({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="date"
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full bg-card border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-accent",
          // Hide the native (locale-formatted) text; keep the calendar indicator.
          "text-transparent [color-scheme:dark]",
          className
        )}
      />
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">
        {value ? (
          <span className="text-foreground">{formatDate(value)}</span>
        ) : (
          <span className="text-muted">mm/dd/yyyy</span>
        )}
      </span>
    </div>
  );
}
