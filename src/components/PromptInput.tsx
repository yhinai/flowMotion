"use client";

import { useState, useMemo, useEffect } from "react";

type SourceType = "prompt" | "youtube" | "github";
interface DetectedSource { type: SourceType; url: string; label: string; }
interface PromptInputProps {
  onSubmit: (prompt: string, resolution: string, sceneCount: number, source?: { type: SourceType; url: string }) => void;
  isLoading: boolean;
  externalValue?: string;
}

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/;
const GITHUB_REGEX = /(?:https?:\/\/)?(?:www\.)?github\.com\/([\w-]+)\/([\w.-]+)/;

function detectSource(text: string): DetectedSource | null {
  const yt = text.match(YOUTUBE_REGEX);
  if (yt) return { type: "youtube", url: yt[0], label: "YouTube" };
  const gh = text.match(GITHUB_REGEX);
  if (gh) return { type: "github", url: gh[0], label: "GitHub" };
  return null;
}

export default function PromptInput({ onSubmit, isLoading, externalValue }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState("1080p");
  const [sceneCount, setSceneCount] = useState(5);

  useEffect(() => { if (externalValue !== undefined && externalValue !== "") setPrompt(externalValue); }, [externalValue]);
  const detectedSource = useMemo(() => detectSource(prompt), [prompt]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    onSubmit(prompt.trim(), resolution, sceneCount, detectedSource ? { type: detectedSource.type, url: detectedSource.url } : undefined);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the video you want to create..."
          disabled={isLoading}
          rows={3}
          className="input resize-none"
          style={{ padding: "0.75rem 1rem" }}
        />
        {detectedSource && (
          <div className="absolute top-2.5 right-2.5 badge badge-success text-[11px]">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
            {detectedSource.label}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="res" className="text-label">Resolution</label>
          <select id="res" value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={isLoading}
            className="input cursor-pointer" style={{ padding: "0.375rem 0.625rem", minWidth: "5rem" }}>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="scenes" className="text-label">Scenes: <span style={{ color: "var(--text-emphasis)" }}>{sceneCount}</span></label>
          <input id="scenes" type="range" min={3} max={8} value={sceneCount} onChange={(e) => setSceneCount(Number(e.target.value))} disabled={isLoading}
            className="h-1 w-full cursor-pointer appearance-none rounded-full disabled:opacity-50"
            style={{ background: `linear-gradient(to right, var(--brand) 0%, var(--brand) ${((sceneCount-3)/5)*100}%, var(--border) ${((sceneCount-3)/5)*100}%, var(--border) 100%)`, accentColor: "#ffffff" }} />
        </div>

        <button type="submit" disabled={isLoading || !prompt.trim()} className="btn-primary whitespace-nowrap">
          {isLoading ? (
            <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Generating...</>
          ) : (
            <>Generate <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg></>
          )}
        </button>
      </div>
    </form>
  );
}
