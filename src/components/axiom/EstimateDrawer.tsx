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

  useEffect(() => {
    let active = true;
    setLoading(true);
    axiom
      .from("estimates")
      .select("*")
      .eq("id", estimateId)
      .single()
      .then(({ data }) => {
        if (!active) return;
        setEstimate(data as Estimate);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [estimateId]);

  async function handleUpdate(u: Partial<Estimate>) {
    setEstimate((prev) => (prev ? { ...prev, ...u } : prev));
    await persistEstimate(estimateId, u, userEmail);
    onChange?.();
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
          {loading || !estimate ? (
            <div className="text-muted text-sm animate-pulse">Loading estimate…</div>
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
