"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { axiom } from "@/lib/axiom-supabase";
import { ImageIcon, X, Loader2, CheckCircle, Upload } from "lucide-react";

const BUDGET_RANGES = [
  "Under $500",
  "$500 – $1,000",
  "$1,000 – $2,500",
  "$2,500 – $5,000",
  "$5,000 – $10,000",
  "$10,000 – $25,000",
  "$25,000+",
  "Not sure yet",
];

const inp =
  "w-full bg-white border border-gray-200 px-4 py-3 text-gray-900 text-sm focus:outline-none focus:border-[#c4a24d] transition-colors placeholder:text-gray-400";
const lbl = "block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5";

function PhotoUpload({
  onUploaded,
}: {
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10 MB.");
      return;
    }
    setError("");
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `leads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await axiom.storage
      .from("portal-images")
      .upload(path, file, { upsert: false });
    if (upErr) {
      setError("Upload failed — please try again.");
      setUploading(false);
      return;
    }
    const { data } = axiom.storage.from("portal-images").getPublicUrl(path);
    onUploaded(data.publicUrl);
    setUploading(false);
    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#8b6914] border border-dashed border-gray-300 hover:border-[#c4a24d] px-4 py-3 w-full transition-colors disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 size={16} className="animate-spin shrink-0" />
            Uploading…
          </>
        ) : (
          <>
            <Upload size={16} className="shrink-0" />
            Add inspiration photo
          </>
        )}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) handleFile(e.target.files[0]);
        }}
      />
    </div>
  );
}

export default function LeadsPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    description: "",
    budget_range: "",
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function set(field: string, val: string) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function removePhoto(url: string) {
    setPhotos((p) => p.filter((u) => u !== url));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, inspiration_photos: photos }),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <CheckCircle className="mx-auto mb-6 text-[#c4a24d]" size={56} />
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            We&apos;ll be in touch!
          </h1>
          <p className="text-gray-500 text-lg mb-8">
            Thanks for reaching out. We&apos;ll review your project and get back to you shortly.
          </p>
          <a
            href="/"
            className="inline-block bg-[#c4a24d] text-white px-8 py-3 text-sm font-bold uppercase tracking-wider hover:bg-[#8b6914] transition-colors"
          >
            Back to Home
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="py-24 px-6 bg-white min-h-screen">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-[#c4a24d] text-xs font-bold uppercase tracking-widest mb-3">
            Get Started
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4">
            Tell Us About Your Project
          </h1>
          <p className="text-gray-500 text-lg mb-12">
            Share your vision and we&apos;ll reach out to discuss how we can bring it to life.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Contact Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                  placeholder="Your full name"
                  className={inp}
                />
              </div>
              <div>
                <label className={lbl}>Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="(555) 000-0000"
                  className={inp}
                />
              </div>
            </div>

            <div>
              <label className={lbl}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@example.com"
                className={inp}
              />
            </div>

            {/* Budget */}
            <div>
              <label className={lbl}>Budget Range</label>
              <select
                value={form.budget_range}
                onChange={(e) => set("budget_range", e.target.value)}
                className={inp + " cursor-pointer"}
              >
                <option value="">Select a range…</option>
                {BUDGET_RANGES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className={lbl}>Project Description</label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Describe what you have in mind — materials, dimensions, style, use, timeline…"
                rows={5}
                className={inp + " resize-y"}
              />
            </div>

            {/* Inspiration Photos */}
            <div>
              <label className={lbl}>
                Inspiration Photos
                <span className="normal-case text-gray-400 ml-2 font-normal tracking-normal">
                  (optional)
                </span>
              </label>
              <p className="text-xs text-gray-400 mb-3">
                Upload any reference photos, sketches, or inspiration images.
              </p>

              {/* Photo grid */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {photos.map((url) => (
                    <div key={url} className="relative group aspect-square">
                      <img
                        src={url}
                        alt="Inspiration"
                        className="w-full h-full object-cover border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(url)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <PhotoUpload onUploaded={(url) => setPhotos((p) => [...p, url])} />
            </div>

            {errorMsg && (
              <p className="text-sm text-red-500">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === "submitting" || !form.name.trim()}
              className="w-full bg-[#c4a24d] text-white py-4 text-sm font-bold uppercase tracking-wider hover:bg-[#8b6914] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {status === "submitting" ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit Project Inquiry"
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
