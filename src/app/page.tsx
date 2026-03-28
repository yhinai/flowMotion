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

      <main className="flex flex-1 flex-col items-center px-4 pt-28 pb-20 sm:px-6">
        {/* Hero */}
        <div className="mb-10 text-center max-w-4xl">
          <div className="mb-4 animate-fade-in" style={{ animationFillMode: "forwards" }}>
            <span className="badge badge-default text-xs">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
              AI Video Generator
            </span>
          </div>

          <h1 className="text-display animate-fade-in-up delay-1" style={{ animationFillMode: "forwards" }}>
            Describe it.{" "}
            <span style={{
              background: "linear-gradient(135deg, #ffffff 0%, #a3a3a3 100%)",
              backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent",
            }}>
              Watch it come alive.
            </span>
          </h1>

          <p className="text-body mt-4 mx-auto max-w-md animate-fade-in-up delay-2" style={{ animationFillMode: "forwards" }}>
            Write a prompt. AI writes the script, generates every scene, and composes the final cut.
          </p>
        </div>

        {/* Creation card */}
        <div className="card w-full max-w-4xl p-6 sm:p-8 space-y-6 animate-fade-in-up delay-3" style={{ animationFillMode: "forwards" }}>
          <PromptInput onSubmit={handleSubmit} isLoading={isLoading} externalValue={injectedPrompt} />
          <LiveTopics onSelectTopic={(p) => setInjectedPrompt(p)} disabled={isLoading} />
          <div className="space-y-5">
            <EngineSelector selected={engine} onChange={setEngine} disabled={isLoading} />
            <TemplatePicker selected={templateId} onChange={setTemplateId} disabled={isLoading} />
            <AssetUploader assets={assets} onAssetsChange={setAssets} disabled={isLoading} />
          </div>
        </div>

        {error && (
          <div className="mt-4 w-full max-w-4xl rounded-lg px-4 py-3 text-sm animate-fade-in"
            style={{ background: "var(--error-subtle)", color: "var(--error)", border: "1px solid var(--border-subtle)" }}>
            {error}
          </div>
        )}
      </main>

      {/* How It Works */}
      <section className="px-4 py-20 sm:px-6" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="mx-auto max-w-4xl">
          <p className="text-caption text-center mb-2 uppercase tracking-widest font-medium">How It Works</p>
          <h2 className="text-heading-lg text-center mb-10">Three steps to your video</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { n: "01", title: "Describe", desc: "Write a prompt or paste a URL.", icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" },
              { n: "02", title: "Generate", desc: "AI generates clips for each scene.", icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
              { n: "03", title: "Export", desc: "Preview, refine, download MP4.", icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" },
            ].map((item, i) => (
              <div key={item.n} className={`card-flat p-5 animate-fade-in-up delay-${i + 4}`} style={{ animationFillMode: "forwards" }}>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ background: "var(--bg-subtle)", color: "var(--text-subtle)" }}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                  </div>
                  <span className="text-caption font-semibold">{item.n}</span>
                </div>
                <h3 className="text-heading-sm mb-1">{item.title}</h3>
                <p className="text-body-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 text-center px-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <p className="text-caption">
          Powered by Gemini · Veo · Remotion · DigitalOcean Spaces · assistant-ui · Augment Code · Nexla
        </p>
      </footer>
    </div>
  );
}
