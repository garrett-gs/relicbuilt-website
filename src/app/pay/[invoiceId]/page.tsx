"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email?: string;
  description?: string;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  tax_rate: number;
  status: string;
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

// Mirror the merchant's actual Stripe fees so the customer-paid fee
// matches the method they pick. Kept in sync with /api/pay-invoice.
function calcCardFee(total: number) {
  return Math.round(total * 0.029 * 100 + 30) / 100;
}
function calcAchFee(total: number) {
  return Math.min(Math.round(total * 0.008 * 100), 500) / 100; // 0.8%, cap $5
}

export default function PayInvoicePage() {
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = params?.invoiceId as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [method, setMethod] = useState<"card" | "ach">("card");
  const [feeAgreed, setFeeAgreed] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) return;
    // Route through the server-side public-invoice endpoint. The
    // invoices table is RLS-locked to authenticated users only, so the
    // browser's anon SDK can't read it directly — this is what was
    // causing the "Invoice not found" message for clients trying to pay.
    fetch(`/api/public-invoice/${invoiceId}`)
      .then(async (res) => {
        setLoading(false);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const body = await res.json();
        const data = body?.invoice as Invoice | undefined;
        if (!data) {
          setNotFound(true);
          return;
        }
        if (data.status === "paid") {
          setAlreadyPaid(true);
          setInvoice(data);
          return;
        }
        setInvoice(data);
      })
      .catch(() => {
        setLoading(false);
        setNotFound(true);
      });
  }, [invoiceId]);

  const invoiceTotal = invoice
    ? invoice.subtotal + invoice.delivery_fee - invoice.discount + (invoice.subtotal * invoice.tax_rate) / 100
    : 0;
  const cardFee = calcCardFee(invoiceTotal);
  const achFee = calcAchFee(invoiceTotal);
  const fee = method === "ach" ? achFee : cardFee;
  const totalCharged = invoiceTotal + fee;

  // Switching methods invalidates the previous "I agree to pay $X" tick —
  // they're agreeing to a different amount now.
  function pickMethod(next: "card" | "ach") {
    setMethod(next);
    setFeeAgreed(false);
  }

  async function handlePay() {
    if (!feeAgreed || redirecting) return;
    setRedirecting(true);
    setError(null);
    try {
      const res = await fetch("/api/pay-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, method }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Something went wrong. Please try again.");
        setRedirecting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setRedirecting(false);
    }
  }

  // --- Styles ---
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f5f5f5",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "48px 16px",
    fontFamily: "Arial, Helvetica, sans-serif",
  };
  const cardStyle: React.CSSProperties = {
    background: "#fff",
    maxWidth: 520,
    width: "100%",
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
  };
  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 28px",
    borderBottom: "3px solid #5b642e",
  };
  const dividerStyle: React.CSSProperties = {
    height: 1,
    background: "#e5e0d8",
    margin: "0",
  };
  const bodyStyle: React.CSSProperties = {
    padding: "28px 28px 32px",
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <img src="https://relicbuilt.com/logo-full.png" alt="RELIC Custom Fabrications" style={{ height: 48, objectFit: "contain", display: "block" }} />
            <span style={{ fontSize: 15, color: "#888", fontWeight: 600 }}>Invoice Payment</span>
          </div>
          <div style={{ ...bodyStyle, textAlign: "center", padding: "48px 28px", color: "#888" }}>
            Loading&hellip;
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <img src="https://relicbuilt.com/logo-full.png" alt="RELIC Custom Fabrications" style={{ height: 48, objectFit: "contain", display: "block" }} />
            <span style={{ fontSize: 15, color: "#888", fontWeight: 600 }}>Invoice Payment</span>
          </div>
          <div style={bodyStyle}>
            <p style={{ fontSize: 16, color: "#555", textAlign: "center", marginTop: 16 }}>Invoice not found.</p>
            <p style={{ fontSize: 13, color: "#aaa", textAlign: "center", marginTop: 8 }}>
              Please check your link or contact us at (402) 235-8179.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (alreadyPaid) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <img src="https://relicbuilt.com/logo-full.png" alt="RELIC Custom Fabrications" style={{ height: 48, objectFit: "contain", display: "block" }} />
            <span style={{ fontSize: 15, color: "#888", fontWeight: 600 }}>Invoice Payment</span>
          </div>
          <div style={bodyStyle}>
            <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%", background: "#e6f4ea",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#111", margin: "0 0 8px" }}>This invoice has already been paid.</p>
              {invoice && (
                <p style={{ fontSize: 14, color: "#888", margin: "0 0 8px" }}>Invoice #{invoice.invoice_number}</p>
              )}
              <p style={{ fontSize: 13, color: "#aaa", marginTop: 12 }}>
                Questions? Call us at (402) 235-8179.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <img src="https://relicbuilt.com/logo-full.png" alt="RELIC Custom Fabrications" style={{ height: 48, objectFit: "contain", display: "block" }} />
          <span style={{ fontSize: 15, color: "#888", fontWeight: 600 }}>Invoice Payment</span>
        </div>

        <div style={dividerStyle} />

        <div style={bodyStyle}>
          {/* Invoice Info */}
          <div style={{
            background: "#f8f6f0",
            border: "1px solid #e5e0d8",
            padding: "20px 22px",
            marginBottom: 24,
          }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#999", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Invoice #{invoice.invoice_number}
            </p>
            {invoice.description && (
              <p style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#111" }}>
                {invoice.description}
              </p>
            )}
            <p style={{ margin: "0 0 14px", fontSize: 14, color: "#666" }}>
              {invoice.client_name}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#888" }}>Amount Due</p>
            <p style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 700, color: "#5b642e", fontFamily: "monospace" }}>
              {money(invoiceTotal)}
            </p>
          </div>

          {/* Payment Section */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Choose Payment Method
            </p>

            {/* Method Picker — two side-by-side cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => pickMethod("card")}
                style={{
                  textAlign: "left",
                  background: method === "card" ? "#fdf6e3" : "#fff",
                  border: method === "card" ? "2px solid #5b642e" : "1px solid #e5e0d8",
                  padding: "14px 16px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#111" }}>Card</p>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: "#888", lineHeight: 1.5 }}>
                  Credit or debit. Pays immediately.
                </p>
                <p style={{ margin: 0, fontSize: 12, fontFamily: "monospace", color: "#5b642e", fontWeight: 700 }}>
                  +{money(cardFee)} fee
                </p>
              </button>
              <button
                type="button"
                onClick={() => pickMethod("ach")}
                style={{
                  textAlign: "left",
                  background: method === "ach" ? "#fdf6e3" : "#fff",
                  border: method === "ach" ? "2px solid #5b642e" : "1px solid #e5e0d8",
                  padding: "14px 16px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#111" }}>ACH (Bank)</p>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: "#888", lineHeight: 1.5 }}>
                  US bank transfer. 3–5 business days.
                </p>
                <p style={{ margin: 0, fontSize: 12, fontFamily: "monospace", color: "#5b642e", fontWeight: 700 }}>
                  +{money(achFee)} fee
                  {achFee >= 5 && <span style={{ color: "#888", fontWeight: 400, marginLeft: 4 }}>(capped)</span>}
                </p>
              </button>
            </div>

            {/* Fee Breakdown */}
            <div style={{
              border: "1px solid #e5e0d8",
              padding: "14px 18px",
              marginBottom: 16,
              fontSize: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#555" }}>
                <span>Base amount</span>
                <span style={{ fontFamily: "monospace" }}>{money(invoiceTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, color: "#888", fontSize: 13 }}>
                <span>
                  {method === "ach"
                    ? "Processing fee (0.8%, max $5 — ACH)"
                    : "Processing fee (2.9% + $0.30 — Card)"}
                </span>
                <span style={{ fontFamily: "monospace" }}>{money(fee)}</span>
              </div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                borderTop: "1px solid #e5e0d8",
                paddingTop: 10,
                fontWeight: 700,
                color: "#111",
                fontSize: 15,
              }}>
                <span>Total charged</span>
                <span style={{ fontFamily: "monospace", color: "#5b642e" }}>{money(totalCharged)}</span>
              </div>
            </div>

            {/* Checkbox */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 18 }}>
              <input
                type="checkbox"
                checked={feeAgreed}
                onChange={(e) => setFeeAgreed(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: "#5b642e", flexShrink: 0, cursor: "pointer" }}
              />
              <span style={{ fontSize: 13, color: "#555", lineHeight: "1.5" }}>
                I agree to pay the {method === "ach" ? "ACH" : "card"} processing fee of{" "}
                <strong style={{ color: "#111" }}>{money(fee)}</strong>
              </span>
            </label>

            {/* Error */}
            {error && (
              <p style={{ fontSize: 13, color: "#c0392b", margin: "0 0 14px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5" }}>
                {error}
              </p>
            )}

            {/* Pay Button */}
            <button
              onClick={handlePay}
              disabled={!feeAgreed || redirecting}
              style={{
                display: "block",
                width: "100%",
                background: feeAgreed && !redirecting ? "#5b642e" : "#d9c9a0",
                color: "#fff",
                border: "none",
                padding: "14px 0",
                fontSize: 16,
                fontWeight: 700,
                cursor: feeAgreed && !redirecting ? "pointer" : "not-allowed",
                letterSpacing: "0.02em",
                transition: "background 0.15s",
              }}
            >
              {redirecting ? "Redirecting to payment…" : `Pay ${money(totalCharged)} Now →`}
            </button>

            <p style={{ fontSize: 12, color: "#aaa", textAlign: "center", marginTop: 12, marginBottom: 0, lineHeight: "1.6" }}>
              Prefer to pay by check or other method?{" "}
              <a href="tel:4022358179" style={{ color: "#5b642e", textDecoration: "none" }}>
                Call us at (402) 235-8179
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
