"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PromptInput from "@/components/PromptInput";
import TemplatePicker from "@/components/TemplatePicker";
import EngineSelector from "@/components/EngineSelector";
import AssetUploader from "@/components/AssetUploader";
import Navbar from "@/components/Navbar";
import LiveTopics from "@/components/LiveTopics";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import type { TemplateIdOrCustom, GenerationEngine } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<TemplateIdOrCustom>("custom");
  const [assets, setAssets] = useState<string[]>([]);
  const [engine, setEngine] = useState<GenerationEngine>("auto");
  const [injectedPrompt, setInjectedPrompt] = useState("");

  async function handleSubmit(
    prompt: string,
    resolution: string,
    sceneCount: number,
    source?: { type: string; url: string }
  ) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          resolution,
          sceneCount,
          templateId: templateId === "custom" ? undefined : templateId,
          engine,
          sourceType: source?.type ?? "prompt",
          sourceUrl: source?.url,
          assets: assets.length > 0 ? assets : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      router.push(`/generate?jobId=${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      <Navbar />

      {/* Animated orb background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="orb orb-1" style={{ top: "-10%", left: "15%" }} />
        <div className="orb orb-2" style={{ top: "30%", right: "-5%" }} />
        <div className="orb orb-3" style={{ bottom: "10%", left: "-5%" }} />
      </div>

      {/* Hero section */}
      <main className="flex flex-1 flex-col items-center px-6 pt-32 pb-24">
        <div className="mb-16 text-center max-w-3xl">
          <div
            className="mb-5 opacity-0 animate-fade-in-up"
            style={{ animationFillMode: "forwards" }}
          >
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]"
              style={{
                background: "rgba(92, 31, 222, 0.1)",
                border: "1px solid rgba(205, 189, 255, 0.15)",
                color: "var(--primary)",
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--success)" }}
              />
              AI Video Generator
            </span>
          </div>

          <h1
            className="font-serif text-display-lg opacity-0 animate-fade-in-up delay-1"
            style={{ animationFillMode: "forwards" }}
          >
            Describe it.{" "}
            <span
              className="inline-block"
              style={{
                background: "linear-gradient(135deg, #cdbdff 0%, #9ccaff 50%, #ffabf3 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
                backgroundSize: "200% 200%",
                animation: "gradient-shift 8s ease infinite",
              }}
            >
              Watch it come alive.
            </span>
          </h1>
          <p
            className="mx-auto mt-6 max-w-xl text-body-md opacity-0 animate-fade-in-up delay-2"
            style={{
              animationFillMode: "forwards",
              fontSize: "1rem",
              lineHeight: "1.7",
            }}
          >
            Write a prompt. AI writes the script, generates every scene, and
            composes the final cut. From idea to video in minutes.
          </p>
        </div>

        {/* Main prompt area */}
        <div
          className="w-full max-w-3xl space-y-8 opacity-0 animate-fade-in-up delay-3"
          style={{ animationFillMode: "forwards" }}
        >
          <PromptInput onSubmit={handleSubmit} isLoading={isLoading} externalValue={injectedPrompt} />

          <LiveTopics
            onSelectTopic={(prompt) => setInjectedPrompt(prompt)}
            disabled={isLoading}
          />

          <div className="space-y-6">
            <EngineSelector
              selected={engine}
              onChange={setEngine}
              disabled={isLoading}
            />

            <TemplatePicker
              selected={templateId}
              onChange={setTemplateId}
              disabled={isLoading}
            />

            <AssetUploader
              assets={assets}
              onAssetsChange={setAssets}
              disabled={isLoading}
            />
          </div>
        </div>

        {error && (
          <div
            className="mt-6 w-full max-w-3xl rounded-xl px-5 py-4 text-sm animate-fade-in"
            style={{
              background: "rgba(147, 0, 10, 0.1)",
              border: "1px solid rgba(255, 180, 171, 0.2)",
              color: "var(--error)",
            }}
          >
            {error}
          </div>
        )}
      </main>

      {/* Activity Heatmap */}
      <section className="relative px-6 pb-12 pt-4">
        <div className="mx-auto max-w-3xl">
          <ActivityHeatmap />
        </div>
      </section>

      {/* How It Works section */}
      <section className="relative px-6 pb-28 pt-12">
        <div className="mx-auto max-w-4xl">
          <p
            className="text-label-md text-center mb-3 opacity-0 animate-fade-in-up delay-4"
            style={{ animationFillMode: "forwards" }}
          >
            How It Works
          </p>
          <h2
            className="font-serif text-headline-lg text-center mb-14 opacity-0 animate-fade-in-up delay-4"
            style={{ animationFillMode: "forwards" }}
          >
            Three steps to your video
          </h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {[
              {
                step: "01",
                icon: (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                    />
                  </svg>
                ),
                title: "Describe",
                description:
                  "Write a prompt or paste a URL. Set your resolution and scene count.",
                delay: "delay-5",
              },
              {
                step: "02",
                icon: (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                    />
                  </svg>
                ),
                title: "Generate",
                description:
                  "AI writes the script, generates clips for each scene, and adds narration.",
                delay: "delay-6",
              },
              {
                step: "03",
                icon: (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                ),
                title: "Export",
                description:
                  "Preview in-browser, refine with AI chat, then download your MP4.",
                delay: "delay-7",
              },
            ].map((item) => (
              <div
                key={item.step}
                className={`card-shine group rounded-2xl p-7 transition-all duration-300 opacity-0 animate-fade-in-up ${item.delay}`}
                style={{
                  animationFillMode: "forwards",
                  background: "var(--surface-container-low)",
                  border: "1px solid rgba(73, 68, 86, 0.1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--surface-container)";
                  e.currentTarget.style.borderColor = "rgba(73, 68, 86, 0.25)";
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 40px rgba(0, 0, 0, 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--surface-container-low)";
                  e.currentTarget.style.borderColor = "rgba(73, 68, 86, 0.1)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div className="mb-5 flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-300"
                    style={{
                      background: "rgba(92, 31, 222, 0.1)",
                      color: "var(--primary)",
                    }}
                  >
                    {item.icon}
                  </div>
                  <span className="text-label-md" style={{ color: "var(--outline)" }}>
                    {item.step}
                  </span>
                </div>
                <h3 className="font-serif text-headline-md mb-2">{item.title}</h3>
                <p className="text-body-md leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pb-10 text-center px-6">
        <div
          className="mx-auto mb-8 max-w-4xl"
          style={{
            height: "1px",
            background:
              "linear-gradient(90deg, transparent, rgba(73, 68, 86, 0.15), transparent)",
          }}
        />
        <p className="text-sm text-[var(--outline)]">
          Powered by{" "}
          <span className="text-[var(--on-surface-variant)]">Gemini</span>
          {" \u00B7 "}
          <span className="text-[var(--on-surface-variant)]">Veo</span>
          {" \u00B7 "}
          <span className="text-[var(--on-surface-variant)]">Remotion</span>
          {" \u00B7 "}
          <span className="text-[var(--on-surface-variant)]">DigitalOcean Spaces</span>
          {" \u00B7 "}
          <span className="text-[var(--on-surface-variant)]">assistant-ui</span>
          {" \u00B7 "}
          <span className="text-[var(--on-surface-variant)]">Augment Code</span>
          {" \u00B7 "}
          <span className="text-[var(--on-surface-variant)]">Nexla</span>
        </p>
      </footer>
    </div>
  );
}
