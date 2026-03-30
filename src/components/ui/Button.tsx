import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
}

export default function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium uppercase tracking-wider transition-all duration-200",
        size === "sm" && "text-xs px-4 py-2",
        size === "md" && "text-sm px-6 py-3",
        size === "lg" && "text-base px-8 py-4",
        variant === "primary" &&
          "bg-accent text-background hover:bg-accent/90",
        variant === "secondary" &&
          "bg-foreground text-background hover:bg-foreground/90",
        variant === "outline" &&
          "border border-border text-foreground hover:border-accent hover:text-accent",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
