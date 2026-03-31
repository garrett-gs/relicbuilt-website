"use client";

import { useState } from "react";
import { formatPhone } from "@/lib/utils";
import { motion } from "framer-motion";
import { Input, Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { Phone, Mail } from "lucide-react";

export default function ContactPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setStatus("sent");
        (e.target as HTMLFormElement).reset();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Contact Us
          </h1>
          <p className="text-muted mb-4">
            Book an appointment to get started on your project and find out the
            value we offer our clients.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 mb-12">
            <a
              href="tel:4022358179"
              className="flex items-center gap-2 text-muted hover:text-accent transition-colors"
            >
              <Phone size={18} />
              (402) 235-8179
            </a>
            <a
              href="mailto:info@relicbuilt.com"
              className="flex items-center gap-2 text-muted hover:text-accent transition-colors"
            >
              <Mail size={18} />
              info@relicbuilt.com
            </a>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Input
                label="Name"
                id="name"
                name="name"
                required
                placeholder="Your name"
              />
              <Input
                label="Email"
                id="email"
                name="email"
                type="email"
                required
                placeholder="your@email.com"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Input
                label="Phone"
                id="phone"
                name="phone"
                type="tel"
                placeholder="(###) ###-####"
                onChange={(e) => { e.target.value = formatPhone(e.target.value); }}
              />
              <Input
                label="Subject"
                id="subject"
                name="subject"
                required
                placeholder="Project inquiry"
              />
            </div>
            <Textarea
              label="Message"
              id="message"
              name="message"
              required
              placeholder="Please provide any information relevant to your project. If you'd like to schedule an appointment, list times and dates that work best."
            />

            <Button
              type="submit"
              disabled={status === "sending"}
              className="w-full sm:w-auto"
            >
              {status === "sending" ? "Sending..." : "Send Message"}
            </Button>

            {status === "sent" && (
              <p className="text-green-500 text-sm">
                Message sent! We&apos;ll get back to you soon.
              </p>
            )}
            {status === "error" && (
              <p className="text-red-500 text-sm">
                Something went wrong. Please try again or call us directly.
              </p>
            )}
          </form>
        </motion.div>
      </div>
    </div>
  );
}
