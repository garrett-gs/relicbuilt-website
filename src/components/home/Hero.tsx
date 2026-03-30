"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Button from "@/components/ui/Button";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative h-screen flex flex-col items-center overflow-hidden">
      {/* Background placeholder — replace with actual hero image */}
      <div className="absolute inset-0 bg-gradient-to-b from-card to-background" />
      <div className="absolute inset-0 bg-[url('/hero-placeholder.jpg')] bg-cover bg-center opacity-40" />

      {/* Logo group — vertically centered */}
      <div className="flex-1 flex items-center relative z-10">
        <div className="text-center px-6 max-w-4xl">
          {/* Logo emblem */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="flex justify-center mb-6"
          >
            <Link href="/axiom">
              <Image
                src="/logo-emblem.png"
                alt="Relic emblem"
                width={200}
                height={200}
                className="h-36 w-36 md:h-44 md:w-44 cursor-pointer hover:scale-105 transition-transform"
                priority
              />
            </Link>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="text-5xl md:text-7xl font-extrabold tracking-[0.25em] mb-2"
          >
            R&ensp;E&ensp;L&ensp;I&ensp;C
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="text-base md:text-lg tracking-[0.8em] text-foreground mb-3 font-bold"
          >
            ·-·&emsp;·&emsp;·-··&emsp;··&emsp;-·-·
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-lg md:text-xl uppercase tracking-[0.3em] text-accent font-bold"
          >
            Custom Fabrications
          </motion.p>
        </div>
      </div>

      {/* Buttons — pinned near bottom */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="relative z-10 flex flex-col sm:flex-row gap-4 justify-center mb-24 md:mb-32"
      >
        <Link href="/work">
          <Button size="lg">View Our Work</Button>
        </Link>
        <Link href="/contact">
          <Button variant="outline" size="lg">
            Start a Project
          </Button>
        </Link>
      </motion.div>
    </section>
  );
}
