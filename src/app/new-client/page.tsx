"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Input, Textarea, Select } from "@/components/ui/Input";
import Button from "@/components/ui/Button";

const projectTypes = [
  { value: "furniture", label: "Custom Furniture" },
  { value: "cabinetry", label: "Cabinetry" },
  { value: "millwork", label: "Millwork" },
  { value: "metalwork", label: "Metalwork" },
  { value: "commercial", label: "Commercial Build-Out" },
  { value: "specialty", label: "Specialty Item" },
  { value: "other", label: "Other" },
];

const budgetRanges = [
  { value: "under-1000", label: "Under $1,000" },
  { value: "1000-5000", label: "$1,000 - $5,000" },
  { value: "5000-10000", label: "$5,000 - $10,000" },
  { value: "10000-25000", label: "$10,000 - $25,000" },
  { value: "25000-plus", label: "$25,000+" },
  { value: "unsure", label: "Not sure yet" },
];

const timelines = [
  { value: "asap", label: "As soon as possible" },
  { value: "1-3-months", label: "1-3 months" },
  { value: "3-6-months", label: "3-6 months" },
  { value: "6-plus-months", label: "6+ months" },
  { value: "flexible", label: "Flexible" },
];

export default function NewClientPage() {
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
        body: JSON.stringify({ ...data, type: "new-client" }),
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
            New Client Form
          </h1>
          <p className="text-muted mb-12">
            Tell us about your project and we&apos;ll get back to you with a
            plan. The more detail you provide, the better we can understand your
            vision.
          </p>

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

            <Input
              label="Phone"
              id="phone"
              name="phone"
              type="tel"
              placeholder="(555) 555-5555"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <Select
                label="Project Type"
                id="project_type"
                name="project_type"
                required
                options={projectTypes}
              />
              <Select
                label="Budget Range"
                id="budget_range"
                name="budget_range"
                required
                options={budgetRanges}
              />
              <Select
                label="Timeline"
                id="timeline"
                name="timeline"
                required
                options={timelines}
              />
            </div>

            <Textarea
              label="Project Description"
              id="description"
              name="description"
              required
              placeholder="Describe your project — dimensions, materials, style preferences, inspiration, and any other details that would help us understand your vision."
            />

            <Button
              type="submit"
              disabled={status === "sending"}
              className="w-full sm:w-auto"
            >
              {status === "sending" ? "Submitting..." : "Submit Inquiry"}
            </Button>

            {status === "sent" && (
              <p className="text-green-500 text-sm">
                Thank you! We&apos;ll review your project details and reach out
                soon.
              </p>
            )}
            {status === "error" && (
              <p className="text-red-500 text-sm">
                Something went wrong. Please try again or call us at (402)
                235-8179.
              </p>
            )}
          </form>
        </motion.div>
      </div>
    </div>
  );
}
