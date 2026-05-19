"use client";

// Client-only component: registers the service worker on mount and shows a
// small toast when the browser drops offline / comes back online so users
// know why something might fail. Doesn't render anything until offline.

import { useEffect, useState } from "react";

export default function PwaRegistrar() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Register the service worker. We skip it in development because
    // Next's dev server doesn't want the cache layer in the way of HMR.
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      window.location.hostname !== "localhost"
    ) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[pwa] service worker registration failed:", err);
      });
    }

    // Online/offline indicator
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    if (typeof window !== "undefined") {
      setOffline(!navigator.onLine);
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "#1f1410",
        color: "#fbbf24",
        padding: "10px 18px",
        fontSize: 13,
        fontFamily: "system-ui, -apple-system, sans-serif",
        border: "1px solid #fbbf24",
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        letterSpacing: "0.02em",
      }}
    >
      ● Offline — saved pages still work, but new data and saves are paused.
    </div>
  );
}
