"use client";

import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Link from "next/link";

export default function CTA() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Video placeholder */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="aspect-video bg-card border border-border flex items-center justify-center"
          >
            <p className="text-muted text-sm uppercase tracking-wider">
              Video Coming Soon
            </p>
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Have an Idea? Let&apos;s Build It.
            </h2>
            <p className="text-muted leading-relaxed mb-8">
              Whether it&apos;s a custom dining table, a commercial build-out,
              or something entirely unique — we&apos;d love to hear about your
              project. Book an appointment to get started and find out the value
              we offer our clients.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/book">
                <Button>Book Appointment</Button>
              </Link>
              <Link href="/new-client">
                <Button variant="outline">New Client Form</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
