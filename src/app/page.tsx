"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PromptInput from "@/components/PromptInput";
import TemplatePicker from "@/components/TemplatePicker";
import EngineSelector from "@/components/EngineSelector";
import AssetUploader from "@/components/AssetUploader";
import Navbar from "@/components/Navbar";
import LiveTopics from "@/components/LiveTopics";
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
    prompt: string, resolution: string, sceneCount: number,
    source?: { type: string; url: string }
  ) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt, resolution, sceneCount,
          templateId: templateId === "custom" ? undefined : templateId,
          engine, sourceType: source?.type ?? "prompt", sourceUrl: source?.url,
          assets: assets.length > 0 ? assets : undefined,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Request failed (${res.status})`); }
      const data = await res.json();
      router.push(`/generate?jobId=${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center px-6 pt-36 pb-28 sm:px-10 lg:px-20">
        <div className="mb-16 text-center w-full max-w-5xl">
          <div className="mb-6 animate-fade-in" style={{ animationFillMode: "forwards" }}>
            <span className="badge badge-default">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
              AI Video Generator
            </span>
          </div>

          <h1 className="text-display animate-fade-in-up delay-1" style={{ animationFillMode: "forwards" }}>
            Describe it.{" "}
            <span style={{
              background: "linear-gradient(135deg, #ffffff 0%, #737373 100%)",
              backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent",
            }}>
              Watch it come alive.
            </span>
          </h1>

          <p className="text-body mt-6 mx-auto max-w-lg animate-fade-in-up delay-2" style={{ animationFillMode: "forwards" }}>
            Write a prompt. AI writes the script, generates every scene, and composes the final cut.
          </p>
        </div>

        {/* Creation card — wide layout */}
        <div
          className="card w-full max-w-5xl p-8 sm:p-10 lg:p-12 animate-fade-in-up delay-3"
          style={{ animationFillMode: "forwards" }}
        >
          {/* Prompt area */}
          <div className="mb-8">
            <PromptInput onSubmit={handleSubmit} isLoading={isLoading} externalValue={injectedPrompt} />
          </div>

          {/* Live topics */}
          <div className="mb-8 pb-8" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <LiveTopics onSelectTopic={(p) => setInjectedPrompt(p)} disabled={isLoading} />
          </div>

          {/* Settings — stacked full-width for proper alignment */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <EngineSelector selected={engine} onChange={setEngine} disabled={isLoading} />
            <TemplatePicker selected={templateId} onChange={setTemplateId} disabled={isLoading} />
          </div>

          <div className="mt-6">
            <AssetUploader assets={assets} onAssetsChange={setAssets} disabled={isLoading} />
          </div>
        </div>

        {error && (
          <div className="mt-6 w-full max-w-5xl rounded-lg px-5 py-4 text-sm animate-fade-in"
            style={{ background: "var(--error-subtle)", color: "var(--error)", border: "1px solid var(--border-subtle)" }}>
            {error}
          </div>
        )}
      </main>

      {/* How It Works */}
      <section className="px-6 py-28 sm:px-10 lg:px-20" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="mx-auto max-w-5xl">
          <p className="text-caption text-center mb-3 uppercase tracking-widest font-semibold">How It Works</p>
          <h2 className="text-heading-lg text-center mb-16">Three steps to your video</h2>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { n: "01", title: "Describe", desc: "Write a prompt or paste a URL. Set your resolution and scene count.", icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" },
              { n: "02", title: "Generate", desc: "AI writes the script and generates video clips for each scene.", icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
              { n: "03", title: "Export", desc: "Preview in-browser, refine with AI chat, then download your MP4.", icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" },
            ].map((item, i) => (
              <div key={item.n} className={`card-flat p-7 animate-fade-in-up delay-${i + 4}`} style={{ animationFillMode: "forwards" }}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--bg-subtle)", color: "var(--text-emphasis)" }}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                  </div>
                  <span className="text-caption font-bold tracking-wider">{item.n}</span>
                </div>
                <h3 className="text-heading-sm mb-2">{item.title}</h3>
                <p className="text-body-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 text-center px-6" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <p className="text-caption">
          Powered by Gemini · Veo · Remotion · DigitalOcean Spaces · assistant-ui · Augment Code · Nexla
        </p>
      </footer>
    </div>
  );
}
