"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { SITE_ENTITY } from "@/lib/axiom-site";
import { Settings, TeamMember } from "@/types/axiom";
import { useAuth } from "@/components/axiom/AuthProvider";
import { useAutosave } from "@/components/axiom/useAutosave";
import Button from "@/components/ui/Button";
import SaveButton from "@/components/ui/SaveButton";
import { Plus, Trash2, MessageSquare, UserPlus, X } from "lucide-react";
import { cn, formatPhone } from "@/lib/utils";
import AddressAutocomplete from "@/components/ui/AddressAutocomplete";

const TABS = ["General", "Team", "Categories", "Locations", "Addresses", "Terms"] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const { userEmail } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const myRole = (settings?.team_members || []).find(
    (m: TeamMember) => m.email?.toLowerCase() === userEmail.toLowerCase()
  )?.role;
  const isSuperAdmin = myRole === "superadmin";
  const isAdmin = myRole === "admin" || isSuperAdmin;
  const [tab, setTab] = useState<Tab>("General");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // "Add User (with login)" modal
  const [showAddUser, setShowAddUser] = useState(false);
  const [nu, setNu] = useState({ name: "", email: "", password: "", role: "staff", hourly_rate: 60, relic_access: false });
  const [nuBusy, setNuBusy] = useState(false);
  const [nuErr, setNuErr] = useState("");
  const [nuDone, setNuDone] = useState(false);

  function genPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const arr = new Uint32Array(14);
    crypto.getRandomValues(arr);
    let p = "";
    for (const n of arr) p += chars[n % chars.length];
    setNu((s) => ({ ...s, password: p }));
  }

  async function createUserWithLogin() {
    setNuBusy(true); setNuErr("");
    try {
      const email = nu.email.trim().toLowerCase();
      if (!email || nu.password.length < 8) {
        setNuErr("Enter an email and a password of at least 8 characters.");
        setNuBusy(false); return;
      }
      const { data: sess } = await axiom.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setNuErr("Your session expired — sign in again."); setNuBusy(false); return; }

      const res = await fetch("/api/axiom/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, password: nu.password }),
      });
      const data = await res.json();
      if (!res.ok) { setNuErr(data.error || "Could not create the login."); setNuBusy(false); return; }

      // Login created — now record the team-member row (settings' single writer is this page).
      const member: TeamMember = {
        name: nu.name.trim() || email,
        email,
        role: nu.role as TeamMember["role"],
        hourly_rate: Number(nu.hourly_rate) || 0,
        pin: "",
        relic_access: isSuperAdmin ? nu.relic_access : false,
      };
      const newMembers = [...(settings?.team_members || []), member];
      if (settings) {
        const { error } = await axiom.from("settings").update({ team_members: newMembers }).eq("id", settings.id);
        if (error) { setNuErr("Login created, but saving the team member failed: " + error.message); setNuBusy(false); return; }
        setSettings((s) => s ? { ...s, team_members: newMembers } : s);
      }
      setNuDone(true);
      setNuBusy(false);
    } catch {
      setNuErr("Something went wrong creating the user.");
      setNuBusy(false);
    }
  }

  const load = useCallback(async () => {
    const { data } = await axiom.from("settings").select("*").limit(1).single();
    if (data) setSettings(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!settings) return;
    const { error } = await axiom.from("settings").update(settings).eq("id", settings.id);
    if (error) {
      alert(`Save failed: ${error.message}`);
      console.error("[settings save] error:", error);
      return;
    }
    setDirty(false);
    setSaved(true);
  }

  function updateField(field: string, value: unknown) {
    setSettings((s) => s ? { ...s, [field]: value } : s);
    setDirty(true);
    setSaved(false);
  }

  // Autosave: persist ~900ms after the last edit. `settings` is a fresh object
  // on every change, so it doubles as the debounce change key.
  useAutosave(dirty, settings, save);

  if (!settings) return <div className="text-muted animate-pulse">Loading settings...</div>;

  // This deployment's own entity. Each site edits only its own business
  // identity: the RELIC site writes to relic_profile, everyone else to the
  // biz_* / settings fields. (Both live in one shared settings row, scoped by
  // which deployment is editing.)
  const isRelicSite = SITE_ENTITY === "relic";
  const rp = settings.relic_profile || {};
  type IdField = "name" | "email" | "phone" | "website" | "address" | "city" | "state" | "zip" | "accent" | "logo";
  const BIZ_KEY: Record<IdField, keyof Settings> = {
    name: "biz_name", email: "biz_email", phone: "biz_phone", website: "biz_website",
    address: "biz_address", city: "biz_city", state: "biz_state", zip: "biz_zip", accent: "accent_color", logo: "logo_url",
  };
  const RP_KEY: Record<IdField, string> = {
    name: "name", email: "email", phone: "phone", website: "website",
    address: "address", city: "city", state: "state", zip: "zip", accent: "accent_color", logo: "logo_url",
  };
  const idVal = (f: IdField): string =>
    isRelicSite
      ? ((rp as Record<string, unknown>)[RP_KEY[f]] as string) ?? ""
      : ((settings[BIZ_KEY[f]] as string | undefined) ?? "");
  const idSet = (f: IdField, v: string) => {
    if (isRelicSite) updateField("relic_profile", { ...rp, [RP_KEY[f]]: v });
    else updateField(BIZ_KEY[f], v);
  };
  // Address autocomplete fills street + city/state/zip at once (must be a single
  // write so the relic_profile branch doesn't clobber its own fields).
  const idSetAddress = (r: { street: string; city: string; state: string; zip: string }) => {
    if (isRelicSite) {
      updateField("relic_profile", { ...rp, address: r.street, city: r.city, state: r.state, zip: r.zip });
    } else {
      setSettings((s) => (s ? { ...s, biz_address: r.street, biz_city: r.city, biz_state: r.state, biz_zip: r.zip } : s));
      setDirty(true);
      setSaved(false);
    }
  };
  // Upload a logo PNG → stored in the `branding` bucket, its URL saved on the
  // identity's logo field (used on documents & email).
  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entity", SITE_ENTITY ?? "wallflower_relic");
      const res = await fetch("/api/upload-logo", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed.");
      idSet("logo", json.url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setLogoUploading(false);
    }
  }

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
          <div>
            <h3 className="text-sm font-heading font-bold text-foreground">Business Identity</h3>
            <p className="text-xs text-muted mt-0.5">Your business name, contact info, and accent — shown in this workspace and on your client-facing proposals, invoices &amp; email.</p>
          </div>
          <Field label="Business Name" value={idVal("name")} onChange={(v) => idSet("name", v)} />
          <Field label="Email" value={idVal("email")} onChange={(v) => idSet("email", v)} type="email" />
          <Field label="Phone" value={idVal("phone")} onChange={(v) => idSet("phone", formatPhone(v))} type="tel" placeholder="(###) ###-####" />
          <Field label="Website" value={idVal("website")} onChange={(v) => idSet("website", v)} placeholder="yourbusiness.com" />
          <div>
            <label className="block text-xs text-muted mb-1">Street Address</label>
            <AddressAutocomplete
              value={idVal("address")}
              onChange={(v) => idSet("address", v)}
              onSelect={idSetAddress}
              className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={idVal("city")} onChange={(v) => idSet("city", v)} />
            <Field label="State" value={idVal("state")} onChange={(v) => idSet("state", v)} />
            <Field label="ZIP" value={idVal("zip")} onChange={(v) => idSet("zip", v)} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Mobile Receipt PIN</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={settings.receipts_pin || ""}
              onChange={(e) => updateField("receipts_pin", e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4-digit PIN"
              className="w-32 bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent tracking-[0.4em] font-mono"
            />
            <p className="text-xs text-muted mt-1">Used to access the Receipts page on mobile without a full login.</p>
          </div>
          <Field label="Accent Color" value={idVal("accent") || "#5b642e"} onChange={(v) => idSet("accent", v)} />
          <div className="flex gap-2 mt-2">
            {["#5b642e", "#b8963c", "#1e3a5f", "#3d5a3e", "#5a2d5a", "#8b1a1a", "#1a5a5a", "#2d3a6b", "#1a1a1a"].map((c) => (
              <button
                key={c}
                onClick={() => idSet("accent", c)}
                className={cn("w-8 h-8 rounded border-2", idVal("accent") === c ? "border-foreground" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Logo</label>
            <div className="flex items-center gap-3 flex-wrap">
              {idVal("logo") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={idVal("logo")} alt="Business logo" className="h-10 w-auto max-w-[160px] object-contain bg-card border border-border rounded p-1" />
              ) : (
                <span className="text-xs text-muted">No logo yet</span>
              )}
              <label className={cn("inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold cursor-pointer border border-border bg-card hover:border-accent transition-colors", logoUploading && "opacity-60 pointer-events-none")}>
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} />
                {logoUploading ? "Uploading…" : idVal("logo") ? "Replace PNG" : "Upload PNG"}
              </label>
              {idVal("logo") && (
                <button onClick={() => idSet("logo", "")} className="text-xs text-muted hover:text-red-500">Remove</button>
              )}
            </div>
            <p className="text-xs text-muted mt-1">Shown on your proposals, invoices &amp; email. PNG works best; max 5&nbsp;MB.</p>
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
                    {(isSuperAdmin || m.role === "superadmin") && (
                      <option value="superadmin">Super Admin</option>
                    )}
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                  </select>
                  <button onClick={() => {
                    const members = (settings.team_members || []).filter((_: TeamMember, idx: number) => idx !== i);
                    updateField("team_members", members);
                  }} className="text-muted hover:text-red-500"><Trash2 size={14} /></button>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <div>
                    <p className="text-xs font-medium">Notifications</p>
                    <p className="text-[10px] text-muted">Choose which emails this person receives</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-muted">Portal Updates</span>
                    <button
                      type="button"
                      onClick={() => {
                        const members = [...(settings.team_members || [])];
                        members[i] = { ...members[i], notifications: { ...members[i].notifications, portal_updates: !members[i].notifications?.portal_updates } };
                        updateField("team_members", members);
                      }}
                      className={cn(
                        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                        m.notifications?.portal_updates ? "bg-accent" : "bg-border"
                      )}
                    >
                      <span className={cn(
                        "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                        m.notifications?.portal_updates ? "translate-x-4" : "translate-x-0.5"
                      )} />
                    </button>
                  </label>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted block mb-1">Phone</label>
                    <input
                      type="tel"
                      value={m.phone || ""}
                      onChange={(e) => {
                        const members = [...(settings.team_members || [])];
                        members[i] = { ...members[i], phone: formatPhone(e.target.value) };
                        updateField("team_members", members);
                      }}
                      placeholder="(402) 000-0000"
                      className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                  {(() => {
                    const digits = (m.phone || "").replace(/\D/g, "");
                    const ready = digits.length >= 10 && !!m.pin;
                    const tel = digits.length === 10 ? `+1${digits}` : `+${digits}`;
                    const bizName = settings.biz_name || "RELIC";
                    // \n inside encodeURIComponent renders as a line break in
                    // Messages on iOS and as a space on Android — both fine.
                    const body = `Time clock for ${bizName}: https://relicbuilt.com/axiom/timeclock\n\nYour PIN is ${m.pin || "XXXX"}.\n\nTap your name, enter the PIN, pick the project, then Clock In. Same way to clock out at the end of the day.\n\nTip: in Safari, tap share → "Add to Home Screen" so it sits like an app icon.`;
                    return (
                      <a
                        href={ready ? `sms:${tel}?body=${encodeURIComponent(body)}` : undefined}
                        onClick={(e) => { if (!ready) e.preventDefault(); }}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap",
                          ready
                            ? "bg-accent text-background hover:bg-accent/90"
                            : "bg-card border border-border text-muted cursor-not-allowed",
                        )}
                        title={
                          digits.length < 10
                            ? "Add a phone number first"
                            : !m.pin
                              ? "Set a PIN first"
                              : "Open Messages with the time clock link pre-filled"
                        }
                      >
                        <MessageSquare size={12} />
                        Send Time Clock Link
                      </a>
                    );
                  })()}
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
                      type={isAdmin ? "text" : "password"}
                      inputMode="numeric"
                      disabled={!isAdmin}
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
                {isSuperAdmin && m.role !== "superadmin" && (
                  <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={m.relic_access === true}
                      onChange={(e) => {
                        const members = [...(settings.team_members || [])];
                        members[i] = { ...members[i], relic_access: e.target.checked };
                        updateField("team_members", members);
                      }}
                      className="accent-accent"
                    />
                    <span className="text-foreground">Relic access <span className="text-[10px] text-muted">— can see the private Relic entity</span></span>
                  </label>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-5 mt-1">
            <button onClick={() => {
              const members = [...(settings.team_members || []), { name: "", email: "", role: "staff" as const, hourly_rate: 60, pin: "" }];
              updateField("team_members", members);
            }} className="text-accent text-sm flex items-center gap-1"><Plus size={14} /> Add Team Member</button>
            {isAdmin && (
              <button onClick={() => {
                setNu({ name: "", email: "", password: "", role: "staff", hourly_rate: 60, relic_access: false });
                setNuErr(""); setNuDone(false); setShowAddUser(true);
              }} className="text-accent text-sm flex items-center gap-1"><UserPlus size={14} /> Add User (with login)</button>
            )}
          </div>
          <p className="text-xs text-muted mt-2">&ldquo;Add Team Member&rdquo; just records someone in the list. &ldquo;Add User (with login)&rdquo; also creates their sign-in so they can log in to Axiom.</p>

          {showAddUser && (
            <>
              <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowAddUser(false)} />
              <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-heading font-bold">Add User (with login)</h3>
                  <button onClick={() => setShowAddUser(false)} className="text-muted hover:text-foreground"><X size={18} /></button>
                </div>
                {nuDone ? (
                  <div className="space-y-3">
                    <p className="text-sm text-green-500">Login created for {nu.email}.</p>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted block mb-1">Temporary password — share it with them</label>
                      <input readOnly value={nu.password} onFocus={(e) => e.target.select()} className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground font-mono" />
                    </div>
                    <p className="text-xs text-muted">They sign in at relicbuilt.com/axiom with this email and password. Have them change it after first login.</p>
                    <Button onClick={() => setShowAddUser(false)}>Done</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Field label="Name" value={nu.name} onChange={(v) => setNu((s) => ({ ...s, name: v }))} />
                    <Field label="Email" value={nu.email} onChange={(v) => setNu((s) => ({ ...s, email: v }))} type="email" />
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted block mb-1">Temporary Password</label>
                      <div className="flex gap-2">
                        <input value={nu.password} onChange={(e) => setNu((s) => ({ ...s, password: e.target.value }))} placeholder="at least 8 characters" className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground font-mono" />
                        <Button variant="outline" size="sm" onClick={genPassword}>Generate</Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted block mb-1">Role</label>
                        <select value={nu.role} onChange={(e) => setNu((s) => ({ ...s, role: e.target.value }))} className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent">
                          <option value="staff">Staff</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                          {isSuperAdmin && <option value="superadmin">Superadmin</option>}
                        </select>
                      </div>
                      <Field label="Hourly Rate ($)" value={String(nu.hourly_rate)} onChange={(v) => setNu((s) => ({ ...s, hourly_rate: Number(v) || 0 }))} type="number" />
                    </div>
                    {isSuperAdmin && (
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" checked={nu.relic_access} onChange={(e) => setNu((s) => ({ ...s, relic_access: e.target.checked }))} className="accent-accent" />
                        <span className="text-foreground">Relic access</span>
                      </label>
                    )}
                    {nuErr && <p className="text-xs text-red-500">{nuErr}</p>}
                    <div className="flex gap-2 pt-1">
                      <Button onClick={createUserWithLogin} disabled={nuBusy || !nu.email || nu.password.length < 8}>{nuBusy ? "Creating…" : "Create User"}</Button>
                      <Button variant="outline" onClick={() => setShowAddUser(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
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

      {tab === "Locations" && (
        <div className="max-w-md">
          <p className="text-sm text-muted mb-4">Define storage locations for inventory tracking. Each item can be tracked across these locations.</p>
          <div className="space-y-2 mb-4">
            {(settings.inventory_locations || []).map((loc: string, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <input value={loc} onChange={(e) => {
                  const locs = [...(settings.inventory_locations || [])];
                  locs[i] = e.target.value;
                  updateField("inventory_locations", locs);
                }} className="flex-1 bg-card border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent" placeholder="e.g. Shop, Warehouse, Trailer…" />
                <button onClick={() => {
                  const locs = (settings.inventory_locations || []).filter((_: string, idx: number) => idx !== i);
                  updateField("inventory_locations", locs);
                }} className="text-muted hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => updateField("inventory_locations", [...(settings.inventory_locations || []), ""])} className="text-accent text-sm flex items-center gap-1"><Plus size={14} /> Add Location</button>
        </div>
      )}

      {tab === "Addresses" && (
        <div className="max-w-2xl">
          <p className="text-sm text-muted mb-4">
            Saved delivery addresses for purchase orders. These show up as a dropdown on the PO ship-to field, so you don&apos;t have to retype common destinations.
          </p>
          <div className="space-y-3 mb-4">
            {(settings.delivery_addresses || []).map((addr: { label: string; address: string }, i: number) => (
              <div key={i} className="bg-card border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={addr.label}
                    onChange={(e) => {
                      const list = [...(settings.delivery_addresses || [])];
                      list[i] = { ...list[i], label: e.target.value };
                      updateField("delivery_addresses", list);
                    }}
                    className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                    placeholder="Label — e.g. RELIC Shop, Garrett's Garage, Main Warehouse"
                  />
                  <button
                    onClick={() => {
                      const list = (settings.delivery_addresses || []).filter((_: { label: string; address: string }, idx: number) => idx !== i);
                      updateField("delivery_addresses", list);
                    }}
                    className="text-muted hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <AddressAutocomplete
                  value={addr.address}
                  onChange={(v) => {
                    const list = [...(settings.delivery_addresses || [])];
                    list[i] = { ...list[i], address: v };
                    updateField("delivery_addresses", list);
                  }}
                  onSelect={(r) => {
                    const list = [...(settings.delivery_addresses || [])];
                    list[i] = { ...list[i], address: r.formatted };
                    updateField("delivery_addresses", list);
                  }}
                  className="w-full bg-background border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => updateField("delivery_addresses", [...(settings.delivery_addresses || []), { label: "", address: "" }])}
            className="text-accent text-sm flex items-center gap-1"
          >
            <Plus size={14} /> Add Address
          </button>
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
