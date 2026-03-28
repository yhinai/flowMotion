"use client";

import { useState, useMemo, useEffect } from "react";

type SourceType = "prompt" | "youtube" | "github";

interface DetectedSource {
  type: SourceType;
  url: string;
  label: string;
}

interface PromptInputProps {
  onSubmit: (prompt: string, resolution: string, sceneCount: number, source?: { type: SourceType; url: string }) => void;
  isLoading: boolean;
  /** Injected prompt (e.g. from LiveTopics). Replaces the current value when changed. */
  externalValue?: string;
}

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/;
const GITHUB_REGEX = /(?:https?:\/\/)?(?:www\.)?github\.com\/([\w-]+)\/([\w.-]+)/;

function detectSource(text: string): DetectedSource | null {
  const ytMatch = text.match(YOUTUBE_REGEX);
  if (ytMatch) {
    return { type: "youtube", url: ytMatch[0], label: "YouTube Video" };
  }
  const ghMatch = text.match(GITHUB_REGEX);
  if (ghMatch) {
    return { type: "github", url: ghMatch[0], label: "GitHub Repo" };
  }
  return null;
}

export default function PromptInput({ onSubmit, isLoading, externalValue }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState("1080p");
  const [sceneCount, setSceneCount] = useState(5);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (externalValue !== undefined && externalValue !== "") {
      setPrompt(externalValue);
    }
  }, [externalValue]);

  const detectedSource = useMemo(() => detectSource(prompt), [prompt]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    onSubmit(
      prompt.trim(),
      resolution,
      sceneCount,
      detectedSource ? { type: detectedSource.type, url: detectedSource.url } : undefined
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-5 font-sans">
      {/* Prompt textarea with animated glow border */}
      <div
        className="relative rounded-2xl transition-all duration-500"
        style={{
          padding: "1px",
          background: isFocused
            ? "linear-gradient(135deg, rgba(92, 31, 222, 0.5), rgba(156, 202, 255, 0.3), rgba(255, 171, 243, 0.3))"
            : "rgba(73, 68, 86, 0.15)",
        }}
      >
        <div
          className="relative rounded-2xl"
          style={{ background: "var(--surface-dim)" }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Describe the video you want to create, or paste a YouTube / GitHub URL..."
            disabled={isLoading}
            rows={4}
            className="prompt-textarea w-full resize-none rounded-2xl bg-transparent px-5 py-4 text-[var(--on-surface)] placeholder-[var(--outline)] outline-none disabled:opacity-50 text-base leading-relaxed"
          />

          {detectedSource && (
            <div
              className="absolute top-3.5 right-3.5 flex items-center gap-2 rounded-full px-3 py-1.5 animate-fade-in"
              style={{
                background: "rgba(125, 220, 142, 0.1)",
                border: "1px solid rgba(125, 220, 142, 0.25)",
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--success)" }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: "var(--success)" }}
              >
                {detectedSource.label}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-6">
        {/* Resolution */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="resolution"
            className="text-label-md"
          >
            Resolution
          </label>
          <select
            id="resolution"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            disabled={isLoading}
            className="rounded-xl px-4 py-2.5 text-sm text-[var(--on-surface)] outline-none transition-all duration-200 cursor-pointer disabled:opacity-50"
            style={{
              background: "var(--surface-container-low)",
              border: "1px solid rgba(73, 68, 86, 0.15)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(205, 189, 255, 0.4)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(73, 68, 86, 0.15)";
            }}
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>

        {/* Scene count slider */}
        <div className="flex flex-1 flex-col gap-2">
          <label
            htmlFor="sceneCount"
            className="text-label-md"
          >
            Scenes:{" "}
            <span style={{ color: "var(--primary)", fontVariantNumeric: "tabular-nums" }}>
              {sceneCount}
            </span>
          </label>
          <input
            id="sceneCount"
            type="range"
            min={3}
            max={8}
            value={sceneCount}
            onChange={(e) => setSceneCount(Number(e.target.value))}
            disabled={isLoading}
            aria-label={`Number of scenes: ${sceneCount}`}
            aria-valuemin={3}
            aria-valuemax={8}
            aria-valuenow={sceneCount}
            className="h-2 w-full cursor-pointer appearance-none rounded-full disabled:opacity-50"
            style={{
              background: `linear-gradient(to right, var(--primary-container) 0%, var(--primary-container) ${((sceneCount - 3) / 5) * 100}%, var(--surface-container-high) ${((sceneCount - 3) / 5) * 100}%, var(--surface-container-high) 100%)`,
              accentColor: "#cdbdff",
            }}
          />
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="btn-primary flex items-center justify-center gap-2.5 whitespace-nowrap text-sm"
          style={{ padding: "0.75rem 2rem" }}
        >
          {isLoading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Generating...
            </>
          ) : (
            <>
              Generate Video
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
