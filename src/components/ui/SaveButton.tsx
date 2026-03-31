import { Check, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface SaveButtonProps {
  dirty: boolean;
  saved?: boolean;
  onClick: () => void;
  size?: "sm" | "md";
  label?: string;
}

export default function SaveButton({ dirty, saved = false, onClick, size = "md", label = "Save Changes" }: SaveButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={!dirty}
      className={cn(
        "inline-flex items-center justify-center font-medium uppercase tracking-wider transition-all duration-300",
        size === "sm" ? "text-xs px-4 py-2 gap-1.5" : "text-sm px-6 py-3 gap-2",
        dirty
          ? "bg-accent text-background hover:bg-accent/90 cursor-pointer"
          : saved
          ? "bg-muted/30 text-muted border border-border cursor-default"
          : "bg-muted/20 text-muted/50 border border-border/50 cursor-default"
      )}
    >
      {saved && !dirty ? (
        <>
          <Check size={size === "sm" ? 12 : 14} />
          Saved
        </>
      ) : (
        <>
          <Save size={size === "sm" ? 12 : 14} />
          {label}
        </>
      )}
    </button>
  );
}
