import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SaveButtonProps {
  dirty: boolean;
  saved?: boolean;
  onClick: () => void;
  size?: "sm" | "md";
  /** Unused now that saving is automatic; kept for call-site compatibility. */
  label?: string;
}

/**
 * Autosave status indicator. Pages now persist automatically (see useAutosave),
 * so this surfaces state rather than requiring a click: "Saving…" while changes
 * are pending, "Saved" once persisted. Still clickable to force an immediate save.
 */
export default function SaveButton({ dirty, onClick, size = "md" }: SaveButtonProps) {
  return (
    <button
      onClick={onClick}
      title={dirty ? "Saving automatically…" : "All changes saved"}
      className={cn(
        "inline-flex items-center justify-center font-medium uppercase tracking-wider transition-all duration-300",
        size === "sm" ? "text-xs px-4 py-2 gap-1.5" : "text-sm px-6 py-3 gap-2",
        dirty
          ? "bg-muted/20 text-muted border border-border/50 cursor-default"
          : "bg-muted/30 text-muted border border-border cursor-default"
      )}
    >
      {dirty ? (
        <>
          <Loader2 size={size === "sm" ? 12 : 14} className="animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Check size={size === "sm" ? 12 : 14} />
          Saved
        </>
      )}
    </button>
  );
}
