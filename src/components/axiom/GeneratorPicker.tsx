"use client";

import { useMemo } from "react";
import { GENERATORS } from "@/lib/parts";

interface GeneratorPickerProps {
  value: string;
  onChange: (id: string) => void;
  className?: string;
  label?: string;
}

// Standalone and the project tab both pick a generator the same way —
// this keeps the two entry points from drifting. Grouped by `category`
// via <optgroup>; two categories is overkill today but free now and a
// migration at ten.
export default function GeneratorPicker({
  value,
  onChange,
  className,
  label,
}: GeneratorPickerProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, typeof GENERATORS>();
    for (const g of GENERATORS) {
      const arr = map.get(g.category);
      if (arr) arr.push(g);
      else map.set(g.category, [g]);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ??
          "w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
        }
      >
        {grouped.map(([category, items]) => (
          <optgroup key={category} label={category}>
            {items.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
