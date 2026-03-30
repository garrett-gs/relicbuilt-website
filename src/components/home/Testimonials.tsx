"use client";

import { motion } from "framer-motion";
import SectionHeading from "@/components/ui/SectionHeading";

const testimonials = [
  {
    quote: "Insane craftsmanship!",
    author: "Client",
  },
  {
    quote:
      "Relic delivered exactly what we envisioned, on time and with incredible attention to detail.",
    author: "Client",
  },
  {
    quote:
      "The quality of work exceeded our expectations. Truly one-of-a-kind pieces.",
    author: "Client",
  },
  {
    quote:
      "Professional from start to finish. We couldn't be happier with the results.",
    author: "Client",
  },
];

export default function Testimonials() {
  return (
    <section className="py-24 px-6 bg-card">
      <div className="max-w-7xl mx-auto">
        <SectionHeading title="What Our Clients Say" />
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {testimonials.map((testimonial, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true }}
              className="p-6 border border-border"
            >
              <p className="text-foreground italic mb-4 leading-relaxed">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <p className="text-muted text-sm uppercase tracking-wider">
                &mdash; {testimonial.author}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
