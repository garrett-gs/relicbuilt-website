"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import type { WorkspaceBilling } from "@/lib/relicon-billing";
import { formatDate } from "@/lib/utils";

// Re-checks this workspace's Relicon billing when Axiom opens or returns to
// the foreground (the server limits it to hourly), and says so when the bill
// needs attention: a warning during the grace period, and a notice when the
// workspace is read-only or closed. Silent when all is well.
export default function BillingBanner() {
  const [billing, setBilling] = useState<WorkspaceBilling | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      authedFetch("/api/billing/refresh", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { billing?: WorkspaceBilling | null } | null) => {
          if (d?.billing) setBilling(d.billing);
        })
        .catch(() => {});
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  if (!billing) return null;

  if (billing.access === "read_only" || billing.access === "none") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        <Lock size={16} className="mt-0.5 shrink-0" />
        <p>
          {billing.access === "read_only"
            ? `${billing.name} is read-only: the Relicon bill is past due. You can view everything, but nothing can be added or changed until it's paid.`
            : `${billing.name}'s Relicon plan has ended.`}
        </p>
      </div>
    );
  }

  if (billing.billing_status === "past_due" && billing.grace_ends_at) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p>
          The last Relicon payment for {billing.name} didn&apos;t go through. Everything keeps working until{" "}
          {formatDate(billing.grace_ends_at)}; after that the workspace becomes read-only until it&apos;s paid.
        </p>
      </div>
    );
  }

  return null;
}
