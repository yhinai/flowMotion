"use client";

import type { GenerationEngine } from "@/lib/types";
import { ENGINE_INFO } from "@/lib/types";
import type { ReactNode } from "react";

interface EngineSelectorProps {
  selected: GenerationEngine;
  onChange: (engine: GenerationEngine) => void;
  disabled?: boolean;
}

const ENGINE_ICONS: Record<GenerationEngine, ReactNode> = {
  veo3: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  ),
  "nano-banan": (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  ),
  auto: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
  ),
};

const ENGINES: GenerationEngine[] = ["veo3", "nano-banan", "auto"];

export default function EngineSelector({
  selected,
  onChange,
  disabled,
}: EngineSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-label-md">Engine</label>
      <div className="flex gap-2.5">
        {ENGINES.map((engineId) => {
          const info = ENGINE_INFO[engineId];
          const isSelected = selected === engineId;
          const isRecommended = engineId === "auto";
          return (
            <button
              key={engineId}
              type="button"
              onClick={() => onChange(engineId)}
              disabled={disabled}
              className="group relative flex flex-1 items-center gap-3 rounded-xl p-3.5 transition-all duration-250 border disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: isSelected
                  ? "rgba(92, 31, 222, 0.12)"
                  : "var(--surface-container-low)",
                borderColor: isSelected
                  ? "rgba(205, 189, 255, 0.35)"
                  : "rgba(73, 68, 86, 0.1)",
                boxShadow: isSelected
                  ? "0 0 24px rgba(92, 31, 222, 0.15), inset 0 1px 0 rgba(205, 189, 255, 0.1)"
                  : "none",
              }}
              onMouseEnter={(e) => {
                if (!isSelected && !disabled) {
                  e.currentTarget.style.background = "var(--surface-container)";
                  e.currentTarget.style.borderColor = "rgba(73, 68, 86, 0.25)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !disabled) {
                  e.currentTarget.style.background = "var(--surface-container-low)";
                  e.currentTarget.style.borderColor = "rgba(73, 68, 86, 0.1)";
                  e.currentTarget.style.transform = "translateY(0)";
                }
              }}
            >
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors"
                style={{
                  background: isSelected
                    ? "rgba(92, 31, 222, 0.15)"
                    : "rgba(73, 68, 86, 0.1)",
                  color: isSelected ? "var(--primary)" : "var(--outline)",
                }}
              >
                {ENGINE_ICONS[engineId]}
              </div>
              <div className="text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{
                      color: isSelected ? "var(--on-surface)" : "var(--on-surface-variant)",
                    }}
                  >
                    {info.name}
                  </span>
                  {isRecommended && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider"
                      style={{
                        background: "rgba(92, 31, 222, 0.15)",
                        color: "var(--primary)",
                      }}
                    >
                      Auto
                    </span>
                  )}
                </div>
                <span
                  className="text-xs leading-tight line-clamp-1"
                  style={{ color: "var(--outline)" }}
                >
                  {info.description}
                </span>
              </div>
              {isSelected && (
                <div
                  className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                  style={{
                    background: "var(--primary)",
                    boxShadow: "0 0 8px rgba(205, 189, 255, 0.6)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
