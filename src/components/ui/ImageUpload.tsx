"use client";

import { useRef, useState } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { ImageIcon, X, Loader2 } from "lucide-react";

interface ImageUploadProps {
  onUploaded: (url: string) => void;
  onRemove?: () => void;
  preview?: string;
  bucket?: string;
  className?: string;
  label?: string;
}

export default function ImageUpload({
  onUploaded,
  onRemove,
  preview,
  bucket = "portal-images",
  className = "",
  label = "Attach image",
}: ImageUploadProps) {
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
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await axiom.storage.from(bucket).upload(path, file, { upsert: false });
    if (upErr) {
      setError("Upload failed — please try again.");
      setUploading(false);
      return;
    }
    const { data } = axiom.storage.from(bucket).getPublicUrl(path);
    onUploaded(data.publicUrl);
    setUploading(false);
  }

  return (
    <div className={className}>
      {preview ? (
        <div className="relative inline-block">
          <img src={preview} alt="Preview" className="max-h-40 max-w-full object-contain border border-gray-200 rounded" />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 border border-dashed border-gray-300 px-3 py-2 hover:border-gray-500 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <><Loader2 size={13} className="animate-spin" /> Uploading…</>
          ) : (
            <><ImageIcon size={13} /> {label}</>
          )}
        </button>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
      />
    </div>
  );
}
