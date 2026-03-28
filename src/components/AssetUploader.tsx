"use client";

import { useState, useRef, useCallback } from "react";

interface AssetUploaderProps {
  assets: string[];
  onAssetsChange: (assets: string[]) => void;
  disabled?: boolean;
}

export default function AssetUploader({ assets, onAssetsChange, disabled }: AssetUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      onAssetsChange([...assets, data.url]);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  }, [assets, onAssetsChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files[0]) uploadFile(files[0]);
  }, [disabled, uploadFile]);

  return (
    <div className="space-y-2">
      <label className="text-label">
        Assets <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>(optional)</span>
      </label>

      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed p-4 transition-all duration-150 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        style={{
          borderColor: isDragging ? "var(--primary)" : "var(--border)",
          background: isDragging ? "var(--primary-lighter)" : "transparent",
        }}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
        </svg>
        <span className="text-[0.8125rem]" style={{ color: "var(--text-tertiary)" }}>
          {isUploading ? "Uploading..." : "Drop images or click to upload"}
        </span>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} className="hidden" disabled={disabled} />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { const url = urlInput.trim(); if (url) { onAssetsChange([...assets, url]); setUrlInput(""); } } }}
          placeholder="Or paste image URL..."
          disabled={disabled}
          className="input flex-1"
          style={{ padding: "0.5rem 0.75rem", fontSize: "0.8125rem" }}
        />
        <button
          type="button"
          onClick={() => { const url = urlInput.trim(); if (url) { onAssetsChange([...assets, url]); setUrlInput(""); } }}
          disabled={disabled || !urlInput.trim()}
          className="btn-secondary text-[0.8125rem] disabled:opacity-40"
          style={{ padding: "0.5rem 0.75rem" }}
        >
          Add
        </button>
      </div>

      {assets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {assets.map((url, i) => (
            <div key={i} className="group relative h-12 w-12 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Asset ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onAssetsChange(assets.filter((_, idx) => idx !== i))}
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
