"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The public-facing marketing site now lives at wallflower-relic.com. This app
// hosts the Axiom portal + client/payment flows, so the top bar just points
// visitors back to the main Wallflower RELIC website.
const MAIN_SITE = "https://www.wallflower-relic.com";

export default function Navbar() {
  const pathname = usePathname();
  const isAxiom = pathname.startsWith("/axiom");

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className={cn("max-w-7xl mx-auto px-6 flex items-center justify-between", isAxiom ? "h-20" : "h-16")}>
        {/* Logo */}
        <Link href={isAxiom ? "/axiom/dashboard" : "/"} className="flex items-center gap-2">
          {isAxiom ? (
            <Image
              src="/wr-logo-white.png"
              alt="Wallflower RELIC"
              width={1400}
              height={114}
              priority
              className="h-12 w-auto"
            />
          ) : (
            <>
              <Image
                src="/wr-emblem.png"
                alt="Wallflower RELIC"
                width={36}
                height={36}
                className="h-9 w-9"
              />
              <span className="text-base sm:text-lg font-bold text-foreground font-heading tracking-[0.2em] whitespace-nowrap">
                WALLFLOWER&ensp;RELIC
              </span>
            </>
          )}
        </Link>

        {/* Main-site link — public pages only (Axiom uses the Sidebar for nav) */}
        {!isAxiom && (
          <a
            href={MAIN_SITE}
            className="text-xs sm:text-sm uppercase tracking-wider font-bold text-muted hover:text-accent transition-colors whitespace-nowrap"
          >
            Visit Wallflower RELIC <span aria-hidden="true">&rarr;</span>
          </a>
        )}
      </div>
    </nav>
  );
}
