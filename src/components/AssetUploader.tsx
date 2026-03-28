"use client";

import { useState, useRef, useCallback } from "react";

interface AssetUploaderProps { assets: string[]; onAssetsChange: (a: string[]) => void; disabled?: boolean; }

export default function AssetUploader({ assets, onAssetsChange, disabled }: AssetUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      onAssetsChange([...assets, data.url]);
    } catch (err) { console.error("Upload failed:", err); } finally { setIsUploading(false); }
  }, [assets, onAssetsChange]);

  return (
    <div className="space-y-2">
      <label className="text-label">Assets <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>

      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (disabled) return; const f = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); if (f[0]) uploadFile(f[0]); }}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-4 transition-all ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
        style={{ borderColor: isDragging ? "var(--border-emphasis)" : "var(--border)", background: isDragging ? "var(--bg-subtle)" : "transparent" }}>
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--text-muted)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
        </svg>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{isUploading ? "Uploading..." : "Drop images or click"}</span>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} className="hidden" disabled={disabled} />
      </div>

      <div className="flex gap-2">
        <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { const u = urlInput.trim(); if (u) { onAssetsChange([...assets, u]); setUrlInput(""); } } }}
          placeholder="Or paste image URL..." disabled={disabled} className="input flex-1" style={{ padding: "0.375rem 0.625rem" }} />
        <button type="button" onClick={() => { const u = urlInput.trim(); if (u) { onAssetsChange([...assets, u]); setUrlInput(""); } }}
          disabled={disabled || !urlInput.trim()} className="btn-secondary text-sm disabled:opacity-30" style={{ padding: "0.375rem 0.625rem" }}>Add</button>
      </div>

      {assets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {assets.map((url, i) => (
            <div key={i} className="group relative h-10 w-10 overflow-hidden rounded-md" style={{ border: "1px solid var(--border-subtle)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Asset ${i+1}`} className="h-full w-full object-cover" />
              <button type="button" onClick={() => onAssetsChange(assets.filter((_,idx)=>idx!==i))}
                className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
