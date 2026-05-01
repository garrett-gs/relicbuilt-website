"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { axiom } from "@/lib/axiom-supabase";
import { Estimate, Settings } from "@/types/axiom";
import { generateEstimateProposalHtml } from "@/lib/proposal-html";

interface ApprovalResult {
  project_name: string;
  deposit_invoice_id: string;
  deposit_invoice_number: string;
  deposit_amount: number;
  balance_amount: number;
  total_amount: number;
  deposit_percent: number;
  deposit_due_date?: string;
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

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
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

  useEffect(() => {
    if (!token) return;
    // Fire-and-forget audit log for "viewed" — we record IP + UA server-side
    fetch("/api/log-proposal-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {});

    Promise.all([
      axiom.from("estimates").select("*").eq("proposal_token", token).single(),
      axiom.from("settings").select("*").limit(1).single(),
    ]).then(([estRes, setRes]) => {
      if (estRes.error || !estRes.data) {
        setNotFound(true);
      } else {
        setEstimate(estRes.data as Estimate);
        if ((estRes.data as Estimate).proposal_status === "approved") {
          setAlreadyApproved(true);
        }
      }
      const e = estRes.data as Estimate | null;
      if (e?.proposal_expires_at && new Date(e.proposal_expires_at).getTime() < Date.now() && e.proposal_status !== "approved") {
        setExpired(true);
      }
      if (setRes.data) setSettings(setRes.data as Settings);
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
    const dueByText = result.deposit_due_date
      ? new Date(result.deposit_due_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : null;
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "48px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", background: "#fff", padding: 48, textAlign: "center", borderTop: "4px solid #c4a24d" }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            border: "3px solid #22c55e", color: "#22c55e",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", fontSize: 40,
          }}>✓</div>
          <h1 style={{ margin: "0 0 12px", fontSize: 26, color: "#111" }}>Proposal Approved</h1>
          <p style={{ margin: "0 0 32px", color: "#666", fontSize: 15, lineHeight: 1.6 }}>
            Thank you, {signatureName}. <strong>{result.project_name}</strong> is approved.
          </p>

          <div style={{ background: "#f8f6f0", padding: 24, marginBottom: 16, textAlign: "left" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.12em", color: "#888" }}>Deposit Invoice</h2>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e5e0d8" }}>
              <span style={{ color: "#666", fontSize: 14 }}>Invoice #</span>
              <span style={{ fontFamily: "monospace", fontSize: 14, color: "#111" }}>{result.deposit_invoice_number}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #e5e0d8" }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>Deposit Due</span>
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: "#c4a24d" }}>{money(result.deposit_amount)}</span>
            </div>
            {dueByText && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e5e0d8" }}>
                <span style={{ fontSize: 13, color: "#666" }}>Deposit Due By</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{dueByText}</span>
              </div>
            )}
            {result.balance_amount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", color: "#888", fontSize: 12 }}>
                <span>Balance at Completion</span>
                <span style={{ fontFamily: "monospace" }}>{money(result.balance_amount)}</span>
              </div>
            )}
          </div>

          {/* Pay Now button — strike while the iron is hot */}
          {result.deposit_invoice_id && (
            <>
              <a
                href={`/pay/${result.deposit_invoice_id}`}
                style={{
                  display: "block",
                  background: "#c4a24d",
                  color: "#0a0a0a",
                  padding: "18px 24px",
                  textDecoration: "none",
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  textAlign: "center",
                  marginBottom: 12,
                }}
              >
                Pay Deposit Now → Card or ACH
              </a>
              <p style={{ margin: "0 0 24px", color: "#888", fontSize: 11, textAlign: "center", lineHeight: 1.5 }}>
                Choose card (instant, 2.9% + $0.30 fee) or ACH bank transfer (3–5 days, lower fee)
                on the next screen. We&apos;ve also emailed you the payment link.
              </p>
            </>
          )}

          <p style={{ margin: "0 0 16px", padding: "12px 16px", background: "#fff8e1", border: "1px solid #f0d896", color: "#7a5a00", fontSize: 13, fontWeight: 500, textAlign: "left" }}>
            Balances are due prior to delivery.
          </p>

          <p style={{ margin: 0, color: "#666", fontSize: 13, lineHeight: 1.6 }}>
            Prefer to pay by check or other method? Just reply to your email confirmation
            and {result.biz_name} will be in touch.
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
  if (alreadyApproved) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "48px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", background: "#fff", padding: 48, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 24, color: "#111" }}>Proposal Already Approved</h1>
          <p style={{ margin: 0, color: "#666", fontSize: 14, lineHeight: 1.6 }}>
            This proposal for <strong>{estimate.project_name}</strong> has already been approved.
            If you have questions, please contact us.
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
          }),
        }}
      />

      {/* Acceptance form — sticky at the bottom of the document */}
      <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff", padding: 48, borderTop: "3px solid #c4a24d" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, textTransform: "uppercase", letterSpacing: "0.12em", color: "#111" }}>
          Accept This Proposal
        </h2>
        <p style={{ margin: "0 0 24px", color: "#666", fontSize: 14, lineHeight: 1.6 }}>
          By typing your name below and clicking Accept, you authorize {settings?.biz_name || "RELIC"} to begin
          work as outlined above. You&apos;ll receive your deposit invoice immediately after.
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
            onFocus={(e) => (e.target.style.border = "1px solid #c4a24d")}
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
            background: submitting || !signatureName.trim() ? "#ccc" : "#c4a24d",
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
