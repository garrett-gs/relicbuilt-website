"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { Settings, TeamMember } from "@/types/axiom";
import Button from "@/components/ui/Button";
import SaveButton from "@/components/ui/SaveButton";
import { Plus, Trash2 } from "lucide-react";
import { cn, formatPhone } from "@/lib/utils";

const TABS = ["General", "Team", "Categories", "Terms"] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>("General");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const { data } = await axiom.from("settings").select("*").limit(1).single();
    if (data) setSettings(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!settings) return;
    await axiom.from("settings").update(settings).eq("id", settings.id);
    setDirty(false);
    setSaved(true);
  }

  function updateField(field: string, value: unknown) {
    setSettings((s) => s ? { ...s, [field]: value } : s);
    setDirty(true);
    setSaved(false);
  }

  if (!settings) return <div className="text-muted animate-pulse">Loading settings...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold">Settings</h1>
        <SaveButton dirty={dirty} saved={saved} onClick={save} size="sm" label="Save" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm transition-colors border-b-2 -mb-px", tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground")}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "General" && (
        <div className="space-y-4 max-w-lg">
          <Field label="Business Name" value={settings.biz_name} onChange={(v) => updateField("biz_name", v)} />
          <Field label="Email" value={settings.biz_email || ""} onChange={(v) => updateField("biz_email", v)} type="email" />
          <Field label="Phone" value={settings.biz_phone || ""} onChange={(v) => updateField("biz_phone", formatPhone(v))} type="tel" placeholder="(###) ###-####" />
          <Field label="Street Address" value={settings.biz_address || ""} onChange={(v) => updateField("biz_address", v)} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={settings.biz_city || ""} onChange={(v) => updateField("biz_city", v)} />
            <Field label="State" value={settings.biz_state || ""} onChange={(v) => updateField("biz_state", v)} />
            <Field label="ZIP" value={settings.biz_zip || ""} onChange={(v) => updateField("biz_zip", v)} />
          </div>
          <Field label="Accent Color" value={settings.accent_color} onChange={(v) => updateField("accent_color", v)} />
          <div className="flex gap-2 mt-2">
            {["#c4a24d", "#1e3a5f", "#3d5a3e", "#5a2d5a", "#8b1a1a", "#1a5a5a", "#2d3a6b", "#1a1a1a"].map((c) => (
              <button
                key={c}
                onClick={() => updateField("accent_color", c)}
                className={cn("w-8 h-8 rounded border-2", settings.accent_color === c ? "border-foreground" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "Team" && (
        <div>
          <p className="text-sm text-muted mb-4">Each team member needs a 4-digit PIN to use the Time Clock.</p>
          <div className="space-y-3 mb-4">
            {(settings.team_members || []).map((m: TeamMember, i: number) => (
              <div key={i} className="bg-card border border-border p-4 space-y-3">
                <div className="grid grid-cols-[1fr_1fr_100px_32px] gap-3 items-center">
                  <input value={m.name} onChange={(e) => {
                    const members = [...(settings.team_members || [])];
                    members[i] = { ...members[i], name: e.target.value };
                    updateField("team_members", members);
                  }} placeholder="Name" className="bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
                  <input value={m.email} onChange={(e) => {
                    const members = [...(settings.team_members || [])];
                    members[i] = { ...members[i], email: e.target.value };
                    updateField("team_members", members);
                  }} placeholder="Email" className="bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
                  <select value={m.role} onChange={(e) => {
                    const members = [...(settings.team_members || [])];
                    members[i] = { ...members[i], role: e.target.value as TeamMember["role"] };
                    updateField("team_members", members);
                  }} className="bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent">
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                  </select>
                  <button onClick={() => {
                    const members = (settings.team_members || []).filter((_: TeamMember, idx: number) => idx !== i);
                    updateField("team_members", members);
                  }} className="text-muted hover:text-red-500"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted block mb-1">Hourly Rate ($)</label>
                    <input type="number" value={m.hourly_rate} onChange={(e) => {
                      const members = [...(settings.team_members || [])];
                      members[i] = { ...members[i], hourly_rate: Number(e.target.value) };
                      updateField("team_members", members);
                    }} className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted block mb-1">4-Digit Time Clock PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={m.pin || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                        const members = [...(settings.team_members || [])];
                        members[i] = { ...members[i], pin: val };
                        updateField("team_members", members);
                      }}
                      placeholder="••••"
                      className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent font-mono tracking-widest"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => {
            const members = [...(settings.team_members || []), { name: "", email: "", role: "staff" as const, hourly_rate: 60, pin: "" }];
            updateField("team_members", members);
          }} className="text-accent text-sm flex items-center gap-1"><Plus size={14} /> Add Team Member</button>
        </div>
      )}

      {tab === "Categories" && (
        <div className="max-w-md">
          <div className="space-y-2 mb-4">
            {(settings.categories || []).map((cat: string, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <input value={cat} onChange={(e) => {
                  const cats = [...(settings.categories || [])];
                  cats[i] = e.target.value;
                  updateField("categories", cats);
                }} className="flex-1 bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" />
                <button onClick={() => {
                  const cats = (settings.categories || []).filter((_: string, idx: number) => idx !== i);
                  updateField("categories", cats);
                }} className="text-muted hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => updateField("categories", [...(settings.categories || []), ""])} className="text-accent text-sm flex items-center gap-1"><Plus size={14} /> Add Category</button>
        </div>
      )}

      {tab === "Terms" && (
        <div className="space-y-4 max-w-lg">
          <Field label="Deposit %" value={String(settings.deposit_percent)} onChange={(v) => updateField("deposit_percent", Number(v))} type="number" />
          <Field label="Balance Due (days before)" value={String(settings.balance_due_days)} onChange={(v) => updateField("balance_due_days", Number(v))} type="number" />
          <Field label="Invoice Send (days before due)" value={String(settings.invoice_send_days)} onChange={(v) => updateField("invoice_send_days", Number(v))} type="number" />
          <Field label="Reminder Interval (days)" value={String(settings.reminder_interval_days)} onChange={(v) => updateField("reminder_interval_days", Number(v))} type="number" />
          <div>
            <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Terms & Conditions</label>
            <textarea value={settings.terms_text || ""} onChange={(e) => updateField("terms_text", e.target.value)} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent min-h-[200px] resize-y" />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent" />
    </div>
  );
}
