"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { useEntity } from "@/components/axiom/EntityProvider";
import { Share2, Copy, Check } from "lucide-react";
import BuildCalendarGrid from "@/components/axiom/BuildCalendarGrid";
import { loadCalendarData, CalendarData } from "@/lib/calendar-data";

export default function BuildCalendarPage() {
  const { entity } = useEntity();
  const [data, setData] = useState<CalendarData>({ projects: [], estimateHoursById: {}, tentatives: [], tentativeHours: {} });

  // Share state
  const [settingsId, setSettingsId] = useState<string>("");
  const [shareTokens, setShareTokens] = useState<Record<string, string>>({});
  const [sharePanel, setSharePanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setData(await loadCalendarData(axiom, entity));
  }, [entity]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    axiom.from("settings").select("id, calendar_share_tokens").limit(1).single().then(({ data }) => {
      if (data) {
        setSettingsId(data.id);
        setShareTokens((data.calendar_share_tokens || {}) as Record<string, string>);
      }
    });
  }, []);

  const shareToken = shareTokens[entity];
  const shareUrl = shareToken && typeof window !== "undefined"
    ? `${window.location.origin}/calendar/${shareToken}`
    : "";

  async function saveTokens(next: Record<string, string>) {
    setBusy(true);
    try {
      await axiom.from("settings").update({ calendar_share_tokens: next }).eq("id", settingsId);
      setShareTokens(next);
    } finally {
      setBusy(false);
    }
  }

  async function generateLink() {
    const token = `cal_${crypto.randomUUID().replace(/-/g, "")}`;
    await saveTokens({ ...shareTokens, [entity]: token });
  }

  async function disableLink() {
    const next = { ...shareTokens };
    delete next[entity];
    await saveTokens(next);
  }

  function copy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-heading font-bold">Build Calendar</h1>
        <button
          onClick={() => setSharePanel((s) => !s)}
          className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground hover:border-accent transition-colors"
        >
          <Share2 size={14} /> Share
        </button>
      </div>

      {sharePanel && (
        <div className="bg-card border border-border p-4 mb-4">
          <p className="text-sm text-foreground font-medium mb-1">Share this build calendar (read-only)</p>
          <p className="text-xs text-muted mb-3">
            Anyone with the link sees the {entity === "relic" ? "Relic" : "Wallflower RELIC"} build calendar — no login needed. It updates live.
          </p>
          {shareToken ? (
            <div className="flex flex-wrap items-center gap-2">
              <input readOnly value={shareUrl} className="flex-1 min-w-[240px] bg-background border border-border px-3 py-2 text-sm text-foreground font-mono" onFocus={(e) => e.target.select()} />
              <button onClick={copy} className="flex items-center gap-1.5 bg-accent text-white px-3 py-2 text-sm hover:opacity-90">
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
              </button>
              <button onClick={disableLink} disabled={busy} className="text-xs text-muted hover:text-red-500 px-2 py-2 disabled:opacity-50">
                Disable link
              </button>
            </div>
          ) : (
            <button onClick={generateLink} disabled={busy || !settingsId} className="bg-accent text-white px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50">
              {busy ? "Creating…" : "Create share link"}
            </button>
          )}
        </div>
      )}

      <BuildCalendarGrid
        projects={data.projects}
        estimateHoursById={data.estimateHoursById}
        tentatives={data.tentatives}
        tentativeHours={data.tentativeHours}
      />
    </div>
  );
}
