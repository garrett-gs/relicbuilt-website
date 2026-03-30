import { cn } from "@/lib/utils";
import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted uppercase tracking-wider">
        {label}
        {props.required && <span className="text-accent ml-1">*</span>}
      </label>
      <input
        id={id}
        className={cn(
          "bg-card border border-border px-4 py-3 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors",
          error && "border-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted uppercase tracking-wider">
        {label}
        {props.required && <span className="text-accent ml-1">*</span>}
      </label>
      <textarea
        id={id}
        className={cn(
          "bg-card border border-border px-4 py-3 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors resize-y min-h-[120px]",
          error && "border-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, error, options, className, id, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted uppercase tracking-wider">
        {label}
        {props.required && <span className="text-accent ml-1">*</span>}
      </label>
      <select
        id={id}
        className={cn(
          "bg-card border border-border px-4 py-3 text-foreground focus:outline-none focus:border-accent transition-colors",
          error && "border-red-500",
          className
        )}
        {...props}
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}
