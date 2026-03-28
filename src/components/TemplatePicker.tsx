"use client";

import type { TemplateIdOrCustom, TemplateConfig } from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";

interface TemplatePickerProps {
  selected: TemplateIdOrCustom;
  onChange: (id: TemplateIdOrCustom) => void;
  disabled?: boolean;
}

const CUSTOM_OPTION = {
  id: "custom" as const,
  name: "Custom",
  description: "Freestyle",
  defaultDurationSeconds: 30,
  defaultAspectRatio: "16:9" as const,
  compositionId: "AIVideo",
};

export default function TemplatePicker({ selected, onChange, disabled }: TemplatePickerProps) {
  const templates = [
    CUSTOM_OPTION,
    ...(Object.values(TEMPLATES) as TemplateConfig[]),
  ] as { id: TemplateIdOrCustom; name: string }[];

  return (
    <div className="space-y-3">
      <label className="text-label">Template</label>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => {
          const sel = selected === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              disabled={disabled}
              className="px-3.5 py-2 text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: sel ? "var(--brand)" : "var(--bg)",
                color: sel ? "var(--brand-text)" : "var(--text-subtle)",
                border: `1px solid ${sel ? "transparent" : "var(--border)"}`,
                borderRadius: "var(--radius-lg)",
              }}
            >
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
