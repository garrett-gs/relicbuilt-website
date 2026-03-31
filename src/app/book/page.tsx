"use client";

import { useState } from "react";
import { formatPhone } from "@/lib/utils";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input, Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const timeSlots = [
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function BookingPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
    setSelectedDate(null);
    setSelectedTime(null);
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
    setSelectedDate(null);
    setSelectedTime(null);
  }

  function isDatePast(day: number) {
    const date = new Date(year, month, day);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return date < todayStart;
  }

  function isWeekend(day: number) {
    const date = new Date(year, month, day);
    const dow = date.getDay();
    return dow === 0 || dow === 6;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedDate || !selectedTime) return;

    setStatus("sending");
    const formData = new FormData(e.currentTarget);
    const data = {
      ...Object.fromEntries(formData),
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(selectedDate).padStart(2, "0")}`,
      time: selectedTime,
    };

    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setStatus("sent");
        (e.target as HTMLFormElement).reset();
        setSelectedDate(null);
        setSelectedTime(null);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Book an Appointment
          </h1>
          <p className="text-muted mb-12">
            Select a date and time to schedule a consultation about your
            project.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Calendar */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <button onClick={prevMonth} className="text-muted hover:text-foreground">
                <ChevronLeft size={20} />
              </button>
              <h2 className="text-lg font-bold">
                {monthNames[month]} {year}
              </h2>
              <button onClick={nextMonth} className="text-muted hover:text-foreground">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="text-xs text-muted uppercase py-2">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const past = isDatePast(day);
                const weekend = isWeekend(day);
                const disabled = past || weekend;

                return (
                  <button
                    key={day}
                    disabled={disabled}
                    onClick={() => {
                      setSelectedDate(day);
                      setSelectedTime(null);
                    }}
                    className={cn(
                      "py-2 text-sm transition-all",
                      disabled && "text-muted/30 cursor-not-allowed",
                      !disabled && "hover:bg-accent/20 cursor-pointer",
                      selectedDate === day &&
                        "bg-accent text-background font-bold"
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div className="mt-8">
                <h3 className="text-sm uppercase tracking-wider text-muted mb-3">
                  Available Times
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => setSelectedTime(slot)}
                      className={cn(
                        "py-2 px-4 text-sm border transition-all",
                        selectedTime === slot
                          ? "border-accent text-accent bg-accent/10"
                          : "border-border text-muted hover:border-accent/50"
                      )}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Booking form */}
          <div>
            {selectedDate && selectedTime ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="bg-card border border-border p-4 mb-6">
                  <p className="text-sm text-muted">Selected:</p>
                  <p className="font-bold">
                    {monthNames[month]} {selectedDate}, {year} at {selectedTime}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
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
                  <Input
                    label="Phone"
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="(###) ###-####"
                    onChange={(e) => { e.target.value = formatPhone(e.target.value); }}
                  />
                  <Textarea
                    label="Project Notes"
                    id="notes"
                    name="notes"
                    placeholder="Tell us briefly about your project so we can prepare for your appointment."
                  />

                  <Button
                    type="submit"
                    disabled={status === "sending"}
                    className="w-full"
                  >
                    {status === "sending"
                      ? "Booking..."
                      : "Confirm Appointment"}
                  </Button>

                  {status === "sent" && (
                    <p className="text-green-500 text-sm">
                      Appointment booked! We&apos;ll send you a confirmation
                      email.
                    </p>
                  )}
                  {status === "error" && (
                    <p className="text-red-500 text-sm">
                      Something went wrong. Please try again or call us.
                    </p>
                  )}
                </form>
              </motion.div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted">
                <p>Select a date and time to continue</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
