"use client";

import type { TemplateId, TemplateIdOrCustom, TemplateConfig } from "@/lib/types";
import type { ReactNode } from "react";
import { TEMPLATES } from "@/lib/templates";

interface TemplatePickerProps {
  selected: TemplateIdOrCustom;
  onChange: (templateId: TemplateIdOrCustom) => void;
  disabled?: boolean;
}

const CUSTOM_OPTION = {
  id: "custom" as const,
  name: "Custom",
  description: "Freestyle — full creative freedom",
  defaultDurationSeconds: 30,
  defaultAspectRatio: "16:9" as const,
  compositionId: "AIVideo",
};

const TEMPLATE_ICONS: Record<TemplateIdOrCustom, ReactNode> = {
  custom: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  ),
  "product-launch": (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841" />
    </svg>
  ),
  explainer: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347" />
    </svg>
  ),
  "social-promo": (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09" />
    </svg>
  ),
  "brand-story": (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  editorial: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375" />
    </svg>
  ),
};

export default function TemplatePicker({ selected, onChange, disabled }: TemplatePickerProps) {
  const templates = [CUSTOM_OPTION, ...(Object.values(TEMPLATES) as TemplateConfig[])] as { id: TemplateIdOrCustom; name: string; description: string }[];

  return (
    <div className="space-y-3">
      <label className="text-label-md">Template</label>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {templates.map((t) => {
          const isSelected = selected === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              disabled={disabled}
              className={`group relative flex flex-col items-center gap-2 p-3 text-center transition-all duration-250 disabled:opacity-35 disabled:cursor-not-allowed ${
                isSelected ? "neu-pressed" : "neu-raised-sm"
              }`}
              style={{ borderRadius: "var(--radius-lg)" }}
            >
              <div style={{ color: isSelected ? "var(--primary)" : "var(--outline)" }}>
                {TEMPLATE_ICONS[t.id]}
              </div>
              <span
                className="text-xs font-medium leading-tight"
                style={{ color: isSelected ? "var(--on-surface)" : "var(--on-surface-variant)" }}
              >
                {t.name}
              </span>
              {isSelected && (
                <div
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
                  style={{ background: "var(--primary)", boxShadow: "0 0 6px var(--accent-glow)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
