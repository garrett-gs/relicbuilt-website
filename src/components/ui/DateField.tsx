"use client";

// A drop-in replacement for <input type="date"> that ALWAYS renders the
// date in our own format — bypassing the browser's locale-driven default
// rendering, which (depending on Chrome's language list / macOS region)
// can show DD/MM/YYYY in places where we want MM/DD/YYYY.
//
// We still use a real <input type="date"> under the hood so users get
// the native picker (popover calendar on click, OS-friendly behavior
// on touch devices, etc.). It just sits invisibly behind a styled
// button whose label is built from the ISO value via formatDueDate,
// so the visible text reads "May 4, 2026" no matter what locale Chrome
// is set to.

import { useRef } from "react";
import { formatDueDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface DateFieldProps {
  value: string; // ISO yyyy-mm-dd
  onChange: (v: string) => void;
  placeholder?: string;
  /** Wrapper className — controls width / layout. */
  className?: string;
  /** Button className — controls colors / padding. Pass the same Tailwind
   * classes you'd give the original <input type="date"> so the date field
   * lines up with the rest of the form. Defaults to the compact axiom
   * style used in the Labor Log. */
  inputClassName?: string;
  /** When true, renders in the orange "this value was auto-suggested,
   * not yet user-confirmed" treatment — matches the Field component's
   * highlight prop on the project Start Date. */
  highlight?: boolean;
  disabled?: boolean;
}

export default function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  inputClassName,
  highlight,
  disabled,
}: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    // showPicker is the modern, programmatic way to open the native
    // picker. Falls back to focus() for older browsers — focusing a
    // date input shows the picker on most Chromium versions anyway.
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // Some browsers (older Safari) throw NotAllowedError outside a
        // user gesture, but click handlers ARE a user gesture, so this
        // is mostly defensive.
      }
    }
    el.focus();
  }

  return (
    <div
      className={cn(
        "relative inline-block",
        className,
      )}
    >
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className={cn(
          // Default styling — compact, used in the Labor Log. Callers
          // can override by passing inputClassName with the full set
          // of bg/border/padding classes.
          inputClassName ?? "bg-card border border-border px-3 py-2 text-sm text-foreground hover:border-accent focus:outline-none focus:border-accent transition-colors w-full text-left",
          highlight && "border-orange-400 text-orange-400",
          disabled && "opacity-50 cursor-not-allowed",
          !value && !highlight && "text-muted",
        )}
      >
        {value ? formatDueDate(value).text : placeholder}
      </button>
      {/* The real picker — invisible but sits ON TOP of the styled button
          and receives taps directly. iPad Safari silently no-ops
          showPicker() on an input that's hidden behind pointer-events:none,
          so the button-click fallback isn't enough on its own; letting the
          native input own the tap is what reliably opens the calendar
          popover on iPadOS / mobile Safari. */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
  );
}
