"use client";

import type { GenerationEngine } from "@/lib/types";
import { ENGINE_INFO } from "@/lib/types";

interface EngineSelectorProps {
  selected: GenerationEngine;
  onChange: (e: GenerationEngine) => void;
  disabled?: boolean;
}

const ENGINES: GenerationEngine[] = ["veo3", "nano-banan", "auto"];

export default function EngineSelector({ selected, onChange, disabled }: EngineSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-label">Engine</label>
      <div className="space-y-2">
        {ENGINES.map((id) => {
          const info = ENGINE_INFO[id];
          const sel = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              disabled={disabled}
              className="w-full flex items-center gap-3 text-left px-4 py-3 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: sel ? "var(--bg-subtle)" : "var(--bg)",
                border: `1px solid ${sel ? "var(--border-emphasis)" : "var(--border-subtle)"}`,
                borderRadius: "var(--radius-lg)",
              }}
            >
              {/* Radio dot */}
              <div
                className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                style={{
                  border: `2px solid ${sel ? "var(--text-emphasis)" : "var(--border)"}`,
                }}
              >
                {sel && (
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: "var(--text-emphasis)" }}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: sel ? "var(--text-emphasis)" : "var(--text)" }}
                  >
                    {info.name}
                  </span>
                  {id === "auto" && (
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                      style={{ background: "var(--bg-emphasis)", color: "var(--text-subtle)" }}
                    >
                      Recommended
                    </span>
                  )}
                </div>
                <span
                  className="text-xs line-clamp-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {info.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
