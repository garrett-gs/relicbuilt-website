"use client";

import { useEffect, useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { TeamMember, CustomWork, TimeEntry } from "@/types/axiom";
import { Clock, X, CheckCircle2, LogIn, LogOut, ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Step = "select_member" | "enter_pin" | "select_project" | "confirm_clock_in" | "clocked_in" | "clocked_out" | "manual_entry" | "manual_saved";

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
  const [selectedProject, setSelectedProject] = useState<CustomWork | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [now, setNow] = useState(new Date());
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [breakHours, setBreakHours] = useState("");
  const [breakReason, setBreakReason] = useState("");

  // Manual entry state
  const [manualMember, setManualMember] = useState("");
  const [manualProject, setManualProject] = useState("");
  const [manualDate, setManualDate] = useState(new Date().toISOString().split("T")[0]);
  const [manualHours, setManualHours] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualTasks, setManualTasks] = useState<string[]>([]);
  const [manualBreakHours, setManualBreakHours] = useState("");
  const [manualBreakReason, setManualBreakReason] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualSavedEntry, setManualSavedEntry] = useState<{ member: string; project: string; hours: number; cost: number } | null>(null);

  const TASK_OPTIONS = ["Fabrication", "Assembly", "Finishing", "Delivery", "Installation"];

  function toggleTask(task: string) {
    setSelectedTasks((prev) => prev.includes(task) ? prev.filter(t => t !== task) : [...prev, task]);
  }

  function toggleManualTask(task: string) {
    setManualTasks((prev) => prev.includes(task) ? prev.filter(t => t !== task) : [...prev, task]);
  }

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
    // Close any stale open entries for this member before clocking in
    const { data: stale } = await axiom.from("time_entries")
      .select("id, clock_in, hourly_rate, custom_work_id")
      .eq("member_name", selectedMember!.name)
      .is("clock_out", null);
    if (stale && stale.length > 0) {
      for (const s of stale) {
        const clockOut = new Date().toISOString();
        const hours = hoursFromEntry({ ...s, clock_out: clockOut } as TimeEntry);
        await axiom.from("time_entries").update({ clock_out: clockOut, hours }).eq("id", s.id);
      }
    }

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
    const rawHours = hoursFromEntry({ ...activeEntry, clock_out: clockOut });

    // Apply break deduction if provided
    const deductHours = Math.max(0, parseFloat(breakHours) || 0);
    const hours = Math.max(0, Math.round((rawHours - deductHours) * 100) / 100);
    const breakNote = deductHours > 0
      ? ` [break: -${deductHours}h${breakReason.trim() ? ` (${breakReason.trim()})` : ""}]`
      : "";

    // Update time entry — store adjusted hours, keep original clock_in/out, record break in notes
    await axiom.from("time_entries").update({
      clock_out: clockOut,
      hours,
      tasks: selectedTasks,
      notes: breakNote ? breakNote.trim() : null,
    }).eq("id", activeEntry.id);

    // Append to project labor log
    if (activeEntry.custom_work_id) {
      const { data: project } = await axiom.from("custom_work").select("labor_log, actual_cost").eq("id", activeEntry.custom_work_id).single();
      if (project) {
        const rate = activeEntry.hourly_rate || 60;
        const cost = Math.round(hours * rate * 100) / 100;
        const baseDesc = selectedTasks.length ? `${selectedMember!.name} — ${selectedTasks.join(", ")}` : selectedMember!.name;
        const newEntry = {
          date: new Date().toISOString().split("T")[0],
          hours,
          rate,
          cost,
          description: `${baseDesc}${breakNote}`,
          tasks: selectedTasks,
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
    setBreakHours("");
    setBreakReason("");
    setStep("clocked_out");
  }

  async function handleManualSave() {
    const rawHours = parseFloat(manualHours);
    if (!manualMember || !manualProject || !rawHours || rawHours <= 0) return;
    setManualSaving(true);

    // Apply break deduction
    const deductHours = Math.max(0, parseFloat(manualBreakHours) || 0);
    const hours = Math.max(0, Math.round((rawHours - deductHours) * 100) / 100);

    const project = projects.find((p) => p.id === manualProject);
    const member = members.find((m) => m.name === manualMember);
    const rate = member?.hourly_rate || 60;
    const cost = Math.round(hours * rate * 100) / 100;

    // Create clock_in/clock_out from date + adjusted hours
    const clockIn = new Date(`${manualDate}T08:00:00`).toISOString();
    const clockOutMs = new Date(clockIn).getTime() + hours * 3600000;
    const clockOut = new Date(clockOutMs).toISOString();

    const taskDesc = manualTasks.length
      ? `${manualMember} — ${manualTasks.join(", ")}`
      : manualMember;
    const notesPart = manualNotes ? ` (${manualNotes})` : "";
    const breakNote = deductHours > 0
      ? ` [break: -${deductHours}h${manualBreakReason.trim() ? ` (${manualBreakReason.trim()})` : ""}]`
      : "";

    // Insert time entry
    await axiom.from("time_entries").insert({
      member_name: manualMember,
      custom_work_id: manualProject,
      project_name: project?.project_name || "",
      clock_in: clockIn,
      clock_out: clockOut,
      hours,
      hourly_rate: rate,
      notes: `Manual entry${notesPart}${breakNote}`,
    });

    // Update project labor log
    if (project) {
      const { data: pw } = await axiom.from("custom_work").select("labor_log, actual_cost").eq("id", project.id).single();
      if (pw) {
        const newEntry = {
          date: manualDate,
          hours,
          rate,
          cost,
          description: `${taskDesc}${notesPart}${breakNote}`,
          tasks: manualTasks,
        };
        const updatedLog = [...(pw.labor_log || []), newEntry];
        const newActualCost = (pw.actual_cost || 0) + cost;
        await axiom.from("custom_work").update({
          labor_log: updatedLog,
          actual_cost: newActualCost,
          updated_at: new Date().toISOString(),
        }).eq("id", project.id);
      }
    }

    setManualSavedEntry({ member: manualMember, project: project?.project_name || "", hours, cost });
    setManualSaving(false);
    setStep("manual_saved");
  }

  function reset() {
    setStep("select_member");
    setSelectedMember(null);
    setPin("");
    setPinError(false);
    setActiveEntry(null);
    setCompletedEntry(null);
    setSelectedProject(null);
    setSelectedTasks([]);
    setBreakHours("");
    setBreakReason("");
    setManualMember("");
    setManualProject("");
    setManualDate(new Date().toISOString().split("T")[0]);
    setManualHours("");
    setManualNotes("");
    setManualTasks([]);
    setManualBreakHours("");
    setManualBreakReason("");
    setManualSavedEntry(null);
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
          <div className="flex items-center justify-center mb-4">
            <h2 className="text-xs uppercase tracking-widest text-muted">Who are you?</h2>
            <button
              onClick={() => setStep("manual_entry")}
              className="absolute right-4 top-4 flex items-center gap-1.5 text-xs text-accent border border-accent/30 px-3 py-1.5 hover:bg-accent/10 transition-colors"
            >
              <Plus size={12} /> Manual Entry
            </button>
          </div>
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
                    onClick={() => { if (isClockedIn) { setStep("clocked_in"); } else { setSelectedProject(p); setStep("confirm_clock_in"); } }}
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

      {/* ── Step: Confirm clock in ── */}
      {step === "confirm_clock_in" && selectedProject && (
        <div className="w-full max-w-sm text-center">
          <div className="bg-card border border-border p-8 mb-6">
            <LogIn size={32} className="text-accent mx-auto mb-3" />
            <h3 className="text-xs uppercase tracking-widest text-muted mb-2">
              Ready to Clock In?
            </h3>
            <p className="text-lg font-medium text-foreground">
              {selectedProject.project_name}
            </p>
            {selectedProject.client_name && (
              <p className="text-sm text-muted mt-1">{selectedProject.client_name}</p>
            )}
            <p className="text-sm text-muted mt-3">
              {selectedMember?.name}
            </p>
          </div>
          <button
            onClick={() => handleClockIn(selectedProject)}
            className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-bold text-lg tracking-wide transition-colors flex items-center justify-center gap-2 mb-3"
          >
            <LogIn size={20} /> Clock In
          </button>
          <button
            onClick={() => setStep("select_project")}
            className="text-xs text-muted hover:text-foreground flex items-center gap-1 mx-auto"
          >
            <X size={12} /> Back to Projects
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
            <div className="mt-6 pt-4 border-t border-border text-left">
              <p className="text-xs uppercase tracking-widest text-muted mb-3 text-center">Tasks Completed</p>
              <div className="grid grid-cols-2 gap-2">
                {TASK_OPTIONS.map((task) => {
                  const checked = selectedTasks.includes(task);
                  return (
                    <button
                      key={task}
                      type="button"
                      onClick={() => toggleTask(task)}
                      className={cn(
                        "flex items-center gap-2 border px-3 py-2 text-xs transition-colors",
                        checked ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
                      )}
                    >
                      <span className={cn(
                        "w-3.5 h-3.5 border flex items-center justify-center",
                        checked ? "border-accent bg-accent" : "border-border"
                      )}>
                        {checked && <span className="text-[10px] text-background font-bold">✓</span>}
                      </span>
                      {task}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-border text-left">
              <p className="text-xs uppercase tracking-widest text-muted mb-3 text-center">Break Deduction (optional)</p>
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={breakHours}
                  onChange={(e) => setBreakHours(e.target.value)}
                  placeholder="0.0"
                  className="bg-background border border-border px-3 py-2 text-sm text-foreground text-right focus:outline-none focus:border-accent"
                />
                <input
                  value={breakReason}
                  onChange={(e) => setBreakReason(e.target.value)}
                  placeholder="Reason — e.g. lunch, errands"
                  className="bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                />
              </div>
              {parseFloat(breakHours) > 0 && (
                <p className="text-[10px] text-muted mt-1.5 text-center">
                  {parseFloat(breakHours)}h will be subtracted from your total
                </p>
              )}
            </div>
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

      {/* ── Step: Manual entry ── */}
      {step === "manual_entry" && (
        <div className="w-full max-w-md">
          <h2 className="text-center text-xs uppercase tracking-widest text-muted mb-1">Manual Time Entry</h2>
          <p className="text-center text-sm text-muted mb-6">Add hours for a team member on a project</p>

          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Team Member</label>
              <select
                value={manualMember}
                onChange={(e) => setManualMember(e.target.value)}
                className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Select member...</option>
                {members.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Project</label>
              <select
                value={manualProject}
                onChange={(e) => setManualProject(e.target.value)}
                className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Select project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.project_name}{p.client_name ? ` — ${p.client_name}` : ""}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Date</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Hours</label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  placeholder="e.g. 4.5"
                  className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Tasks */}
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-2">Tasks</label>
              <div className="grid grid-cols-2 gap-2">
                {TASK_OPTIONS.map((task) => {
                  const checked = manualTasks.includes(task);
                  return (
                    <button
                      key={task}
                      type="button"
                      onClick={() => toggleManualTask(task)}
                      className={cn(
                        "flex items-center gap-2 border px-3 py-2 text-xs transition-colors",
                        checked ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
                      )}
                    >
                      <span className={cn(
                        "w-3.5 h-3.5 border flex items-center justify-center",
                        checked ? "border-accent bg-accent" : "border-border"
                      )}>
                        {checked && <span className="text-[10px] text-background font-bold">✓</span>}
                      </span>
                      {task}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Notes</label>
              <input
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Optional notes..."
                className="w-full bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
              />
            </div>

            {/* Break deduction */}
            <div>
              <label className="text-xs uppercase tracking-wider text-muted block mb-1.5">Break Deduction (optional)</label>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={manualBreakHours}
                  onChange={(e) => setManualBreakHours(e.target.value)}
                  placeholder="0.0"
                  className="bg-card border border-border px-4 py-3 text-foreground text-sm text-right focus:outline-none focus:border-accent"
                />
                <input
                  value={manualBreakReason}
                  onChange={(e) => setManualBreakReason(e.target.value)}
                  placeholder="Reason — e.g. lunch"
                  className="bg-card border border-border px-4 py-3 text-foreground text-sm focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Preview */}
            {manualMember && manualProject && manualHours && (() => {
              const rawHrs = parseFloat(manualHours) || 0;
              const brk = Math.max(0, parseFloat(manualBreakHours) || 0);
              const netHrs = Math.max(0, Math.round((rawHrs - brk) * 100) / 100);
              const rate = members.find((m) => m.name === manualMember)?.hourly_rate || 60;
              return (
                <div className="bg-card border border-border p-4 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted">Rate</span>
                    <span className="font-mono">{money(rate)}/hr</span>
                  </div>
                  {brk > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted">Hours Entered</span>
                        <span className="font-mono">{rawHrs.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-amber-400">
                        <span>Break Deduction</span>
                        <span className="font-mono">-{brk.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1">
                        <span className="text-muted">Net Hours</span>
                        <span className="font-mono font-bold">{netHrs.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between mt-1">
                    <span className="text-muted">Total Cost</span>
                    <span className="font-mono text-accent font-bold">{money(netHrs * rate)}</span>
                  </div>
                </div>
              );
            })()}

            <button
              onClick={handleManualSave}
              disabled={!manualMember || !manualProject || !manualHours || parseFloat(manualHours) <= 0 || manualSaving}
              className="w-full py-4 bg-accent text-background font-bold text-sm tracking-wide transition-colors hover:bg-accent/80 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {manualSaving ? "Saving..." : <><Plus size={16} /> Add Time Entry</>}
            </button>

            <button onClick={reset} className="text-xs text-muted hover:text-foreground flex items-center gap-1 mx-auto">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Manual saved ── */}
      {step === "manual_saved" && manualSavedEntry && (
        <div className="w-full max-w-sm text-center">
          <div className="bg-card border border-accent/30 p-8 mb-6">
            <CheckCircle2 size={32} className="text-accent mx-auto mb-3" />
            <p className="text-xs uppercase tracking-widest text-muted mb-1">Time Entry Added</p>
            <p className="text-lg font-medium mb-1">{manualSavedEntry.member}</p>
            <p className="text-sm text-muted mb-4">{manualSavedEntry.project}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted text-xs mb-1">Hours</p>
                <p className="font-mono font-bold text-xl">{manualSavedEntry.hours.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted text-xs mb-1">Cost</p>
                <p className="font-mono font-bold text-xl text-accent">{money(manualSavedEntry.cost)}</p>
              </div>
            </div>
            <p className="text-xs text-muted mt-4">Labor log updated on project ✓</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setManualSavedEntry(null); setManualHours(""); setManualNotes(""); setManualTasks([]); setStep("manual_entry"); }}
              className="flex-1 bg-card border border-border py-3 text-sm hover:border-accent transition-colors"
            >
              Add Another
            </button>
            <button
              onClick={reset}
              className="flex-1 bg-card border border-border py-3 text-sm hover:border-accent transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
