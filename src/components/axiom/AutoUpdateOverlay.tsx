"use client";

// Auto-update overlay for Axiom.
//
// Axiom auto-deploys to Vercel on every push to main, but an open tab keeps
// running whatever bundle it loaded — so someone can sit on a stale build for
// hours. This polls /api/version (the current deploy's commit SHA), snapshots
// it on first load, and when the live value changes it applies the update
// itself: a brief centered "Updating…" flash, then a hard reload that also
// clears any service worker / Cache Storage. The reload preserves the current
// URL, so the user lands back on the same page in the new build.
//
// Unlike the old opt-in banner, there's no button — the update is applied
// automatically. Detection runs on first load, on focus / tab-visible, and on a
// 30-min tick; the first successful fetch is the baseline, so a tab that opens
// already-stale doesn't reload on arrival — only a deploy that lands while the
// tab is open triggers it.

import { useEffect, useState } from "react";

const POLL_MS = 30 * 60 * 1000; // 30 min
const DEBOUNCE_MS = 60 * 1000; // ignore focus re-checks within 60s
const MIN_OVERLAY_MS = 600; // hold the "Updating…" flash long enough to register

export default function AutoUpdateOverlay() {
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let baseline: string | null = null;
    let cancelled = false;
    let lastCheckAt = 0;
    let applied = false; // guard so the reload only kicks off once

    async function applyUpdate() {
      if (applied) return;
      applied = true;
      setApplying(true);
      // Hold the overlay a beat so the flash actually registers to the eye.
      const minShown = new Promise((r) => setTimeout(r, MIN_OVERLAY_MS));
      // Equivalent to "Empty Cache and Hard Reload": drop any service worker and
      // Cache Storage first, then reload from the network.
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        /* ignore and reload anyway */
      }
      await minShown;
      window.location.reload();
    }

    async function check() {
      if (applied) return;
      if (Date.now() - lastCheckAt < DEBOUNCE_MS) return;
      lastCheckAt = Date.now();
      try {
        const res = await fetch(`/api/version?_v=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!version || version === "dev") return; // local/dev: never fire
        if (baseline === null) baseline = version;
        else if (!cancelled && version !== baseline) applyUpdate();
      } catch {
        /* network blip — ignore, try again next tick */
      }
    }

    check();
    const id = setInterval(check, POLL_MS);
    const onFocus = () => check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!applying) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[1030] flex items-center justify-center bg-black/35 backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-6 py-3.5 text-sm font-semibold uppercase tracking-wider text-foreground shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
        Updating…
      </div>
    </div>
  );
}
