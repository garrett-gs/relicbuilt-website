"use client";

import { motion } from "framer-motion";
import SectionHeading from "@/components/ui/SectionHeading";

const services = [
  {
    title: "Custom Woodworking",
    description:
      "From fine furniture to built-in cabinetry, we craft pieces that are both functional and beautiful.",
  },
  {
    title: "Metalworks",
    description:
      "Steel, iron, and mixed-media fabrication for structural and decorative applications.",
  },
  {
    title: "Millwork & Casework",
    description:
      "Precision millwork for residential and commercial spaces. Trim, molding, and architectural details.",
  },
  {
    title: "Specialty Items",
    description:
      "Shuffleboards, golf lockers, custom displays — if you can dream it, we can build it.",
  },
];

export default function WhatWeDo() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          title="What We Do"
          subtitle="We are a custom woodworking and metalworks shop. From concept to completion, we can build anything."
        />
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
          {services.map((service, i) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true }}
              className="p-8 border border-border hover:border-accent/50 transition-colors"
            >
              <h3 className="text-xl font-bold mb-3">{service.title}</h3>
              <p className="text-muted leading-relaxed">
                {service.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
