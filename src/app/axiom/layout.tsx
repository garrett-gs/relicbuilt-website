"use client";

import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/axiom/AuthProvider";
import Sidebar from "@/components/axiom/Sidebar";
import AxiomLogin from "@/components/axiom/AxiomLogin";

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
      <main className="flex-1 md:ml-56 p-6 md:p-8 overflow-x-hidden">
        {children}
      </main>
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
      <AxiomShell>{children}</AxiomShell>
    </AuthProvider>
  );
}
