"use client";

import { useState, useRef, useCallback } from "react";

interface AssetUploaderProps {
  assets: string[];
  onAssetsChange: (assets: string[]) => void;
  disabled?: boolean;
}

export default function AssetUploader({
  assets,
  onAssetsChange,
  disabled,
}: AssetUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Upload failed");

        const data = await res.json();
        onAssetsChange([...assets, data.url]);
      } catch (err) {
        console.error("Upload failed:", err);
      } finally {
        setIsUploading(false);
      }
    },
    [assets, onAssetsChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files[0]) uploadFile(files[0]);
    },
    [disabled, uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      e.target.value = "";
    },
    [uploadFile]
  );

  const addUrl = useCallback(() => {
    const url = urlInput.trim();
    if (!url) return;
    onAssetsChange([...assets, url]);
    setUrlInput("");
  }, [urlInput, assets, onAssetsChange]);

  const removeAsset = useCallback(
    (index: number) => {
      onAssetsChange(assets.filter((_, i) => i !== index));
    },
    [assets, onAssetsChange]
  );

  return (
    <div className="space-y-3">
      <label className="text-label-md">
        Assets <span style={{ color: "var(--outline)", fontWeight: 400, textTransform: "none", letterSpacing: "normal", fontSize: "0.7rem" }}>(optional)</span>
      </label>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 transition-all duration-200 ${
          disabled ? "opacity-40 cursor-not-allowed" : ""
        }`}
        style={{
          borderColor: isDragging
            ? "var(--primary)"
            : "rgba(73, 68, 86, 0.15)",
          background: isDragging
            ? "rgba(92, 31, 222, 0.05)"
            : "transparent",
        }}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          style={{ color: "var(--outline)" }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
          />
        </svg>
        <span className="text-xs" style={{ color: "var(--outline)" }}>
          {isUploading
            ? "Uploading..."
            : "Drop images here or click to upload"}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />
      </div>

      {/* URL paste */}
      <div className="flex gap-2">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addUrl()}
          placeholder="Or paste image URL..."
          disabled={disabled}
          className="flex-1 rounded-xl px-3.5 py-2 text-sm outline-none transition-all duration-200 disabled:opacity-40"
          style={{
            background: "var(--surface-container-low)",
            color: "var(--on-surface)",
            border: "1px solid rgba(73, 68, 86, 0.15)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(205, 189, 255, 0.3)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(73, 68, 86, 0.15)";
          }}
        />
        <button
          type="button"
          onClick={addUrl}
          disabled={disabled || !urlInput.trim()}
          className="rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: "var(--surface-container-high)",
            color: "var(--on-surface-variant)",
            border: "1px solid rgba(73, 68, 86, 0.1)",
          }}
        >
          Add
        </button>
      </div>

      {/* Asset thumbnails */}
      {assets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {assets.map((url, index) => (
            <div
              key={index}
              className="group relative h-14 w-14 overflow-hidden rounded-lg"
              style={{ border: "1px solid rgba(73, 68, 86, 0.15)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Asset ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAsset(index)}
                className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <svg
                  className="h-3.5 w-3.5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
