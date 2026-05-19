"use client";

// Generic file upload — sister to ImageUpload, but accepts arbitrary file
// types (PDFs, Word docs, spreadsheets, anything). Uploads to Supabase
// Storage and hands the resulting public URL + metadata back to the
// caller, who decides what to do with it (typically: write a row into
// build_files or a similar table).

import { useRef, useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { FileUp, Loader2 } from "lucide-react";

interface UploadedFile {
  url: string;
  name: string;
  type: string;
  size: number;
}

interface FileUploadProps {
  onUploaded: (file: UploadedFile) => void;
  bucket?: string;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  className?: string;
}

export default function FileUpload({
  onUploaded,
  bucket = "portal-images",
  accept = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.dwg,.dxf,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv,application/zip",
  maxSizeMB = 25,
  label = "Upload document",
  className = "",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File must be under ${maxSizeMB} MB.`);
      return;
    }
    setUploading(true);
    // Sanitize the original filename for the storage path — keep the
    // extension so the browser previews correctly when the URL is opened.
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
    const path = `docs/${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}${ext && !safe.endsWith("." + ext) ? `.${ext}` : ""}`;
    const { error: upErr } = await axiom.storage.from(bucket).upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (upErr) {
      setError(`Upload failed — ${upErr.message}`);
      setUploading(false);
      return;
    }
    const { data } = axiom.storage.from(bucket).getPublicUrl(path);
    onUploaded({
      url: data.publicUrl,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
    });
    setUploading(false);
    // Reset so picking the same file twice in a row still triggers onChange.
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 text-xs text-accent hover:text-foreground border border-dashed border-accent/50 px-3 py-2 hover:border-accent transition-colors disabled:opacity-50"
      >
        {uploading ? (
          <><Loader2 size={13} className="animate-spin" /> Uploading…</>
        ) : (
          <><FileUp size={13} /> {label}</>
        )}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
      />
    </div>
  );
}
