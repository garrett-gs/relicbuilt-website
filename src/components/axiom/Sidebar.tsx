"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CheckSquare,
  Hammer,
  Clock,
  CalendarDays,
  Warehouse,
  Users,
  UserPlus,
  FileText,
  Calculator,
  ShoppingCart,
  Receipt,
  Camera,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";

const navSections = [
  {
    label: "Overview",
    items: [
      { href: "/axiom/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/axiom/tasks", icon: CheckSquare, label: "Tasks" },
    ],
  },
  {
    label: "Clients",
    items: [
      { href: "/axiom/leads", icon: UserPlus, label: "Leads" },
      { href: "/axiom/customers", icon: Users, label: "Customers" },
    ],
  },
  {
    label: "Projects",
    items: [
      { href: "/axiom/estimator", icon: Calculator, label: "Estimator" },
      { href: "/axiom/projects", icon: Hammer, label: "Projects" },
      { href: "/axiom/timeclock", icon: Clock, label: "Time Clock" },
      { href: "/axiom/calendar", icon: CalendarDays, label: "Build Calendar" },
      { href: "/axiom/inventory", icon: Warehouse, label: "Inventory" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/axiom/invoices", icon: FileText, label: "Invoices" },
      { href: "/axiom/purchase-orders", icon: ShoppingCart, label: "Purchase Orders" },
      { href: "/axiom/expenses", icon: Receipt, label: "Expenses" },
      { href: "/axiom/receipts", icon: Camera, label: "Receipts" },
      { href: "/receipts", icon: Camera, label: "Receipt App", external: true, sub: true },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/axiom/activity", icon: Activity, label: "Activity Log" },
      { href: "/axiom/settings", icon: Settings, label: "Settings" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { signOut, userEmail } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <>
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <Link href="/axiom/dashboard" className="flex items-center gap-3">
          <Image
            src="/logo-emblem.png"
            alt="Relic"
            width={28}
            height={28}
            className="h-7 w-7"
          />
          <span className="text-lg font-heading font-bold tracking-widest text-foreground">
            AXIOM
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navSections.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="px-3 mb-1.5 text-[10px] uppercase tracking-widest text-muted/60 font-medium">
              {section.label}
            </p>
            {section.items.map((item) => {
              const active = pathname === item.href;
              const isSub = "sub" in item && item.sub;
              const isExternal = "external" in item && item.external;
              if (isExternal) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 py-1.5 rounded text-xs transition-colors text-muted hover:text-accent",
                      isSub ? "pl-9 pr-3" : "px-3"
                    )}
                  >
                    <ExternalLink size={11} className="shrink-0" />
                    {item.label}
                  </a>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors",
                    active
                      ? "bg-accent/15 text-accent font-medium"
                      : "text-muted hover:text-foreground hover:bg-card"
                  )}
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <p className="text-xs text-muted truncate mb-2">{userEmail}</p>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 h-screen bg-card border-r border-border fixed left-0 top-0 z-40">
        {nav}
      </aside>

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 bg-card border border-border p-2 rounded"
      >
        <Menu size={20} />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-50 flex flex-col md:hidden">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 text-muted"
            >
              <X size={20} />
            </button>
            {nav}
          </aside>
        </>
      )}
    </>
  );
}
