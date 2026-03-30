"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/shop/CartProvider";

const navLinks = [
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
  { href: "/shop", label: "Shop" },
  { href: "/contact", label: "Contact" },
  { href: "/new-client", label: "New Client" },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { items, setCartOpen } = useCart();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo-emblem.png"
            alt="Relic"
            width={36}
            height={36}
            className="h-9 w-9"
          />
          <span className="text-2xl font-bold tracking-widest text-foreground font-heading">
            R&ensp;E&ensp;L&ensp;I&ensp;C
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm uppercase tracking-wider transition-colors hover:text-accent",
                pathname === link.href ? "text-accent" : "text-muted"
              )}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={() => setCartOpen(true)}
            className="relative text-muted hover:text-accent transition-colors"
          >
            <ShoppingCart size={20} />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-accent text-background text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {itemCount}
              </span>
            )}
          </button>
        </div>

        {/* Mobile menu button */}
        <div className="flex items-center gap-4 md:hidden">
          <button
            onClick={() => setCartOpen(true)}
            className="relative text-muted hover:text-accent transition-colors"
          >
            <ShoppingCart size={20} />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-accent text-background text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {itemCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-foreground"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-background border-b border-border">
          <div className="px-6 py-4 flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "text-sm uppercase tracking-wider transition-colors hover:text-accent",
                  pathname === link.href ? "text-accent" : "text-muted"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
