"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/axiom/AuthProvider";
import { EntityProvider, useEntity } from "@/components/axiom/EntityProvider";
import { useAxiomRole } from "@/components/axiom/useAxiomRole";
import Sidebar from "@/components/axiom/Sidebar";
import AxiomLogin from "@/components/axiom/AxiomLogin";
import Assistant from "@/components/axiom/Assistant";
import ClockWidget from "@/components/axiom/ClockWidget";
import AutoUpdateOverlay from "@/components/axiom/AutoUpdateOverlay";
import { SITE_ENTITY } from "@/lib/axiom-site";

// Staff accounts are a Time Clock only — no other Axiom surface.
const STAFF_HOME = "/axiom/timeclock";

function AxiomShell({ children }: { children: React.ReactNode }) {
  const { session, loading, signOut, userEmail } = useAuth();
  const { accessDenied, loading: accessLoading } = useEntity();
  const { role, loading: roleLoading } = useAxiomRole();
  const pathname = usePathname();
  const router = useRouter();

  // Staff are scoped to the Time Clock: send them there from anywhere else.
  useEffect(() => {
    if (roleLoading || role !== "staff") return;
    if (pathname !== STAFF_HOME) router.replace(STAFF_HOME);
  }, [role, roleLoading, pathname, router]);

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

  // RELIC site: hold the spinner until the Relic-access check settles, so a
  // user who has access never sees the denied screen flash.
  if (SITE_ENTITY === "relic" && accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  // RELIC site: a signed-in user without Relic access gets a plain message in
  // place of the app — no nav, no data.
  if (accessDenied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="text-lg font-heading font-bold text-foreground mb-2">
          This is the RELIC workspace.
        </h1>
        <p className="text-sm text-muted mb-2 max-w-sm">
          {userEmail ? <>You&apos;re signed in as <span className="text-foreground">{userEmail}</span>, which doesn&apos;t have RELIC access.</> : "Your account doesn't have RELIC access."}
        </p>
        <p className="text-xs text-muted/70 mb-6 max-w-sm">
          Sign out and sign back in with your RELIC account, or ask an owner to grant this address access in Settings.
        </p>
        <button
          onClick={signOut}
          className="text-xs text-muted hover:text-foreground transition-colors border border-border rounded px-4 py-2"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 md:ml-56 px-6 pb-6 md:px-8 md:pb-8 pt-[calc(env(safe-area-inset-top)_+_1.5rem)] md:pt-8 overflow-x-hidden">
        {children}
      </main>
      <Assistant />
      <ClockWidget />
      <AutoUpdateOverlay />
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
