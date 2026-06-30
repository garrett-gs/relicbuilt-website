"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Estimate, Settings } from "@/types/axiom";
import { generateEstimateProposalHtml } from "@/lib/proposal-html";

interface ApprovalResult {
  project_name: string;
  total_amount: number;
  biz_name: string;
}

function calcTotals(est: Estimate) {
  const materialTotal = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const laborTotal = (est.labor_items || []).reduce((s, l) => s + (l.cost || 0), 0);
  const subtotal = materialTotal + laborTotal;
  const markupAmount = subtotal * ((est.markup_percent || 0) / 100);
  const total = Math.round((subtotal + markupAmount) * 100) / 100;
  return { materialTotal, laborTotal, markupAmount, total };
}

export default function ProposalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [settings, setSettings] = useState<Partial<Settings> | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ApprovalResult | null>(null);
  const [alreadyApproved, setAlreadyApproved] = useState(false);
  const [expired, setExpired] = useState(false);
  const [clientCompany, setClientCompany] = useState<string>("");

  useEffect(() => {
    if (!token) return;
    // Fire-and-forget audit log for "viewed" — we record IP + UA server-side
    fetch("/api/log-proposal-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {});

    // Single server-side fetch via service role — works regardless of
    // whether estimates / customers / companies / settings have anon
    // RLS policies. The proposal_token IS the access control.
    fetch(`/api/proposal-context/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.estimate) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const e = data.estimate as Estimate;
        setEstimate(e);
        if (e.proposal_status === "approved") setAlreadyApproved(true);
        if (
          e.proposal_expires_at &&
          new Date(e.proposal_expires_at).getTime() < Date.now() &&
          e.proposal_status !== "approved"
        ) {
          setExpired(true);
        }
        if (data.settings) setSettings(data.settings as Settings);
        if (data.clientCompany) setClientCompany(data.clientCompany);
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [token]);

  async function handleAccept() {
    if (!signatureName.trim() || signatureName.trim().length < 2) {
      setError("Please type your full name to sign.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/approve-estimate-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signatureName: signatureName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not submit. Please try again.");
        setSubmitting(false);
        return;
      }
      if (data.already_approved) {
        setAlreadyApproved(true);
        setSubmitting(false);
        return;
      }
      setResult(data as ApprovalResult);
      setSubmitting(false);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", color: "#666", fontFamily: "Arial,Helvetica,sans-serif" }}>
        Loading proposal…
      </div>
    );
  }

  if (notFound || !estimate) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "Arial,Helvetica,sans-serif" }}>
        <div style={{ maxWidth: 480, background: "#fff", padding: 48, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#111" }}>Proposal Not Found</h1>
          <p style={{ margin: 0, color: "#666", fontSize: 14, lineHeight: 1.6 }}>
            This link may have been mistyped or the proposal may have been removed.
            Please contact us if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  // ── Approval confirmation screen ─────────────────────────────────────
  if (result) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "48px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", background: "#fff", padding: 48, textAlign: "center", borderTop: "4px solid #5b642e" }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            border: "3px solid #22c55e", color: "#22c55e",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", fontSize: 40,
          }}>✓</div>
          <h1 style={{ margin: "0 0 12px", fontSize: 26, color: "#111" }}>Proposal Approved</h1>
          <p style={{ margin: "0 0 24px", color: "#666", fontSize: 15, lineHeight: 1.6 }}>
            Thank you, {signatureName}. <strong>{result.project_name}</strong> is approved. We&apos;ll be in touch with next steps.
          </p>
          <p style={{ margin: 0, color: "#666", fontSize: 13, lineHeight: 1.6 }}>
            A copy of this approved proposal stays available at this link for your records.
          </p>
        </div>
      </div>
    );
  }

  // ── Expired ─────────────────────────────────────────────────────────
  if (expired) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "48px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
        <div style={{ maxWidth: 540, margin: "0 auto", background: "#fff", padding: 48, textAlign: "center", borderTop: "4px solid #f59e0b" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#111" }}>Proposal Expired</h1>
          <p style={{ margin: "0 0 16px", color: "#666", fontSize: 14, lineHeight: 1.6 }}>
            This proposal for <strong>{estimate.project_name || ""}</strong> expired on{" "}
            <strong>
              {estimate.proposal_expires_at
                ? new Date(estimate.proposal_expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                : "an earlier date"}
            </strong>.
          </p>
          <p style={{ margin: 0, color: "#666", fontSize: 13, lineHeight: 1.6 }}>
            Please reach out and we&apos;ll send you an updated proposal.
          </p>
        </div>
      </div>
    );
  }

  // ── Already approved ─────────────────────────────────────────────────
  // Keep the proposal content visible so the customer always has access
  // to what they approved. A signed-on banner replaces the acceptance form.
  if (alreadyApproved) {
    const totals = calcTotals(estimate);
    const approvedAt = estimate.proposal_approved_at
      ? new Date(estimate.proposal_approved_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "";

    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "32px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
        {/* Proposal body — same as the unsigned view, kept available for reference */}
        <div
          style={{ maxWidth: 760, margin: "0 auto", background: "#fff" }}
          dangerouslySetInnerHTML={{
            __html: generateEstimateProposalHtml({
              estimate,
              biz: settings || {},
              totals,
              clientCompany: clientCompany || undefined,
            }),
          }}
        />

        {/* Signed banner — sits where the acceptance form used to */}
        <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff", padding: 48, borderTop: "3px solid #22c55e" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "#dcfce7", color: "#15803d",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 700, flexShrink: 0,
            }}>✓</div>
            <h2 style={{ margin: 0, fontSize: 18, color: "#15803d" }}>
              This proposal is signed{approvedAt ? ` (${approvedAt})` : ""}.
            </h2>
          </div>
          <p style={{ margin: "0 0 24px", color: "#555", fontSize: 14, lineHeight: 1.6 }}>
            Keep this page bookmarked for your records. The full proposal stays accessible
            here so you can refer back to it any time.
          </p>

          <p style={{ margin: "20px 0 0", textAlign: "center", color: "#999", fontSize: 11 }}>
            {settings?.biz_name || "RELIC"} · {settings?.biz_phone || ""}
          </p>
        </div>
      </div>
    );
  }

  // ── Main proposal display ────────────────────────────────────────────
  const totals = calcTotals(estimate);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "32px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
      {/* Proposal body */}
      <div
        style={{ maxWidth: 760, margin: "0 auto", background: "#fff" }}
        dangerouslySetInnerHTML={{
          __html: generateEstimateProposalHtml({
            estimate,
            biz: settings || {},
            totals,
            clientCompany: clientCompany || undefined,
          }),
        }}
      />

      {/* Acceptance form — sticky at the bottom of the document */}
      <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff", padding: 48, borderTop: "3px solid #5b642e" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, textTransform: "uppercase", letterSpacing: "0.12em", color: "#111" }}>
          Accept This Proposal
        </h2>
        <p style={{ margin: "0 0 24px", color: "#666", fontSize: 14, lineHeight: 1.6 }}>
          By typing your name below and clicking Accept, you approve the scope and details
          outlined in this proposal. Once approved, {settings?.biz_name || "RELIC"} will add it to your project.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888", marginBottom: 6 }}>
            Your Full Name (electronic signature)
          </label>
          <input
            type="text"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            placeholder="Type your full name"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "14px 16px",
              fontSize: 18,
              fontFamily: "Georgia, serif",
              fontStyle: "italic",
              border: "1px solid #ccc",
              background: "#fff",
              color: "#111",
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.border = "1px solid #5b642e")}
            onBlur={(e) => (e.target.style.border = "1px solid #ccc")}
          />
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 12, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={submitting || !signatureName.trim()}
          style={{
            width: "100%",
            padding: "16px",
            background: submitting || !signatureName.trim() ? "#ccc" : "#5b642e",
            color: "#0a0a0a",
            border: "none",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: submitting || !signatureName.trim() ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting…" : "Accept & Sign Proposal"}
        </button>

        <p style={{ margin: "20px 0 0", textAlign: "center", color: "#999", fontSize: 11 }}>
          {settings?.biz_name || "RELIC"} · {settings?.biz_phone || ""}
        </p>
      </div>
    </div>
  );
}
