"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BuildCalendarGrid from "@/components/axiom/BuildCalendarGrid";
import type { CalendarData } from "@/lib/calendar-data";

/**
 * Public, read-only Build Calendar reached by a share token
 * (/calendar/<token>). No login, no sidebar — just the month grid, so it can
 * be sent to anyone who needs to see the build schedule.
 */
export default function SharedCalendarPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";
  const [data, setData] = useState<(CalendarData & { brand?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/calendar-context/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Couldn't load the calendar."))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background, #0a0a0a)" }} className="bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-muted">{data?.brand || "Build Calendar"}</p>
          <h1 className="text-2xl font-heading font-bold">Build Calendar</h1>
        </div>

        {loading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : error ? (
          <div className="bg-card border border-border p-6 text-center">
            <p className="text-foreground font-medium mb-1">Calendar unavailable</p>
            <p className="text-muted text-sm">{error}</p>
          </div>
        ) : data ? (
          <BuildCalendarGrid
            projects={data.projects}
            estimateHoursById={data.estimateHoursById}
            tentatives={data.tentatives}
            tentativeHours={data.tentativeHours}
          />
        ) : null}

        <p className="text-[11px] text-muted mt-6">Read-only shared view · dates are tentative until confirmed.</p>
      </div>
    </div>
  );
}
