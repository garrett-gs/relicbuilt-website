"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Estimate, MasterProject, Settings } from "@/types/axiom";
import { resolveEntityProfile } from "@/lib/entity-profile";

type Decision = "pending" | "accepted" | "declined";

function calcTotal(est: Estimate) {
  const materialTotal = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const laborTotal = (est.labor_items || []).reduce((s, l) => s + (l.cost || 0), 0);
  const subtotal = materialTotal + laborTotal;
  const markupAmount = subtotal * ((est.markup_percent || 0) / 100);
  return Math.round((subtotal + markupAmount + (est.adjustment || 0)) * 100) / 100;
}
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export default function MasterProposalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [master, setMaster] = useState<MasterProject | null>(null);
  const [builds, setBuilds] = useState<Estimate[]>([]);
  const [settings, setSettings] = useState<Partial<Settings> | null>(null);
  const [clientCompany, setClientCompany] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [expired, setExpired] = useState(false);

  // Per-build interaction state
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [panel, setPanel] = useState<Record<string, "accept" | "decline" | null>>({});
  const [sig, setSig] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/master-proposal-context/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.master) { setNotFound(true); setLoading(false); return; }
        const m = data.master as MasterProject;
        const bs = ((data.builds as Estimate[]) || []).filter((b) => b.proposal_status !== "declined");
        setMaster(m);
        setBuilds(bs);
        if (data.settings) setSettings(data.settings as Settings);
        if (data.clientCompany) setClientCompany(data.clientCompany);
        if (data.clientAddress) setClientAddress(data.clientAddress);
        const d: Record<string, Decision> = {};
        for (const b of bs) d[b.id] = b.proposal_status === "approved" ? "accepted" : "pending";
        setDecisions(d);
        if (m.proposal_expires_at && new Date(m.proposal_expires_at).getTime() < Date.now() && m.proposal_status !== "approved") setExpired(true);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  const entity = builds[0]?.entity;
  const profile = useMemo(() => resolveEntityProfile(entity, settings), [entity, settings]);
  const accent = profile.accent || "#9a7b2e";
  const isRelic = entity === "relic";
  const brandName = profile.name || "RELIC";
  const shield = isRelic ? "/relic-shield-gold.png" : (profile.logoUrl || "");
  const depPct = Number(settings?.deposit_percent ?? 50);

  const totals = useMemo(() => {
    let acc = 0, anyAccepted = false, anyPending = false;
    for (const b of builds) {
      const dec = decisions[b.id] || "pending";
      if (dec === "accepted") { acc += calcTotal(b); anyAccepted = true; }
      else if (dec === "pending") anyPending = true;
    }
    return { acc, anyAccepted, anyPending };
  }, [builds, decisions]);

  async function confirmAccept(b: Estimate) {
    const name = (sig[b.id] || "").trim();
    if (name.length < 2) { setErr((e) => ({ ...e, [b.id]: "Please type your full name to sign." })); return; }
    setBusy((x) => ({ ...x, [b.id]: true })); setErr((e) => ({ ...e, [b.id]: "" }));
    try {
      const res = await fetch("/api/master-proposal/decision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, estimate_id: b.id, action: "accept", signatureName: name }),
      });
      const data = await res.json();
      if (!res.ok) { setErr((e) => ({ ...e, [b.id]: data.error || "Could not submit." })); return; }
      setDecisions((d) => ({ ...d, [b.id]: "accepted" }));
      setPanel((p) => ({ ...p, [b.id]: null }));
    } catch { setErr((e) => ({ ...e, [b.id]: "Network error. Please try again." })); }
    finally { setBusy((x) => ({ ...x, [b.id]: false })); }
  }

  async function confirmDecline(b: Estimate) {
    setBusy((x) => ({ ...x, [b.id]: true })); setErr((e) => ({ ...e, [b.id]: "" }));
    try {
      const res = await fetch("/api/master-proposal/decision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, estimate_id: b.id, action: "decline", reason: reason[b.id] || "" }),
      });
      const data = await res.json();
      if (!res.ok) { setErr((e) => ({ ...e, [b.id]: data.error || "Could not submit." })); return; }
      setDecisions((d) => ({ ...d, [b.id]: "declined" }));
      setPanel((p) => ({ ...p, [b.id]: null }));
    } catch { setErr((e) => ({ ...e, [b.id]: "Network error. Please try again." })); }
    finally { setBusy((x) => ({ ...x, [b.id]: false })); }
  }

  async function payDeposit() {
    setPayBusy(true);
    try {
      const res = await fetch("/api/master-proposal/deposit", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.pay_url) { window.location.href = data.pay_url; return; }
      alert(data.message || "Thank you — we'll follow up with next steps.");
    } catch { alert("Something went wrong. Please try again."); }
    finally { setPayBusy(false); }
  }

  // ── Page states ──────────────────────────────────────────────────
  const page: React.CSSProperties = { minHeight: "100vh", background: "#f4f3f0", padding: "32px 16px", fontFamily: "Georgia, 'Times New Roman', serif", color: "#1c1a17" };
  const sheet: React.CSSProperties = { maxWidth: 720, margin: "0 auto 18px", background: "#fff", border: "1px solid #e7e4dd", borderRadius: 10, overflow: "hidden" };

  if (loading) return <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Loading proposal…</div>;
  if (notFound || !master) return (
    <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: 480, background: "#fff", padding: 48, textAlign: "center", borderRadius: 10 }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Proposal Not Found</h1>
        <p style={{ margin: 0, color: "#666", fontSize: 14, lineHeight: 1.6 }}>This link may have been mistyped or the proposal removed. Please contact us if you believe this is an error.</p>
      </div>
    </div>
  );
  if (expired) return (
    <div style={page}>
      <div style={{ ...sheet, padding: 48, textAlign: "center", borderTop: "4px solid #d98f2a" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Proposal Expired</h1>
        <p style={{ margin: 0, color: "#666", fontSize: 14, lineHeight: 1.6 }}>
          This proposal for <strong>{master.name}</strong> expired on{" "}
          <strong>{master.proposal_expires_at ? new Date(master.proposal_expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "an earlier date"}</strong>. Please reach out and we&apos;ll send an updated one.
        </p>
      </div>
    </div>
  );
  if (master.proposal_status !== "sent" && master.proposal_status !== "approved") return (
    <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: 520, background: "#fff", padding: 48, textAlign: "center", borderRadius: 10 }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Your Proposal Is Being Prepared</h1>
        <p style={{ margin: 0, color: "#666", fontSize: 14, lineHeight: 1.6 }}>We&apos;re finalizing the details for <strong>{master.name}</strong>. You&apos;ll be able to review and sign right here as soon as it&apos;s ready.</p>
      </div>
    </div>
  );

  const sentText = master.proposal_sent_at ? new Date(master.proposal_sent_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const expiresText = master.proposal_expires_at ? new Date(master.proposal_expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  const preparedFor = builds[0]?.client_name ? (clientCompany ? `${builds[0].client_name} of ${clientCompany}` : builds[0].client_name) : (clientCompany || "");

  return (
    <div style={page}>
      {/* COVER */}
      <div style={sheet}><div style={{ padding: "26px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${accent}`, paddingBottom: 14, marginBottom: 18, gap: 14, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 14, fontFamily: "system-ui, sans-serif", fontWeight: 800, letterSpacing: "0.16em", fontSize: 27, color: "#1c1a17" }}>
            {shield ? <img src={shield} alt={brandName} style={{ height: "1.9em", width: "auto", display: "block" }} /> : null}
            {brandName}
          </span>
          <div style={{ textAlign: "right", fontFamily: "system-ui, sans-serif" }}>
            <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#9b968c" }}>Combined Proposal</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b675f" }}>{sentText}</p>
          </div>
        </div>
        <h1 style={{ margin: "0 0 4px", fontSize: 27 }}>{master.name}</h1>
        {preparedFor && <p style={{ margin: "0 0 18px", color: "#6b675f", fontSize: 14 }}>Prepared for <strong>{preparedFor}</strong>{clientAddress ? ` · ${clientAddress}` : ""}</p>}

        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "system-ui, sans-serif" }}>
          <tbody>
            {builds.map((b) => {
              const dec = decisions[b.id] || "pending";
              return (
                <tr key={b.id}>
                  <td style={{ padding: "9px 0", borderBottom: "1px solid #e7e4dd", fontSize: 14, color: dec === "declined" ? "#9b968c" : "#1c1a17", textDecoration: dec === "declined" ? "line-through" : "none" }}>{b.project_name || b.estimate_number}</td>
                  <td style={{ padding: "9px 0", borderBottom: "1px solid #e7e4dd", textAlign: "center", width: 90 }}>
                    {dec === "accepted" && <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 20, background: "#e7f3ec", color: "#2f7d4f" }}>Accepted</span>}
                    {dec === "declined" && <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 20, background: "#f6eae8", color: "#a23b32" }}>Declined</span>}
                  </td>
                  <td style={{ padding: "9px 0 9px 16px", borderBottom: "1px solid #e7e4dd", textAlign: "right", fontFamily: "ui-monospace, monospace", fontSize: 14, color: dec === "declined" ? "#9b968c" : "#1c1a17", textDecoration: dec === "declined" ? "line-through" : "none", whiteSpace: "nowrap" }}>{money(calcTotal(b))}</td>
                </tr>
              );
            })}
            <tr>
              <td style={{ padding: "13px 0 0", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 16 }}>Accepted total</td>
              <td />
              <td style={{ padding: "13px 0 0 16px", textAlign: "right", fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: 19, color: accent }}>{money(totals.acc)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ margin: "14px 0 0", fontFamily: "system-ui, sans-serif", fontSize: 12, color: "#9b968c" }}>
          Each build can be approved on its own.{expiresText ? <> This proposal is valid through <strong>{expiresText}</strong>.</> : null}
        </p>
      </div></div>

      {/* BUILDS */}
      {builds.map((b) => {
        const dec = decisions[b.id] || "pending";
        const scope = b.proposal_scope?.included !== false ? (b.proposal_scope?.body || "") : "";
        const includeImages = b.proposal_images_included !== false;
        const cover = b.proposal_cover_image_url || "";
        const gallery = includeImages ? [cover, ...((b.proposal_images || []).filter((u) => u !== cover))].filter(Boolean) : [];
        const docs = (b.proposal_documents || []) as { name?: string; url?: string }[];
        const dim = dec === "declined";
        return (
          <div key={b.id} style={{ ...sheet, opacity: 1 }}>
            <div style={{ padding: "26px 28px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, borderLeft: `3px solid ${accent}`, paddingLeft: 12, opacity: dim ? 0.55 : 1 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>{b.project_name || b.estimate_number}</h2>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 17, fontWeight: 700, color: accent, whiteSpace: "nowrap" }}>{money(calcTotal(b))}</span>
              </div>

              <div style={{ opacity: dim ? 0.55 : 1 }}>
                {scope && <>
                  <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: accent, margin: "16px 0 6px" }}>What&apos;s included</p>
                  <p style={{ margin: 0, color: "#6b675f", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{scope}</p>
                </>}

                {gallery.length > 0 && <>
                  <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: accent, margin: "18px 0 8px" }}>Visuals</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                    {gallery.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 8, border: "1px solid #e7e4dd", display: "block" }} /></a>
                    ))}
                  </div>
                </>}

                {docs.length > 0 && <>
                  <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: accent, margin: "18px 0 8px" }}>Attachments</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {docs.map((d, i) => (
                      <a key={i} href={d.url || "#"} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 9, border: "1px solid #e7e4dd", borderRadius: 8, padding: "8px 12px", background: "#fff", textDecoration: "none", fontFamily: "system-ui, sans-serif" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                        <span style={{ fontSize: 13, color: "#1c1a17" }}>{d.name || "Document"}</span>
                      </a>
                    ))}
                  </div>
                </>}
              </div>

              {/* Sign-off */}
              <div style={{ fontFamily: "system-ui, sans-serif", marginTop: 20, borderTop: "1px solid #e7e4dd", paddingTop: 18 }}>
                {dec === "accepted" ? (
                  <div style={{ background: "#e7f3ec", border: "1px solid #cfe6d8", borderRadius: 8, padding: "14px 16px", fontSize: 13, color: "#2f7d4f" }}>
                    <b style={{ display: "block", fontSize: 14, marginBottom: 2 }}>✓ Accepted &amp; signed</b>
                    This build is locked and has been added to your project.
                  </div>
                ) : dec === "declined" ? (
                  <div style={{ background: "#f6eae8", border: "1px solid #ecd4d0", borderRadius: 8, padding: "14px 16px", fontSize: 13, color: "#a23b32" }}>
                    <b style={{ display: "block", fontSize: 14, marginBottom: 2 }}>Declined</b>
                    We&apos;ll revise this and send you an updated version.
                  </div>
                ) : panel[b.id] === "accept" ? (
                  <div>
                    <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9b968c", marginBottom: 6 }}>Type your full name to sign</label>
                    <input value={sig[b.id] || ""} onChange={(e) => setSig((s) => ({ ...s, [b.id]: e.target.value }))} placeholder={builds[0]?.client_name || "Your name"} disabled={busy[b.id]} style={{ width: "100%", border: "1px solid #ccc7bc", borderRadius: 8, padding: "11px 13px", fontSize: 16, fontFamily: "Georgia, serif", fontStyle: "italic", boxSizing: "border-box" }} />
                    {err[b.id] && <p style={{ color: "#a23b32", fontSize: 13, margin: "8px 0 0" }}>{err[b.id]}</p>}
                    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <button onClick={() => confirmAccept(b)} disabled={busy[b.id]} style={{ border: 0, borderRadius: 8, padding: "11px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: accent, color: "#fff" }}>{busy[b.id] ? "Signing…" : "Sign & accept"}</button>
                      <button onClick={() => setPanel((p) => ({ ...p, [b.id]: null }))} disabled={busy[b.id]} style={{ border: 0, borderRadius: 8, padding: "11px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#f1efe9", color: "#6b675f" }}>Cancel</button>
                    </div>
                  </div>
                ) : panel[b.id] === "decline" ? (
                  <div>
                    <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9b968c", marginBottom: 6 }}>Optional — what would you like changed?</label>
                    <textarea value={reason[b.id] || ""} onChange={(e) => setReason((r) => ({ ...r, [b.id]: e.target.value }))} placeholder="Tell us what to adjust." disabled={busy[b.id]} style={{ width: "100%", border: "1px solid #ccc7bc", borderRadius: 8, padding: "11px 13px", fontSize: 15, fontFamily: "system-ui, sans-serif", resize: "vertical", minHeight: 58, boxSizing: "border-box" }} />
                    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <button onClick={() => confirmDecline(b)} disabled={busy[b.id]} style={{ border: "1px solid #e3cdc9", borderRadius: 8, padding: "11px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "transparent", color: "#a23b32" }}>{busy[b.id] ? "Submitting…" : "Decline this build"}</button>
                      <button onClick={() => setPanel((p) => ({ ...p, [b.id]: null }))} disabled={busy[b.id]} style={{ border: 0, borderRadius: 8, padding: "11px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#f1efe9", color: "#6b675f" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 13, color: "#6b675f", margin: "0 0 12px" }}>Approve this build to include it in your project.</p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={() => setPanel((p) => ({ ...p, [b.id]: "accept" }))} style={{ border: 0, borderRadius: 8, padding: "11px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: accent, color: "#fff" }}>Accept this build</button>
                      <button onClick={() => setPanel((p) => ({ ...p, [b.id]: "decline" }))} style={{ border: "1px solid #e3cdc9", borderRadius: 8, padding: "11px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "transparent", color: "#a23b32" }}>Decline</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* FOOTER */}
      <div style={{ maxWidth: 720, margin: "0 auto", fontFamily: "system-ui, sans-serif", position: "sticky", bottom: 0, background: "#fff", border: "1px solid #e7e4dd", borderTop: `2px solid ${accent}`, borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", boxShadow: "0 -6px 20px rgba(0,0,0,.06)" }}>
        {isRelic ? (
          <>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9b968c" }}>Deposit due ({depPct}% of accepted)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: accent, fontFamily: "ui-monospace, monospace" }}>{money(totals.acc * (depPct / 100))}</div>
              <div style={{ fontSize: 12, color: "#6b675f", marginTop: 2 }}>
                {!totals.anyAccepted ? "Accept at least one build to continue to payment."
                  : totals.anyPending ? "You can pay now, or decide on the remaining build first."
                  : "All builds decided — deposit covers the accepted ones."}
              </div>
            </div>
            <button onClick={payDeposit} disabled={!totals.anyAccepted || payBusy} style={{ background: (!totals.anyAccepted || payBusy) ? "#d9d4c9" : accent, color: "#fff", border: 0, borderRadius: 8, padding: "13px 22px", fontSize: 13, fontWeight: 700, cursor: (!totals.anyAccepted || payBusy) ? "default" : "pointer" }}>{payBusy ? "One moment…" : "Pay Deposit →"}</button>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#6b675f" }}>
            {totals.anyAccepted ? "Thanks — the builds you approved are moving to production. We'll follow up with next steps and invoicing." : "Accept the builds you'd like to move forward with."}
          </div>
        )}
      </div>
      <p style={{ maxWidth: 720, margin: "10px auto 0", textAlign: "center", color: "#9b968c", fontSize: 12, fontFamily: "system-ui, sans-serif" }}>
        {profile.name} · {profile.phone || ""}
      </p>
    </div>
  );
}
