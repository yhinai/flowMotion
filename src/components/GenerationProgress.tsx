"use client";

import type { JobStatus, JobStage, SceneProgress } from "@/lib/types";

interface GenerationProgressProps {
  status: JobStatus;
}

const PIPELINE_STEPS = [
  { key: "queued", label: "Queue" },
  { key: "generating_script", label: "Script" },
  { key: "generating_clips", label: "Clips" },
  { key: "uploading_assets", label: "Assets" },
  { key: "composing_video", label: "Render" },
  { key: "completed", label: "Done" },
] as const;

const STAGE_ORDER: JobStage[] = ["queued", "generating_script", "generating_clips", "uploading_assets", "composing_video", "completed"];

function getStepIndex(stage: JobStage): number {
  if (stage === "failed") return -1;
  return STAGE_ORDER.indexOf(stage);
}

function getStepState(stepIndex: number, currentStage: JobStage): "completed" | "active" | "pending" {
  const currentIndex = getStepIndex(currentStage);
  if (currentStage === "failed") return "pending";
  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SceneCard({ scene, index, sceneTitle }: { scene: SceneProgress; index: number; sceneTitle?: string }) {
  const statusConfig: Record<string, { color: string; label: string; spinner?: boolean }> = {
    done: { color: "var(--success)", label: "Complete" },
    generating: { color: "var(--primary)", label: "Generating...", spinner: true },
    uploading: { color: "var(--secondary)", label: "Uploading..." },
    pending: { color: "var(--outline)", label: "Pending" },
    failed: { color: "var(--error)", label: "Failed" },
  };
  const config = statusConfig[scene.status] || statusConfig.pending;

  return (
    <div
      className="neu-raised-sm p-4 animate-fade-in-up"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: "both", borderRadius: "var(--radius-lg)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--outline)" }}>
          Scene {scene.scene_number}
        </span>
        <div className="flex items-center gap-2">
          {config.spinner ? (
            <span style={{ color: config.color }}><SpinnerIcon /></span>
          ) : (
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: config.color }} />
          )}
          <span className="text-xs font-medium" style={{ color: config.color }}>{config.label}</span>
        </div>
      </div>
      {sceneTitle && (
        <p className="text-xs truncate mt-1" style={{ color: "var(--on-surface-variant)", opacity: 0.7 }}>{sceneTitle}</p>
      )}
      {scene.status === "failed" && scene.error && (
        <p className="mt-2 text-xs truncate" style={{ color: "var(--error)" }}>{scene.error}</p>
      )}
    </div>
  );
}

export default function GenerationProgress({ status }: GenerationProgressProps) {
  const isCompleted = status.stage === "completed";
  const isFailed = status.stage === "failed";

  return (
    <div className="w-full max-w-2xl space-y-8 animate-fade-in-up">
      {/* Pipeline Stepper — neumorphic dots */}
      <div className="flex items-start justify-between">
        {PIPELINE_STEPS.map((step, i) => {
          const state = getStepState(i, status.stage);
          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                    state === "active" ? "" : state === "completed" ? "neu-raised-sm" : "neu-inset-sm"
                  }`}
                  style={{
                    borderRadius: "50%",
                    background: state === "active"
                      ? "linear-gradient(145deg, #7340F0, #5520D0)"
                      : "var(--neu-bg)",
                    color: state === "completed" ? "var(--primary)" : state === "active" ? "white" : "var(--outline)",
                    boxShadow: state === "active"
                      ? "4px 4px 10px var(--neu-shadow-dark), -4px -4px 10px var(--neu-shadow-light), 0 0 16px var(--accent-glow)"
                      : undefined,
                  }}
                >
                  <span className="relative z-10">
                    {state === "completed" ? <CheckIcon /> : i + 1}
                  </span>
                </div>
                <span
                  className="text-[11px] font-medium tracking-wide"
                  style={{
                    color: state === "active" ? "var(--primary)" : state === "completed" ? "var(--on-surface)" : "var(--outline)",
                  }}
                >
                  {step.label}
                </span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="relative mx-1 mt-[-12px] flex-1 self-start top-[18px]">
                  <div className="neu-inset-sm h-[3px] w-full" style={{ borderRadius: "var(--radius-pill)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: state === "completed" ? "100%" : "0%",
                        background: "linear-gradient(90deg, var(--primary-container), var(--primary))",
                        boxShadow: state === "completed" ? "0 0 6px var(--accent-glow)" : "none",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress Bar — neumorphic track */}
      {!isCompleted && !isFailed && (
        <div className="space-y-3">
          <div className="neu-progress-track w-full">
            <div
              className="neu-progress-fill"
              style={{ width: `${status.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--on-surface-variant)" }}>{status.message}</p>
            <span className="text-xs font-medium tracking-wider" style={{ color: "var(--outline)", fontVariantNumeric: "tabular-nums" }}>
              {status.progress}%
            </span>
          </div>
        </div>
      )}

      {/* Scene Cards */}
      {status.scenes && status.scenes.length > 0 && !isCompleted && (
        <div className="space-y-4">
          <h3 className="text-label-md" style={{ letterSpacing: "0.15em" }}>Scenes</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {status.scenes.map((scene, i) => (
              <SceneCard key={scene.scene_number} scene={scene} index={i} sceneTitle={status.script?.scenes?.[i]?.title} />
            ))}
          </div>
        </div>
      )}

      {/* Failed */}
      {isFailed && status.error && (
        <div className="neu-inset p-5" style={{ borderRadius: "var(--radius-xl)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--error)" }}>Generation Failed</p>
          <p className="mt-2 text-sm" style={{ color: "var(--error)", opacity: 0.8 }}>{status.error}</p>
        </div>
      )}

      {/* Completed */}
      {isCompleted && (
        <div className="space-y-6 animate-fade-in-up">
          <div className="text-center space-y-3">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white"
              style={{
                background: "linear-gradient(145deg, #7340F0, #5520D0)",
                animation: "scale-spring 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both",
                boxShadow: "4px 4px 12px var(--neu-shadow-dark), -4px -4px 12px var(--neu-shadow-light), 0 0 20px var(--accent-glow)",
              }}
            >
              <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--on-surface)" }}>Video Ready</h2>
            <p className="text-sm" style={{ color: "var(--on-surface-variant)" }}>Your video has been generated successfully.</p>
          </div>

          {status.previewUrl && (
            <div className="neu-raised overflow-hidden" style={{ borderRadius: "var(--radius-xl)" }}>
              <video src={status.previewUrl} controls className="w-full" />
            </div>
          )}

          {(status.downloadUrl || status.previewUrl) && (
            <div className="flex justify-center">
              <a href={status.downloadUrl || status.previewUrl} className="btn-primary inline-flex items-center gap-2.5 text-sm">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Download Video
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
