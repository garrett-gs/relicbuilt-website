"use client";

// "A new version of Axiom is available" banner.
//
// Axiom auto-deploys to Vercel on every push to main, but an open tab keeps
// running whatever bundle it loaded — so someone can sit on a stale build for
// hours. This polls /api/version (the current deploy's commit SHA), snapshots
// it on first load, and when the live value differs, offers a one-click hard
// reload that also clears any service worker / Cache Storage.
//
// Snapshot semantics are deliberate: the FIRST successful fetch becomes the
// baseline, so a tab that opens already-stale doesn't banner immediately — only
// a deploy that lands while the tab is open does. Dismiss is session-only (no
// persistence) so a user can't permanently dismiss away a critical hotfix.

import { useEffect, useState } from "react";

const POLL_MS = 30 * 60 * 1000; // 30 min
const DEBOUNCE_MS = 60 * 1000; // ignore focus re-checks within 60s

export default function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    let baseline: string | null = null;
    let cancelled = false;
    let lastCheckAt = 0;

    async function check() {
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
        else if (!cancelled && version !== baseline) setUpdateReady(true);
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

  async function applyUpdate() {
    // Equivalent to "Empty Cache and Hard Reload": drop any service worker and
    // Cache Storage first (defensive — Axiom ships no SW today, so these no-op),
    // then reload from the network.
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
    window.location.reload();
  }

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 z-[1030] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
    >
      <span>A new version of Axiom is available</span>
      <button
        onClick={applyUpdate}
        className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-background transition-opacity hover:opacity-90"
      >
        Update now
      </button>
      <button
        onClick={() => setUpdateReady(false)}
        title="Dismiss until the next check"
        aria-label="Dismiss"
        className="cursor-pointer border-0 bg-transparent px-0.5 text-lg leading-none text-muted hover:text-foreground"
      >
        &times;
      </button>
    </div>
  );
}
