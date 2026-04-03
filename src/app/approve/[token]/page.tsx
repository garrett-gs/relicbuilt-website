"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { axiom } from "@/lib/axiom-supabase";
import { CustomWork } from "@/types/axiom";
import { CheckCircle, Loader2 } from "lucide-react";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

export default function ApprovePage() {
  const params = useParams();
  const token = params.token as string;

  const [project, setProject] = useState<CustomWork | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [alreadyApproved, setAlreadyApproved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    axiom
      .from("custom_work")
      .select("id,project_name,client_name,client_email,quoted_amount,proposal_status,proposal_approved_at,proposal_scope,proposal_cost_section,proposal_highlights,project_description,start_date,due_date")
      .eq("proposal_token", token)
      .single()
      .then(({ data }) => {
        setLoading(false);
        if (!data) { setNotFound(true); return; }
        setProject(data as CustomWork);
        if (data.proposal_status === "approved") setAlreadyApproved(true);
      });
  }, [token]);

  async function handleApprove() {
    setApproving(true);
    setError("");
    try {
      const res = await fetch("/api/approve-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again or contact us.");
        setApproving(false);
        return;
      }
      if (data.already_approved) {
        setAlreadyApproved(true);
      } else {
        setApproved(true);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setApproving(false);
  }

  const stripeColor = "#8b6914";

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // Not found
  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white max-w-md w-full p-10 text-center shadow-sm">
          <img src="/logo-full.png" alt="RELIC" className="h-14 object-contain mx-auto mb-8" />
          <p className="text-gray-500 text-sm">This proposal link is invalid or has expired.</p>
          <p className="mt-2 text-xs text-gray-400">Please contact us if you believe this is an error.</p>
          <p className="mt-6 text-xs text-gray-400">RELIC Custom Fabrications &nbsp;&middot;&nbsp; (402) 235-8179</p>
        </div>
      </div>
    );
  }

  // Already approved
  if (alreadyApproved || !project) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white max-w-md w-full p-10 text-center shadow-sm">
          <img src="/logo-full.png" alt="RELIC" className="h-14 object-contain mx-auto mb-8" />
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Proposal Approved</h2>
          <p className="text-gray-500 text-sm">
            This proposal for <strong>{project?.project_name}</strong> has already been approved.
            You should receive a deposit invoice by email.
          </p>
          <p className="mt-6 text-xs text-gray-400">
            Questions? Call us at (402) 235-8179
          </p>
        </div>
      </div>
    );
  }

  // Success state after clicking Approve
  if (approved) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white max-w-md w-full p-10 text-center shadow-sm">
          <img src="/logo-full.png" alt="RELIC" className="h-14 object-contain mx-auto mb-8" />
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Proposal Approved!</h2>
          <p className="text-gray-700 text-sm mb-4">
            Thank you, <strong>{project.client_name}</strong>! Your proposal for{" "}
            <strong>{project.project_name}</strong> has been approved.
          </p>
          <p className="text-gray-500 text-sm mb-6">
            A deposit invoice has been sent to <strong>{project.client_email}</strong>.
            We&apos;ll be in touch shortly to get started.
          </p>
          <div className="border-t border-gray-100 pt-6">
            <p className="text-xs text-gray-400">RELIC Custom Fabrications</p>
            <p className="text-xs text-gray-400">(402) 235-8179 &nbsp;&middot;&nbsp; relicbuilt.com</p>
          </div>
        </div>
      </div>
    );
  }

  // Proposal summary + Approve button
  const costSection = project.proposal_cost_section?.included !== false ? project.proposal_cost_section : null;
  const totalAmount = project.quoted_amount || 0;
  const depositAmount = costSection?.deposit_amount || 0;
  const balanceAmount = depositAmount > 0 ? totalAmount - depositAmount : 0;
  const highlights = (project.proposal_highlights || []).filter((h) => h.included !== false);
  const scope = project.proposal_scope?.included !== false ? project.proposal_scope?.body : "";

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white shadow-sm">

        {/* Header */}
        <div className="flex justify-between items-start px-8 pt-8 pb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-full.png" alt="RELIC Custom Fabrications" className="h-16 object-contain object-left" />
          <div className="text-right">
            <h1 className="text-2xl font-bold text-gray-900 tracking-wide">PROPOSAL</h1>
            <p className="text-xs text-gray-400 mt-1">relicbuilt.com</p>
          </div>
        </div>

        <div className="mx-8 border-t border-gray-200" />

        {/* Client info */}
        <div className="px-8 py-6">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#c4a24d" }}>Prepared For</p>
          <p className="font-bold text-gray-900 text-lg">{project.client_name}</p>
          {project.client_email && <p className="text-sm text-gray-500 mt-0.5">{project.client_email}</p>}
        </div>

        {/* Project stripe */}
        <div className="px-8 py-3" style={{ background: stripeColor }}>
          <p className="text-sm font-bold text-white uppercase tracking-widest">Project</p>
        </div>
        <div className="px-8 py-5 border-b border-gray-100">
          <p className="font-bold text-gray-900">{project.project_name}</p>
          {project.project_description && (
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{project.project_description}</p>
          )}
        </div>

        {/* Scope */}
        {scope && (
          <>
            <div className="px-8 py-3" style={{ background: stripeColor }}>
              <p className="text-sm font-bold text-white uppercase tracking-widest">Scope of Work</p>
            </div>
            <div className="px-8 py-5 border-b border-gray-100">
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{scope}</p>
            </div>
          </>
        )}

        {/* Highlights */}
        {highlights.length > 0 && (
          <>
            <div className="px-8 py-3" style={{ background: stripeColor }}>
              <p className="text-sm font-bold text-white uppercase tracking-widest">Project Highlights</p>
            </div>
            <div className="px-8 py-5 border-b border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {highlights.map((h, i) => (
                  <div key={i} className="border-l-4 pl-4 py-1" style={{ borderColor: "#c4a24d" }}>
                    <p className="font-semibold text-gray-900 text-sm mb-1">{h.title}</p>
                    <p className="text-sm text-gray-600 leading-relaxed">{h.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Pricing */}
        {costSection && costSection.items.length > 0 && (
          <>
            <div className="px-8 py-3" style={{ background: stripeColor }}>
              <p className="text-sm font-bold text-white uppercase tracking-widest">Pricing</p>
            </div>
            {costSection.items.map((item, i) => (
              <div key={i} className="flex justify-between px-8 py-3 border-b border-gray-100 text-sm">
                <span className="text-gray-700">{item.description}</span>
                <span className="font-bold font-mono text-gray-900">{money(item.cost || 0)}</span>
              </div>
            ))}
            {costSection.show_total !== false && (() => {
              const costTotal = costSection.items.reduce((s, it) => s + (it.cost || 0), 0);
              const dep = costSection.deposit_amount || 0;
              const bal = costTotal - dep;
              return (
                <div className="px-8 py-4">
                  <div className="flex justify-between bg-gray-100 px-4 py-3 font-bold text-sm text-gray-900">
                    <span>Total:</span>
                    <span className="font-mono">{money(costTotal)}</span>
                  </div>
                  {dep > 0 && (
                    <>
                      <div className="flex justify-between px-4 py-2 text-sm font-semibold text-gray-700 border border-t-0 border-gray-200">
                        <span>Deposit Due:</span>
                        <span className="font-mono">{money(dep)}</span>
                      </div>
                      <div className="flex justify-between px-4 py-1 text-xs text-gray-400">
                        <span>Balance Due at Completion:</span>
                        <span className="font-mono">{money(bal)}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* Approve CTA */}
        <div className="px-8 py-8 border-t border-gray-200">
          <div className="bg-amber-50 border border-amber-200 rounded p-6 text-center">
            <p className="font-bold text-gray-900 text-base mb-2">Ready to move forward?</p>
            <p className="text-sm text-gray-600 mb-5">
              By clicking below, you approve this proposal for{" "}
              <strong>{project.project_name}</strong>
              {depositAmount > 0 && ` and agree to pay a deposit of ${money(depositAmount)}`}
              {balanceAmount > 0 && `, with a balance of ${money(balanceAmount)} due at completion`}.
            </p>

            {error && (
              <p className="text-red-500 text-sm mb-4">{error}</p>
            )}

            <button
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center justify-center gap-2 px-8 py-3 text-white font-bold text-base disabled:opacity-60 hover:opacity-90 transition-opacity"
              style={{ background: "#c4a24d" }}
            >
              {approving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Approving…
                </>
              ) : (
                "Approve This Proposal →"
              )}
            </button>

            <p className="text-xs text-gray-400 mt-4">
              By approving, you agree to the terms of this proposal.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8">
          <p className="text-xs text-gray-300 text-center">
            RELIC &middot; Custom Fabrications &middot; (402) 235-8179 &middot; relicbuilt.com
          </p>
        </div>

      </div>
    </div>
  );
}
