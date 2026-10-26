"use client";

import Script from "next/script";

// Hone (hone.relicon.app) inside Axiom: the person's Today, tasks and lists,
// live and in sync with the Hone app. The panel signs in to Hone itself
// ("Connect Hone") and keeps its own sign-in in this browser; Axiom's
// server never sees it.
export default function HonePage() {
  return (
    <div className="max-w-3xl">
      {/* @ts-expect-error: custom element defined by hone.relicon.app/embed.js */}
      <hone-panel
        style={{
          "--hone-bg": "var(--background)",
          "--hone-panel": "var(--card)",
          "--hone-text": "var(--foreground)",
          "--hone-muted": "var(--muted)",
          "--hone-line": "var(--border)",
          "--hone-accent": "var(--accent)",
          "--hone-accent-ink": "#ffffff",
        }}
      />
      <Script src="https://hone.relicon.app/embed.js" strategy="afterInteractive" />
    </div>
  );
}
