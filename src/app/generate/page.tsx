"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import type { JobStatus, CompositionStyle } from "@/lib/types";
import { DEFAULT_STYLE } from "@/lib/types";
import GenerationProgress from "@/components/GenerationProgress";
import EditPanel from "@/components/EditPanel";
import AiAssistant from "@/components/AiAssistant";
import Navbar from "@/components/Navbar";
import LoadingSkeleton from "@/components/LoadingSkeleton";

const VideoPreview = dynamic(() => import("@/components/VideoPreview"), { ssr: false });

function GenerateContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("jobId");
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compositionStyle, setCompositionStyle] = useState<CompositionStyle>(DEFAULT_STYLE);

  const fetchStatus = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/status/${jobId}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data: JobStatus = await res.json();
      setStatus(data);
      return data;
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to fetch status"); return null; }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    fetchStatus();
    const i = setInterval(async () => { const d = await fetchStatus(); if (d && (d.stage === "completed" || d.stage === "failed")) clearInterval(i); }, 2000);
    return () => clearInterval(i);
  }, [jobId, fetchStatus]);

  if (!jobId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center"><p className="text-body">No job ID provided.</p><button onClick={() => router.push("/")} className="btn-ghost mt-3">Go Home</button></div>
      </div>
    );
  }

  if (status?.stage === "completed" && status.generatedScript) {
    return (
      <div className="flex min-h-screen flex-col animate-fade-in">
        <Navbar />
        <div className="flex flex-1 flex-col px-6 pt-18 pb-8 sm:px-10">
          <div className="mb-6 pt-2">
            <h1 className="text-heading-lg mb-2">{status.generatedScript.title}</h1>
            <span className="badge badge-success"><svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>Generated</span>
          </div>
          <div className="flex flex-1 flex-col gap-5 lg:flex-row">
            <div className="flex-1 lg:flex-[2]">
              <div className="card overflow-hidden" style={{ borderRadius: "var(--radius-xl)" }}><VideoPreview script={status.generatedScript} style={compositionStyle} /></div>
              {status.downloadUrl && (
                <div className="mt-5"><a href={status.downloadUrl} className="btn-primary gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                  Download Video
                </a></div>
              )}
            </div>
            <div className="flex flex-col gap-4 lg:flex-1 lg:max-w-md">
              <div className="min-h-[280px] lg:h-[340px]"><EditPanel currentStyle={compositionStyle} onStyleChange={(s) => setCompositionStyle(s)} /></div>
              <div className="h-[280px] lg:h-[340px]"><AiAssistant /></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <button onClick={() => router.push("/")} className="btn-ghost absolute left-5 top-5 gap-1.5 sm:left-8 sm:top-8">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>Back
      </button>

      <h1 className="text-heading-lg mb-1">Generating Your Video</h1>
      <p className="text-caption mb-8" style={{ fontVariantNumeric: "tabular-nums" }}>{jobId}</p>

      {error && !status && <div className="w-full max-w-3xl rounded-lg px-4 py-3 text-sm mb-4" style={{ background: "var(--error-subtle)", color: "var(--error)" }}>{error}</div>}
      {status && <GenerationProgress status={status} />}
      {status?.stage === "failed" && <button onClick={() => router.push("/")} className="btn-primary mt-6">Try Again</button>}

      {!status && !error && (
        <div className="w-full max-w-3xl space-y-6 animate-fade-in">
          <div className="flex items-center justify-between gap-2">
            {Array.from({length:6}).map((_,i) => (
              <div key={i} className="flex flex-1 items-center">
                <div className="skeleton h-8 w-8 rounded-full flex-shrink-0" />
                {i < 5 && <div className="skeleton mx-1 h-[2px] flex-1" />}
              </div>
            ))}
          </div>
          <LoadingSkeleton lines={3} className="mt-4" />
          <div className="grid grid-cols-2 gap-2">{Array.from({length:4}).map((_,i) => <div key={i} className="skeleton skeleton-rect h-16" />)}</div>
        </div>
      )}
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-3xl space-y-6 px-6">
          <div className="skeleton skeleton-heading mx-auto" />
          <div className="skeleton h-2 w-full rounded-full" />
          <div className="grid grid-cols-2 gap-2">{Array.from({length:4}).map((_,i) => <div key={i} className="skeleton skeleton-rect h-16" />)}</div>
        </div>
      </div>
    }>
      <GenerateContent />
    </Suspense>
  );
}
