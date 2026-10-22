"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CartDrawer from "@/components/shop/CartDrawer";

// Routes that render BARE — no marketing navbar/footer and no site background
// offset. Two cases: client-facing document routes (so a proposal / payment /
// approval page reads as a standalone document, not a page embedded in the
// website), and the whole Axiom app (which has its own sidebar chrome in
// axiom/layout.tsx — the marketing masthead/footer don't belong on the ERP).
const BARE_PREFIXES = ["/proposal", "/pay", "/approve", "/client", "/axiom"];

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_PREFIXES.some((p) => pathname?.startsWith(p));

  if (bare) return <>{children}</>;

  return (
    <>
      <Navbar />
      <main className="flex-1 pt-16">{children}</main>
      <Footer />
      <CartDrawer />
    </>
  );
}
