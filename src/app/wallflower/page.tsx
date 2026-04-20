"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import { CheckCircle2, ClipboardList, Send } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
);

const WORK_TYPES = ["Repair", "Fabrication", "Refinish", "Install", "Custom Build", "Modification", "Other"];
const SCOPES = ["Internal", "External", "Client-Facing", "Warranty"];

const inp = "w-full bg-[#111] border border-[#333] px-4 py-3 text-white text-sm focus:outline-none focus:border-[#c4a24d] rounded-none";

export default function WallflowerSubmit() {
  const [form, setForm] = useState({
    item_name: "",
    item_source: "custom" as "inventory" | "custom",
    work_type: "Repair",
    scope: "Internal",
    assigned_to: "",
    deadline: "",
    description: "",
    quantity: 1,
    submitted_by: "",
  });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.item_name.trim()) return;
    setSaving(true);
    await supabase.from("wallflower_work_orders").insert({
      item_name: form.item_name,
      item_source: form.item_source,
      work_type: form.work_type,
      scope: form.scope,
      assigned_to: form.assigned_to || null,
      deadline: form.deadline || null,
      status: "pending",
      description: form.description || null,
      quantity: form.quantity || 1,
      submitted_by: form.submitted_by || "Wallflower",
    });
    setSaving(false);
    setSubmitted(true);
  }

  function reset() {
    setForm({
      item_name: "",
      item_source: "custom",
      work_type: "Repair",
      scope: "Internal",
      assigned_to: "",
      deadline: "",
      description: "",
      quantity: 1,
      submitted_by: form.submitted_by,
    });
    setSubmitted(false);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <CheckCircle2 size={64} className="text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold text-white">Work Order Submitted</h1>
          <p className="text-[#888] text-sm">
            Your work order for <span className="text-[#c4a24d]">{form.item_name}</span> has been received. The RELIC team will review it shortly.
          </p>
          <button
            onClick={reset}
            className="bg-[#c4a24d] text-black px-6 py-3 text-sm font-semibold hover:bg-[#d4b25d] transition-colors"
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#222] px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-emblem.png" alt="Relic" width={28} height={28} className="h-7 w-7" />
            <div>
              <span className="text-white text-lg font-bold tracking-widest">RELIC</span>
              <span className="text-[#c4a24d] text-xs ml-2 uppercase tracking-wider">Wallflower Portal</span>
            </div>
          </div>
          <ClipboardList size={20} className="text-[#c4a24d]" />
        </div>
      </header>

      {/* Form */}
      <main className="flex-1 px-6 py-8">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">New Work Order Request</h1>
            <p className="text-[#888] text-sm">Submit a work order and the RELIC team will create an estimate.</p>
          </div>

          {/* Submitted by */}
          <div>
            <label className="text-xs uppercase tracking-wider text-[#888] block mb-1.5">Your Name</label>
            <input className={inp} value={form.submitted_by} onChange={(e) => setForm((f) => ({ ...f, submitted_by: e.target.value }))} placeholder="Who is submitting this request?" />
          </div>

          {/* Item */}
          <div>
            <label className="text-xs uppercase tracking-wider text-[#888] block mb-1.5">
              Item <span className="text-[#c4a24d]">*</span>
            </label>
            <input className={inp} value={form.item_name} onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))} placeholder="e.g. Oak conference table, Custom shelving unit..." required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-[#888] block mb-1.5">Item Source</label>
              <select className={inp} value={form.item_source} onChange={(e) => setForm((f) => ({ ...f, item_source: e.target.value as "inventory" | "custom" }))}>
                <option value="custom">Custom Item</option>
                <option value="inventory">From Inventory</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[#888] block mb-1.5">Quantity</label>
              <input type="number" min={1} className={inp} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-[#888] block mb-1.5">Work Type</label>
              <select className={inp} value={form.work_type} onChange={(e) => setForm((f) => ({ ...f, work_type: e.target.value }))}>
                {WORK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[#888] block mb-1.5">Scope</label>
              <select className={inp} value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
                {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-[#888] block mb-1.5">Assigned To</label>
              <input className={inp} value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[#888] block mb-1.5">Deadline</label>
              <input type="date" className={inp} value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-[#888] block mb-1.5">Description of Work</label>
            <textarea
              className={inp + " min-h-[120px] resize-y"}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe the work needed in detail..."
            />
          </div>

          <button
            type="submit"
            disabled={saving || !form.item_name.trim()}
            className="w-full bg-[#c4a24d] text-black py-4 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#d4b25d] disabled:opacity-40 transition-colors"
          >
            {saving ? "Submitting..." : <><Send size={16} /> Submit Work Order</>}
          </button>
        </form>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#222] px-6 py-4 text-center">
        <p className="text-[#555] text-xs">Powered by RELIC Built · Axiom</p>
      </footer>
    </div>
  );
}
