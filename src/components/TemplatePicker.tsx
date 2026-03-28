"use client";

import type { TemplateIdOrCustom, TemplateConfig } from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";

interface TemplatePickerProps {
  selected: TemplateIdOrCustom;
  onChange: (templateId: TemplateIdOrCustom) => void;
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
  const templates = [CUSTOM_OPTION, ...(Object.values(TEMPLATES) as TemplateConfig[])] as { id: TemplateIdOrCustom; name: string }[];

  return (
    <div className="space-y-2">
      <label className="text-label">Template</label>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => {
          const isSelected = selected === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              disabled={disabled}
              className="px-3 py-1.5 rounded-full text-[0.8125rem] font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isSelected ? "var(--primary)" : "var(--bg-elevated)",
                color: isSelected ? "white" : "var(--text-secondary)",
                border: `1px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
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
