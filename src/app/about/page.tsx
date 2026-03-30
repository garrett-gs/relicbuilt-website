"use client";

import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Link from "next/link";
import type { Metadata } from "next";

export default function AboutPage() {
  return (
    <div className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Image placeholder */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="aspect-[4/5] bg-card border border-border flex items-center justify-center"
          >
            <p className="text-muted text-sm uppercase tracking-wider">
              Workshop Photo
            </p>
          </motion.div>

          {/* Story */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-8">
              Our Story
            </h1>
            <div className="space-y-6 text-muted leading-relaxed">
              <p>
                I was inspired to become a craftsman by my Great Grandfather. He
                loved to work with his hands, building toys and furniture for me
                when I was young.
              </p>
              <p>
                That inspiration directly shaped R&ensp;E&ensp;L&ensp;I&ensp;C&apos;s philosophy —
                building with dedication to craftsmanship, purpose, and care.
                Every piece we create is intended to endure across generations.
              </p>
              <p>
                Today, R&ensp;E&ensp;L&ensp;I&ensp;C serves both residential and commercial clients,
                crafting everything from custom furniture and cabinetry to
                large-scale millwork and specialty items. No project is too big
                or too small.
              </p>
            </div>
            <div className="mt-8">
              <Link href="/contact">
                <Button>Get In Touch</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
