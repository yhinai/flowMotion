"use client";

import type { GenerationEngine } from "@/lib/types";
import { ENGINE_INFO } from "@/lib/types";

interface EngineSelectorProps {
  selected: GenerationEngine;
  onChange: (engine: GenerationEngine) => void;
  disabled?: boolean;
}

const ENGINES: GenerationEngine[] = ["veo3", "nano-banan", "auto"];

export default function EngineSelector({ selected, onChange, disabled }: EngineSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-label">Engine</label>
      <div className="flex gap-2">
        {ENGINES.map((id) => {
          const info = ENGINE_INFO[id];
          const isSelected = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              disabled={disabled}
              className="flex-1 text-left px-3 py-2.5 rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isSelected ? "var(--primary-lighter)" : "var(--bg-secondary)",
                border: `1px solid ${isSelected ? "var(--primary)" : "var(--border-light)"}`,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[0.8125rem] font-medium" style={{ color: isSelected ? "var(--primary)" : "var(--text-primary)" }}>
                  {info.name}
                </span>
                {id === "auto" && (
                  <span className="text-[0.625rem] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
                    Auto
                  </span>
                )}
              </div>
              <span className="text-[0.6875rem] line-clamp-1" style={{ color: "var(--text-tertiary)" }}>
                {info.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
