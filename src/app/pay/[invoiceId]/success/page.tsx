"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

type ConfirmState =
  | { status: "loading" }
  | { status: "success"; clientName: string; amountPaid: number; invoiceNumber: string; clientEmail?: string; description?: string }
  | { status: "error"; message: string };

export default function PaySuccessPage() {
  const params = useParams<{ invoiceId: string }>();
  const searchParams = useSearchParams();
  const invoiceId = params?.invoiceId as string;
  const sessionId = searchParams.get("session_id");

  const [state, setState] = useState<ConfirmState>({ status: "loading" });
  const [countdown, setCountdown] = useState(8);
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (!sessionId || !invoiceId || confirmedRef.current) return;
    confirmedRef.current = true;

    fetch("/api/confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, invoiceId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setState({
            status: "success",
            clientName: data.client_name || "there",
            amountPaid: data.amount_paid || 0,
            invoiceNumber: data.invoice_number || "",
            clientEmail: data.client_email,
            description: data.description,
          });
        } else {
          setState({ status: "error", message: data.error || "Could not confirm payment." });
        }
      })
      .catch(() => {
        setState({ status: "error", message: "Network error. Please contact us at (402) 235-8179." });
      });
  }, [sessionId, invoiceId]);

  // Countdown + redirect after success
  useEffect(() => {
    if (state.status !== "success") return;
    if (countdown <= 0) {
      window.location.href = "https://relicbuilt.com";
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [state.status, countdown]);

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
    maxWidth: 480,
    width: "100%",
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
  };
  const headerStyle: React.CSSProperties = {
    padding: "20px 28px",
    borderBottom: "3px solid #c4a24d",
  };
  const bodyStyle: React.CSSProperties = {
    padding: "36px 28px 40px",
    textAlign: "center",
  };

  if (state.status === "loading") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <img src="https://relicbuilt.com/logo-full.png" alt="RELIC Custom Fabrications" style={{ height: 48, objectFit: "contain", display: "block" }} />
          </div>
          <div style={{ ...bodyStyle, color: "#888" }}>
            <p style={{ fontSize: 16, margin: 0 }}>Confirming your payment&hellip;</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <img src="https://relicbuilt.com/logo-full.png" alt="RELIC Custom Fabrications" style={{ height: 48, objectFit: "contain", display: "block" }} />
          </div>
          <div style={bodyStyle}>
            <p style={{ fontSize: 16, color: "#c0392b", margin: "0 0 12px" }}>Unable to confirm payment</p>
            <p style={{ fontSize: 14, color: "#888", margin: "0 0 16px" }}>{state.message}</p>
            <p style={{ fontSize: 13, color: "#aaa" }}>
              Please call us at{" "}
              <a href="tel:4022358179" style={{ color: "#c4a24d", textDecoration: "none" }}>
                (402) 235-8179
              </a>{" "}
              and we will confirm your payment manually.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <img src="https://relicbuilt.com/logo-full.png" alt="RELIC Custom Fabrications" style={{ height: 48, objectFit: "contain", display: "block" }} />
        </div>
        <div style={bodyStyle}>
          {/* Green checkmark */}
          <div style={{
            width: 72, height: 72, borderRadius: "50%", background: "#e6f4ea",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111", margin: "0 0 10px" }}>
            Payment Received!
          </h1>
          <p style={{ fontSize: 15, color: "#555", margin: "0 0 6px", lineHeight: "1.6" }}>
            Thank you, <strong>{state.clientName}</strong>! Your payment of{" "}
            <strong style={{ color: "#c4a24d" }}>{money(state.amountPaid)}</strong> has been received.
          </p>

          {state.clientEmail && (
            <p style={{ fontSize: 14, color: "#888", margin: "0 0 20px" }}>
              A receipt has been sent to <strong>{state.clientEmail}</strong>.
            </p>
          )}

          {state.invoiceNumber && (
            <p style={{ fontSize: 12, color: "#bbb", margin: "0 0 24px" }}>
              Invoice #{state.invoiceNumber}
            </p>
          )}

          <div style={{
            borderTop: "1px solid #e5e0d8",
            paddingTop: 20,
            marginTop: 4,
          }}>
            <p style={{ fontSize: 13, color: "#aaa", margin: "0 0 16px" }}>
              Redirecting to relicbuilt.com in{" "}
              <strong style={{ color: "#c4a24d" }}>{countdown}</strong>{" "}
              second{countdown !== 1 ? "s" : ""}&hellip;
            </p>
            <a
              href="https://relicbuilt.com"
              style={{
                display: "inline-block",
                background: "#c4a24d",
                color: "#fff",
                textDecoration: "none",
                padding: "12px 32px",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              Visit RELIC &rarr;
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
