"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Estimate, MasterProject, Settings } from "@/types/axiom";
import { generateMasterProposalHtml, type MasterProposalBuild } from "@/lib/proposal-html";
import { proposalBiz, resolveEntityProfile } from "@/lib/entity-profile";

interface ApprovalResult {
  project_name: string;
  projects?: string[];
  total_amount: number;
  biz_name: string;
}

function calcTotals(est: Estimate) {
  const materialTotal = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const laborTotal = (est.labor_items || []).reduce((s, l) => s + (l.cost || 0), 0);
  const subtotal = materialTotal + laborTotal;
  const markupAmount = subtotal * ((est.markup_percent || 0) / 100);
  const total = Math.round((subtotal + markupAmount + (est.adjustment || 0)) * 100) / 100;
  return { materialTotal, laborTotal, markupAmount, total };
}

export default function MasterProposalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [master, setMaster] = useState<MasterProject | null>(null);
  const [builds, setBuilds] = useState<Estimate[]>([]);
  const [settings, setSettings] = useState<Partial<Settings> | null>(null);
  const [clientCompany, setClientCompany] = useState<string>("");
  const [clientAddress, setClientAddress] = useState<string>("");
  const [signatureName, setSignatureName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ApprovalResult | null>(null);
  const [alreadyApproved, setAlreadyApproved] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/master-proposal-context/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.master) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const m = data.master as MasterProject;
        setMaster(m);
        setBuilds((data.builds as Estimate[]) || []);
        if (data.settings) setSettings(data.settings as Settings);
        if (data.clientCompany) setClientCompany(data.clientCompany);
        if (data.clientAddress) setClientAddress(data.clientAddress);
        if (m.proposal_status === "approved") setAlreadyApproved(true);
        if (m.proposal_expires_at && new Date(m.proposal_expires_at).getTime() < Date.now() && m.proposal_status !== "approved") {
          setExpired(true);
        }
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  async function handleAccept() {
    if (!signatureName.trim() || signatureName.trim().length < 2) {
      setError("Please type your full name to sign.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/approve-master-proposal", {
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
      if (data.pay_url) { window.location.href = data.pay_url; return; }
      if (data.already_approved) { setAlreadyApproved(true); setSubmitting(false); return; }
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

  if (notFound || !master) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "Arial,Helvetica,sans-serif" }}>
        <div style={{ maxWidth: 480, background: "#fff", padding: 48, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#111" }}>Proposal Not Found</h1>
          <p style={{ margin: 0, color: "#666", fontSize: 14, lineHeight: 1.6 }}>
            This link may have been mistyped or the proposal may have been removed. Please contact us if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  const entity = builds[0]?.entity;
  const profile = resolveEntityProfile(entity, settings);
  const buildArgs: MasterProposalBuild[] = builds.map((e) => ({ estimate: e, totals: calcTotals(e) }));
  const grandTotal = buildArgs.reduce((s, b) => s + b.totals.total, 0);

  const bodyHtml = generateMasterProposalHtml({
    masterName: master.name,
    builds: buildArgs,
    biz: proposalBiz(entity, settings),
    clientCompany: clientCompany || undefined,
    clientAddress: clientAddress || undefined,
    sentAt: master.proposal_sent_at || undefined,
    expiresAt: master.proposal_expires_at || undefined,
  });

  // Approval confirmation
  if (result) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "48px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", background: "#fff", padding: 48, textAlign: "center", borderTop: `4px solid ${profile.accent}` }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", border: "3px solid #22c55e", color: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 40 }}>✓</div>
          <h1 style={{ margin: "0 0 12px", fontSize: 26, color: "#111" }}>Proposal Approved</h1>
          <p style={{ margin: "0 0 24px", color: "#666", fontSize: 15, lineHeight: 1.6 }}>
            Thank you, {signatureName}. <strong>{master.name}</strong> is approved{result.projects && result.projects.length ? ` (${result.projects.length} ${result.projects.length === 1 ? "build" : "builds"})` : ""}. We&apos;ll be in touch with next steps.
          </p>
          <p style={{ margin: 0, color: "#666", fontSize: 13, lineHeight: 1.6 }}>A copy stays available at this link for your records.</p>
        </div>
      </div>
    );
  }

  // Expired
  if (expired) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "48px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
        <div style={{ maxWidth: 540, margin: "0 auto", background: "#fff", padding: 48, textAlign: "center", borderTop: "4px solid #f59e0b" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#111" }}>Proposal Expired</h1>
          <p style={{ margin: "0 0 16px", color: "#666", fontSize: 14, lineHeight: 1.6 }}>
            This proposal for <strong>{master.name}</strong> expired on{" "}
            <strong>{master.proposal_expires_at ? new Date(master.proposal_expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "an earlier date"}</strong>.
          </p>
          <p style={{ margin: 0, color: "#666", fontSize: 13, lineHeight: 1.6 }}>Please reach out and we&apos;ll send you an updated proposal.</p>
        </div>
      </div>
    );
  }

  // Already approved — keep the document visible with a signed banner.
  if (alreadyApproved) {
    const approvedAt = master.proposal_approved_at
      ? new Date(master.proposal_approved_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "";
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "32px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff" }} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff", padding: 48, borderTop: "3px solid #22c55e" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#dcfce7", color: "#15803d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, flexShrink: 0 }}>✓</div>
            <h2 style={{ margin: 0, fontSize: 18, color: "#15803d" }}>This proposal is signed{approvedAt ? ` (${approvedAt})` : ""}.</h2>
          </div>
          <p style={{ margin: "0 0 24px", color: "#555", fontSize: 14, lineHeight: 1.6 }}>Keep this page bookmarked for your records. The full proposal stays accessible here.</p>
          <p style={{ margin: "20px 0 0", textAlign: "center", color: "#999", fontSize: 11 }}>{profile.name} · {profile.phone || ""}</p>
        </div>
      </div>
    );
  }

  // Not sent yet
  if (master.proposal_status !== "sent") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", padding: "48px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
        <div style={{ maxWidth: 520, background: "#fff", padding: 48, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#111" }}>Your Proposal Is Being Prepared</h1>
          <p style={{ margin: 0, color: "#666", fontSize: 14, lineHeight: 1.6 }}>
            We&apos;re finalizing the details for <strong>{master.name}</strong>. You&apos;ll be able to review and sign right here as soon as it&apos;s ready.
          </p>
        </div>
      </div>
    );
  }

  // Main signable display
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "32px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff" }} dangerouslySetInnerHTML={{ __html: bodyHtml }} />

      <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff", padding: 48, borderTop: `3px solid ${profile.accent}` }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, textTransform: "uppercase", letterSpacing: "0.12em", color: "#111" }}>Accept This Proposal</h2>
        <p style={{ margin: "0 0 24px", color: "#666", fontSize: 14, lineHeight: 1.6 }}>
          By typing your name below and clicking Accept, you approve the scope and details of all {builds.length} {builds.length === 1 ? "build" : "builds"} above
          {grandTotal > 0 ? <> — a total investment of <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(grandTotal)}</strong></> : null}. Once approved, {profile.name} will add them to your project.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888", marginBottom: 6 }}>Your Full Name (electronic signature)</label>
          <input
            type="text"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            placeholder="Type your full name"
            disabled={submitting}
            style={{ width: "100%", padding: "14px 16px", fontSize: 18, fontFamily: "Georgia, serif", fontStyle: "italic", border: "1px solid #ccc", background: "#fff", color: "#111", outline: "none", boxSizing: "border-box" }}
            onFocus={(e) => (e.target.style.border = `1px solid ${profile.accent}`)}
            onBlur={(e) => (e.target.style.border = "1px solid #ccc")}
          />
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 12, marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}

        <button
          onClick={handleAccept}
          disabled={submitting}
          style={{ width: "100%", padding: "16px", fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", background: submitting ? "#999" : profile.accent, color: "#0a0a0a", border: "none", cursor: submitting ? "default" : "pointer" }}
        >
          {submitting ? "Submitting…" : "Accept & Sign"}
        </button>
        <p style={{ margin: "16px 0 0", textAlign: "center", color: "#999", fontSize: 11 }}>{profile.name} · {profile.phone || ""}</p>
      </div>
    </div>
  );
}
