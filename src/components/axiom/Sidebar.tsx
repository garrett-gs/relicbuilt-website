"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useEntity } from "./EntityProvider";
import { axiom } from "@/lib/axiom-supabase";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Hammer,
  Clock,
  CalendarDays,
  Warehouse,
  Users,
  FileText,
  Calculator,
  ShoppingCart,
  Package,
  LayoutList,
  Receipt,
  Camera,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  ExternalLink,
  HardHat,
  ClipboardList,
  Ruler,
  Martini,
  StickyNote,
} from "lucide-react";

const navSections = [
  {
    label: "Overview",
    items: [
      { href: "/axiom/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/axiom/tracker", icon: LayoutList, label: "Tracker" },
      { href: "/axiom/notes", icon: StickyNote, label: "Notes" },
      { href: "/axiom/crew", icon: HardHat, label: "Crew", adminOnly: true },
    ],
  },
  {
    label: "Clients",
    items: [
      { href: "/axiom/customers", icon: Users, label: "Customers" },
      { href: "/axiom/catalog", icon: Package, label: "Catalog" },
      { href: "/axiom/wallflower", icon: ClipboardList, label: "Work Orders", wallflowerOnly: true },
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
    label: "Parts Studio",
    items: [
      { href: "/axiom/parts-studio", icon: Ruler, label: "Parts Studio" },
      { href: "/axiom/bar-designer", icon: Martini, label: "Bar Designer" },
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
  const { entity, setEntity, hasRelicAccess } = useEntity();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdminOrManager, setIsAdminOrManager] = useState(false);
  const [wfPendingCount, setWfPendingCount] = useState(0);

  useEffect(() => {
    if (!userEmail) return;
    axiom
      .from("settings")
      .select("team_members")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const me = (data.team_members || []).find(
          (m: { email?: string }) =>
            m.email?.toLowerCase() === userEmail.toLowerCase()
        );
        if (me && (me.role === "admin" || me.role === "manager" || me.role === "superadmin")) {
          setIsAdminOrManager(true);
        }
      });
  }, [userEmail]);

  // Poll for pending Wallflower work orders
  useEffect(() => {
    function fetchCount() {
      axiom
        .from("wallflower_work_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .then(({ count }) => {
          setWfPendingCount(count || 0);
        });
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const nav = (
    <>
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <Link href="/axiom/dashboard" className="flex items-center gap-3">
          <Image
            src="/wr-emblem.png"
            alt="Wallflower RELIC"
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 object-contain"
          />
          <span className="text-base font-heading font-bold tracking-wide text-foreground">
            {entity === "relic" ? "RELIC" : "Wallflower RELIC"}
          </span>
        </Link>
      </div>

      {/* Business entity switcher — only for members granted Relic access */}
      {hasRelicAccess && (
        <div className="px-3 pt-3">
          <div className="flex gap-1 bg-background border border-border rounded p-1">
            <button
              onClick={() => setEntity("wallflower_relic")}
              className={cn(
                "flex-1 text-[11px] py-1 rounded transition-colors",
                entity === "wallflower_relic" ? "bg-accent/20 text-accent font-medium" : "text-muted hover:text-foreground"
              )}
            >
              Wallflower
            </button>
            <button
              onClick={() => setEntity("relic")}
              className={cn(
                "flex-1 text-[11px] py-1 rounded transition-colors",
                entity === "relic" ? "bg-accent/20 text-accent font-medium" : "text-muted hover:text-foreground"
              )}
            >
              Relic
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navSections.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="px-3 mb-1.5 text-[10px] uppercase tracking-widest text-muted/60 font-medium">
              {section.label}
            </p>
            {section.items
              .filter((item) => !("adminOnly" in item && item.adminOnly) || isAdminOrManager)
              .filter((item) => !("wallflowerOnly" in item && item.wallflowerOnly && entity === "relic"))
              .map((item) => {
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
              const badge = item.href === "/axiom/wallflower" && wfPendingCount > 0 ? wfPendingCount : 0;
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
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                      {badge}
                    </span>
                  )}
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

      {/* Mobile toggle — offset below the iPhone status bar / notch */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed left-4 z-50 bg-card border border-border p-2 rounded"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
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
          <aside
            className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-50 flex flex-col md:hidden overflow-y-auto"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 text-muted z-10"
              style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
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
