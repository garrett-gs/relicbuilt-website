"use client";

// Auto-update overlay for Axiom.
//
// Axiom auto-deploys to Vercel on every push to main, but an open tab keeps
// running whatever bundle it loaded — so someone can sit on a stale build for
// hours. This polls /api/version (the current deploy's commit SHA), snapshots
// it on first load, and when the live value changes it applies the update
// itself: a hard reload that clears any service worker / Cache Storage and
// lands back on the same URL in the fresh build.
//
// It won't yank the page out from under someone mid-sentence, and it won't lose
// their work. When a newer deploy is detected the update is held "pending" and
// applied at the next unobtrusive moment:
//   • the tab is hidden/backgrounded — reload silently; the fresh build is
//     already there when they come back (no flash), or
//   • the tab is visible but has gone quiet (no typing/clicking/scrolling) for
//     IDLE_MS — then show a brief "Updating…" flash and reload.
// Either way, right before reloading it calls flushPendingAutosaves() to persist
// any dirty form on demand (Axiom forms autosave ~0.9s after the last keystroke;
// this just forces that save to happen now). So no edits are lost even though
// the reload is a hard page refresh.
//
// Snapshot semantics: the FIRST successful fetch is the baseline, so a tab that
// opens already-stale doesn't reload on arrival — only a deploy that lands while
// the tab is open does. Never fires in local/dev ("dev").

import { useEffect, useState } from "react";
import { flushPendingAutosaves } from "@/components/axiom/useAutosave";

const POLL_MS = 30 * 60 * 1000; // 30 min
const DEBOUNCE_MS = 60 * 1000; // ignore focus re-checks within 60s
const IDLE_MS = 4 * 1000; // visible tab: reload once input has been quiet this long
const SETTLE_POLL_MS = 1500; // while an update is pending, re-check for a quiet moment this often
const FLUSH_CAP_MS = 2000; // don't let a stalled save block the reload forever
const MIN_OVERLAY_MS = 600; // hold the "Updating…" flash long enough to register

export default function AutoUpdateOverlay() {
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let baseline: string | null = null;
    let cancelled = false;
    let lastCheckAt = 0;
    let applied = false; // guard so the reload only kicks off once
    let pending = false; // a newer deploy is live, waiting for a safe moment
    let lastActivityAt = Date.now();
    let settleTimer: ReturnType<typeof setInterval> | null = null;

    async function applyUpdate() {
      if (applied) return;
      applied = true;
      if (settleTimer) {
        clearInterval(settleTimer);
        settleTimer = null;
      }
      // Only flash the overlay when the tab is actually on screen; a background
      // reload is silent (nothing to see), and the new build is already loaded
      // by the time the user returns.
      let minShown: Promise<unknown> = Promise.resolve();
      if (document.visibilityState === "visible") {
        setApplying(true);
        minShown = new Promise((r) => setTimeout(r, MIN_OVERLAY_MS));
      }
      // Save any dirty form on demand before the hard reload so nothing is lost.
      // Capped so a stalled save can't hold the reload open indefinitely.
      try {
        await Promise.race([
          flushPendingAutosaves(),
          new Promise((r) => setTimeout(r, FLUSH_CAP_MS)),
        ]);
      } catch {
        /* ignore — reload anyway */
      }
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

    // Reload only at a safe moment: a hidden tab (user isn't looking) or a
    // visible tab the user has left idle long enough that autosave has flushed.
    function tryApply() {
      if (!pending || applied) return;
      if (document.visibilityState !== "visible") {
        applyUpdate();
        return;
      }
      if (Date.now() - lastActivityAt >= IDLE_MS) applyUpdate();
    }

    function markPending() {
      pending = true;
      if (!settleTimer) settleTimer = setInterval(tryApply, SETTLE_POLL_MS);
      tryApply();
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
        else if (!cancelled && version !== baseline) markPending();
      } catch {
        /* network blip — ignore, try again next tick */
      }
    }

    const bumpActivity = () => {
      lastActivityAt = Date.now();
    };
    const onFocus = () => check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
      else tryApply(); // tab just hidden — safe to apply a pending update now
    };

    check();
    const pollId = setInterval(check, POLL_MS);
    const activityEvents = ["keydown", "pointerdown", "input", "wheel", "touchstart"] as const;
    activityEvents.forEach((e) => window.addEventListener(e, bumpActivity, { passive: true }));
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(pollId);
      if (settleTimer) clearInterval(settleTimer);
      activityEvents.forEach((e) => window.removeEventListener(e, bumpActivity));
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
