"use client";

import { useEffect, useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { TeamMember, CustomWork, TimeEntry } from "@/types/axiom";
import { Clock, X, CheckCircle2, LogIn, LogOut, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Step = "select_member" | "enter_pin" | "select_project" | "clocked_in" | "clocked_out";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatElapsed(clockIn: string) {
  const diff = Math.floor((Date.now() - new Date(clockIn).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function hoursFromEntry(entry: TimeEntry) {
  const ms = new Date(entry.clock_out!).getTime() - new Date(entry.clock_in).getTime();
  return Math.round((ms / 3600000) * 100) / 100;
}

export default function TimeClockPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<CustomWork[]>([]);
  const [step, setStep] = useState<Step>("select_member");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [completedEntry, setCompletedEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    axiom.from("settings").select("team_members").limit(1).single().then(({ data }) => {
      if (data?.team_members) setMembers(data.team_members.filter((m: TeamMember) => m.name && m.pin));
    });
    axiom.from("custom_work").select("*").in("status", ["new", "in_review", "quoted", "in_progress"]).order("project_name").then(({ data }) => {
      if (data) setProjects(data);
    });
  }, []);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Elapsed timer when clocked in
  useEffect(() => {
    if (step !== "clocked_in" || !activeEntry) return;
    const t = setInterval(() => setElapsed(formatElapsed(activeEntry.clock_in)), 1000);
    setElapsed(formatElapsed(activeEntry.clock_in));
    return () => clearInterval(t);
  }, [step, activeEntry]);

  function handleSelectMember(member: TeamMember) {
    setSelectedMember(member);
    setPin("");
    setPinError(false);
    setStep("enter_pin");
  }

  async function handlePinDigit(digit: string) {
    if (pinError) { setPin(""); setPinError(false); }
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) {
      // Validate PIN
      if (newPin !== selectedMember?.pin) {
        setPinError(true);
        setTimeout(() => { setPin(""); setPinError(false); }, 1000);
        return;
      }
      // Load any open entries for this member so project list can show clock-out
      const { data } = await axiom.from("time_entries")
        .select("*")
        .eq("member_name", selectedMember!.name)
        .is("clock_out", null)
        .order("clock_in", { ascending: false });
      if (data && data.length > 0) setActiveEntry(data[0]);
      // Always go to project selection
      setStep("select_project");
    }
  }

  function handlePinDelete() {
    setPin((p) => p.slice(0, -1));
    setPinError(false);
  }

  async function handleClockIn(project: CustomWork) {
    const { data } = await axiom.from("time_entries").insert({
      member_name: selectedMember!.name,
      custom_work_id: project.id,
      project_name: project.project_name,
      clock_in: new Date().toISOString(),
      hourly_rate: selectedMember!.hourly_rate || 60,
    }).select().single();
    if (data) {
      setActiveEntry(data);
      setStep("clocked_in");
    }
  }

  async function handleClockOut() {
    if (!activeEntry) return;
    const clockOut = new Date().toISOString();
    const hours = hoursFromEntry({ ...activeEntry, clock_out: clockOut });

    // Update time entry
    await axiom.from("time_entries").update({ clock_out: clockOut, hours }).eq("id", activeEntry.id);

    // Append to project labor log
    if (activeEntry.custom_work_id) {
      const { data: project } = await axiom.from("custom_work").select("labor_log, actual_cost").eq("id", activeEntry.custom_work_id).single();
      if (project) {
        const rate = activeEntry.hourly_rate || 60;
        const cost = Math.round(hours * rate * 100) / 100;
        const newEntry = {
          date: new Date().toISOString().split("T")[0],
          hours,
          rate,
          cost,
          description: selectedMember!.name,
        };
        const updatedLog = [...(project.labor_log || []), newEntry];
        const newActualCost = (project.actual_cost || 0) + cost;
        await axiom.from("custom_work").update({
          labor_log: updatedLog,
          actual_cost: newActualCost,
          updated_at: new Date().toISOString(),
        }).eq("id", activeEntry.custom_work_id);
      }
    }

    setCompletedEntry({ ...activeEntry, clock_out: clockOut, hours });
    setActiveEntry(null);
    setStep("clocked_out");
  }

  function reset() {
    setStep("select_member");
    setSelectedMember(null);
    setPin("");
    setPinError(false);
    setActiveEntry(null);
    setCompletedEntry(null);
  }

  const PAD = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center relative">
      <Link href="/axiom/dashboard" className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent transition-colors">
        <ArrowLeft size={12} /> Back to Axiom
      </Link>
      {/* Clock */}
      <div className="text-center mb-8">
        <p className="text-4xl font-mono font-bold text-foreground">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </p>
        <p className="text-muted text-sm mt-1">
          {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* ── Step: Select member ── */}
      {step === "select_member" && (
        <div className="w-full max-w-lg">
          <h2 className="text-center text-xs uppercase tracking-widest text-muted mb-4">Who are you?</h2>
          {members.length === 0 ? (
            <p className="text-center text-muted text-sm">No team members with PINs set up yet. Go to <a href="/axiom/settings" className="text-accent underline">Settings → Team</a> to add them.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {members.map((m) => (
                <button
                  key={m.name}
                  onClick={() => handleSelectMember(m)}
                  className="bg-card border border-border p-5 text-center hover:border-accent transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xl font-bold mx-auto mb-2">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted capitalize">{m.role}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step: Enter PIN ── */}
      {step === "enter_pin" && (
        <div className="w-full max-w-xs text-center">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-1">Welcome, {selectedMember?.name}</h2>
          <p className="text-sm text-muted mb-6">Enter your 4-digit PIN</p>

          {/* PIN dots */}
          <div className="flex justify-center gap-4 mb-8">
            {[0,1,2,3].map((i) => (
              <div
                key={i}
                className={cn(
                  "w-4 h-4 rounded-full border-2 transition-colors",
                  pinError ? "border-red-500 bg-red-500" :
                  i < pin.length ? "border-accent bg-accent" : "border-border"
                )}
              />
            ))}
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3">
            {PAD.map((d, i) => (
              d === "" ? <div key={i} /> :
              d === "⌫" ? (
                <button key={i} onClick={handlePinDelete} className="bg-card border border-border py-4 text-xl text-muted hover:text-foreground hover:border-accent transition-colors">
                  ⌫
                </button>
              ) : (
                <button
                  key={i}
                  onClick={() => handlePinDigit(d)}
                  disabled={pin.length >= 4}
                  className="bg-card border border-border py-4 text-2xl font-mono hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
                >
                  {d}
                </button>
              )
            ))}
          </div>

          <button onClick={reset} className="mt-6 text-xs text-muted hover:text-foreground flex items-center gap-1 mx-auto">
            <X size={12} /> Cancel
          </button>
        </div>
      )}

      {/* ── Step: Select project ── */}
      {step === "select_project" && (
        <div className="w-full max-w-lg">
          <h2 className="text-center text-xs uppercase tracking-widest text-muted mb-1">
            {selectedMember?.name}
          </h2>
          <p className="text-center text-sm text-muted mb-4">Select a project</p>
          {projects.length === 0 ? (
            <p className="text-center text-muted text-sm">No active projects.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {projects.map((p) => {
                const isClockedIn = activeEntry?.custom_work_id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => isClockedIn ? setStep("clocked_in") : handleClockIn(p)}
                    className={cn(
                      "w-full border p-4 text-left transition-colors flex items-center justify-between",
                      isClockedIn
                        ? "bg-green-500/10 border-green-500/50 hover:border-green-500"
                        : "bg-card border-border hover:border-accent"
                    )}
                  >
                    <div>
                      <p className="font-medium text-sm">{p.project_name}</p>
                      {p.client_name && <p className="text-xs text-muted">{p.client_name}</p>}
                    </div>
                    <span className={cn(
                      "text-xs px-2 py-1 border flex items-center gap-1",
                      isClockedIn ? "border-green-500 text-green-500" : "border-border text-muted capitalize"
                    )}>
                      {isClockedIn ? <><Clock size={10} /> Clocked In</> : p.status.replace("_", " ")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={reset} className="mt-4 text-xs text-muted hover:text-foreground flex items-center gap-1 mx-auto">
            <X size={12} /> Cancel
          </button>
        </div>
      )}

      {/* ── Step: Clocked in ── */}
      {step === "clocked_in" && activeEntry && (
        <div className="w-full max-w-sm text-center">
          <div className="bg-card border border-green-500/30 p-8 mb-6">
            <Clock size={32} className="text-green-500 mx-auto mb-3" />
            <p className="text-xs uppercase tracking-widest text-muted mb-1">Clocked In</p>
            <p className="text-lg font-medium mb-1">{selectedMember?.name}</p>
            <p className="text-sm text-muted mb-4">{activeEntry.project_name}</p>
            <p className="text-4xl font-mono font-bold text-green-500">{elapsed}</p>
            <p className="text-xs text-muted mt-2">
              Started {new Date(activeEntry.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <button
            onClick={handleClockOut}
            className="w-full bg-red-500/10 border border-red-500 text-red-500 py-4 text-sm font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> Clock Out
          </button>
          <button onClick={reset} className="mt-4 text-xs text-muted hover:text-foreground flex items-center gap-1 mx-auto">
            <X size={12} /> Done
          </button>
        </div>
      )}

      {/* ── Step: Clocked out ── */}
      {step === "clocked_out" && completedEntry && (
        <div className="w-full max-w-sm text-center">
          <div className="bg-card border border-accent/30 p-8 mb-6">
            <CheckCircle2 size={32} className="text-accent mx-auto mb-3" />
            <p className="text-xs uppercase tracking-widest text-muted mb-1">Clocked Out</p>
            <p className="text-lg font-medium mb-1">{selectedMember?.name}</p>
            <p className="text-sm text-muted mb-4">{completedEntry.project_name}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted text-xs mb-1">Hours</p>
                <p className="font-mono font-bold text-xl">{completedEntry.hours?.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted text-xs mb-1">Value</p>
                <p className="font-mono font-bold text-xl text-accent">
                  {money((completedEntry.hours || 0) * (completedEntry.hourly_rate || 60))}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted mt-4">Labor log updated on project ✓</p>
          </div>
          <button
            onClick={reset}
            className="w-full bg-card border border-border py-3 text-sm hover:border-accent transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
