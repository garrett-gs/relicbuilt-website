"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { axiom } from "@/lib/axiom-supabase";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Estimate } from "@/types/axiom";
import { EstimateDetail } from "@/app/axiom/estimator/page";
import { persistEstimate, deleteEstimateById } from "@/lib/estimate-actions";

/**
 * Slide-over that hosts the full estimate editor (EstimateDetail) so estimating
 * can happen inline from a Lead or a Wallflower work order — no trip to the
 * standalone Estimator page. Reuses the same persist/delete side-effect logic
 * the Estimator page uses, so behavior is identical everywhere.
 */
export default function EstimateDrawer({
  estimateId,
  onClose,
  onChange,
}: {
  estimateId: string;
  onClose: () => void;
  /** Called after the estimate is edited/deleted so the host can refresh. */
  onChange?: () => void;
}) {
  const { userEmail } = useAuth();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // The drawer mounts fresh per estimate (the host unmounts it on close), so
    // initial state already starts in the loading state — no sync reset needed.
    let active = true;
    axiom
      .from("estimates")
      .select("*")
      .eq("id", estimateId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        // No row (or an error) most often means the estimate belongs to a
        // different workspace than the one you're signed into — RLS hides it,
        // so the fetch comes back empty. Surface that instead of spinning
        // forever on "Loading estimate…".
        setLoadError(error ? error.message : data ? null : "not-visible");
        setEstimate((data as Estimate) || null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [estimateId]);

  async function handleUpdate(u: Partial<Estimate>) {
    setEstimate((prev) => (prev ? { ...prev, ...u } : prev));
    try {
      await persistEstimate(estimateId, u, userEmail);
      onChange?.();
    } catch (e) {
      // Surface a blocked/failed write (e.g. an expired session) rather than
      // letting the optimistic update masquerade as saved.
      alert(e instanceof Error ? e.message : "Couldn't save changes.");
    }
  }

  async function handleDelete() {
    await deleteEstimateById(estimateId, userEmail);
    onChange?.();
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <aside
        style={{ width: "90vw", maxWidth: 1600 }}
        className="fixed right-0 top-0 h-full bg-background border-l border-border z-50 overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-border bg-background">
          <h2 className="text-sm font-heading font-bold uppercase tracking-wider text-muted">
            Estimate
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground" title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="text-muted text-sm animate-pulse">Loading estimate…</div>
          ) : !estimate ? (
            <div className="text-sm text-muted space-y-2">
              <p className="text-foreground font-medium">This estimate couldn&apos;t be loaded.</p>
              <p>
                It isn&apos;t visible in this workspace — usually because the estimate is still
                tagged to a different workspace than the one you&apos;re signed into. The linked
                work order is here, but the estimate needs to be re-homed to this workspace.
              </p>
              <p className="text-[11px] text-muted/60 font-mono">id: {estimateId}{loadError && loadError !== "not-visible" ? ` · ${loadError}` : ""}</p>
            </div>
          ) : (
            <EstimateDetail
              key={estimate.id}
              estimate={estimate}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          )}
        </div>
      </aside>
    </>
  );
}
