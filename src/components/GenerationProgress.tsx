"use client";

import type { JobStatus, JobStage, SceneProgress } from "@/lib/types";

interface GenerationProgressProps { status: JobStatus; }

const PIPELINE_STEPS = [
  { key: "queued", label: "Queue" }, { key: "generating_script", label: "Script" },
  { key: "generating_clips", label: "Clips" }, { key: "uploading_assets", label: "Assets" },
  { key: "composing_video", label: "Render" }, { key: "completed", label: "Done" },
] as const;

const STAGE_ORDER: JobStage[] = ["queued", "generating_script", "generating_clips", "uploading_assets", "composing_video", "completed"];

function getStepState(stepIndex: number, currentStage: JobStage): "completed" | "active" | "pending" {
  const idx = currentStage === "failed" ? -1 : STAGE_ORDER.indexOf(currentStage);
  if (currentStage === "failed") return "pending";
  if (stepIndex < idx) return "completed";
  if (stepIndex === idx) return "active";
  return "pending";
}

function SceneCard({ scene, index, sceneTitle }: { scene: SceneProgress; index: number; sceneTitle?: string }) {
  const colors: Record<string, { color: string; label: string }> = {
    done: { color: "var(--success)", label: "Complete" },
    generating: { color: "var(--primary)", label: "Generating..." },
    uploading: { color: "var(--info)", label: "Uploading..." },
    pending: { color: "var(--text-tertiary)", label: "Pending" },
    failed: { color: "var(--error)", label: "Failed" },
  };
  const c = colors[scene.status] || colors.pending;

  return (
    <div className="card-flat p-4 animate-fade-in-up" style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}>
      <div className="flex items-center justify-between">
        <span className="text-label">Scene {scene.scene_number}</span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
          <span className="text-[0.75rem] font-medium" style={{ color: c.color }}>{c.label}</span>
        </div>
      </div>
      {sceneTitle && <p className="text-caption mt-1 truncate">{sceneTitle}</p>}
      {scene.status === "failed" && scene.error && <p className="mt-1 text-[0.75rem] truncate" style={{ color: "var(--error)" }}>{scene.error}</p>}
    </div>
  );
}

export default function GenerationProgress({ status }: GenerationProgressProps) {
  const isCompleted = status.stage === "completed";
  const isFailed = status.stage === "failed";

  return (
    <div className="w-full max-w-2xl space-y-8 animate-fade-in-up">
      {/* Stepper */}
      <div className="flex items-start justify-between">
        {PIPELINE_STEPS.map((step, i) => {
          const state = getStepState(i, status.stage);
          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300"
                  style={{
                    background: state === "active" ? "var(--primary)" : state === "completed" ? "var(--primary-light)" : "var(--bg-tertiary)",
                    color: state === "active" ? "white" : state === "completed" ? "var(--primary)" : "var(--text-tertiary)",
                    boxShadow: state === "active" ? "0 2px 8px rgba(124, 58, 237, 0.3)" : "none",
                  }}
                >
                  {state === "completed" ? (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  ) : i + 1}
                </div>
                <span className="text-[0.6875rem] font-medium" style={{ color: state === "active" ? "var(--primary)" : state === "completed" ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                  {step.label}
                </span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="relative mx-1.5 h-[2px] flex-1 self-start" style={{ top: "15px", background: "var(--border)" }}>
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: state === "completed" ? "100%" : "0%", background: "var(--primary)" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      {!isCompleted && !isFailed && (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-tertiary)" }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${status.progress}%`, background: "linear-gradient(90deg, var(--primary), #818cf8)" }} />
          </div>
          <div className="flex justify-between">
            <p className="text-caption">{status.message}</p>
            <span className="text-caption font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{status.progress}%</span>
          </div>
        </div>
      )}

      {/* Scene cards */}
      {status.scenes && status.scenes.length > 0 && !isCompleted && (
        <div className="space-y-3">
          <h3 className="text-label uppercase tracking-wider">Scenes</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {status.scenes.map((scene, i) => <SceneCard key={scene.scene_number} scene={scene} index={i} sceneTitle={status.script?.scenes?.[i]?.title} />)}
          </div>
        </div>
      )}

      {isFailed && status.error && (
        <div className="rounded-lg p-4" style={{ background: "var(--error-light)", border: "1px solid rgba(239, 68, 68, 0.15)" }}>
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--error)" }}>Generation Failed</p>
          <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--error)" }}>{status.error}</p>
        </div>
      )}

      {isCompleted && (
        <div className="space-y-6 animate-fade-in-up text-center">
          <div className="space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ background: "var(--success)" }}>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            </div>
            <h2 className="text-heading-md">Video Ready</h2>
            <p className="text-body">Your video has been generated.</p>
          </div>
          {status.previewUrl && <div className="card overflow-hidden"><video src={status.previewUrl} controls className="w-full" /></div>}
          {(status.downloadUrl || status.previewUrl) && (
            <a href={status.downloadUrl || status.previewUrl} className="btn-primary gap-2">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              Download Video
            </a>
          )}
        </div>
      )}
    </div>
  );
}
