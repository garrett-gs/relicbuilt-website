"use client";

import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/axiom/AuthProvider";
import { EntityProvider } from "@/components/axiom/EntityProvider";
import Sidebar from "@/components/axiom/Sidebar";
import AxiomLogin from "@/components/axiom/AxiomLogin";
import Assistant from "@/components/axiom/Assistant";

function AxiomShell({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const pathname = usePathname();

  // Public routes — no auth required
  if (pathname.startsWith("/axiom/portal/") || pathname === "/axiom/timeclock" || pathname === "/axiom/receipts") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <AxiomLogin />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 md:ml-56 px-6 pb-6 md:px-8 md:pb-8 pt-[calc(env(safe-area-inset-top)_+_1.5rem)] md:pt-8 overflow-x-hidden">
        {children}
      </main>
      <Assistant />
    </div>
  );
}

export default function AxiomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <EntityProvider>
        <AxiomShell>{children}</AxiomShell>
      </EntityProvider>
    </AuthProvider>
  );
}
