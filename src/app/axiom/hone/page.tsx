"use client";

// Hone (hone.relicon.app) inside Axiom: the whole Hone app, as it looks
// on its own, in sync with the phone. Hone handles its own sign-in (the
// first time, a small pop-up); Axiom never sees it.
export default function HonePage() {
  return (
    <iframe
      src="https://hone.relicon.app"
      title="Hone"
      allow="clipboard-write; microphone; storage-access"
      className="block h-[calc(100dvh-4rem)] w-full border border-border bg-background"
    />
  );
}
