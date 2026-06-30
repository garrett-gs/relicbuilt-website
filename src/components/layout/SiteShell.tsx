"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CartDrawer from "@/components/shop/CartDrawer";

// Client-facing document routes render BARE — no marketing navbar/footer and
// no site background offset — so a proposal / payment / approval page reads as
// a standalone document instead of a page embedded in the RELIC website.
const BARE_PREFIXES = ["/proposal", "/pay", "/approve", "/client"];

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_PREFIXES.some((p) => pathname?.startsWith(p));

  if (bare) return <>{children}</>;

  // Axiom uses a taller navbar (bigger logo), so its content offset matches.
  const isAxiom = pathname?.startsWith("/axiom") ?? false;

  return (
    <>
      <Navbar />
      <main className={`flex-1 ${isAxiom ? "pt-20" : "pt-16"}`}>{children}</main>
      <Footer />
      <CartDrawer />
    </>
  );
}
