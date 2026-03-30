"use client";

import { cn } from "@/lib/utils";

const categories = [
  { value: "all", label: "All" },
  { value: "woodworking", label: "Woodworking" },
  { value: "metalworking", label: "Metalworking" },
  { value: "mixed", label: "Mixed" },
];

interface FilterBarProps {
  active: string;
  onChange: (category: string) => void;
}

export default function FilterBar({ active, onChange }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {categories.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          className={cn(
            "px-5 py-2 text-sm uppercase tracking-wider border transition-all",
            active === cat.value
              ? "border-accent text-accent bg-accent/10"
              : "border-border text-muted hover:border-accent/50 hover:text-foreground"
          )}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
