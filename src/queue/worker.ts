import { generateScript, generateTemplateContent, analyzeYouTubeVideo } from "@/lib/gemini";
import { generateVideoClip } from "@/lib/veo";
import { generateAllAssets } from "@/lib/nano-banan";
import { generateAllNarrations, generateAllSFX, generateNarration, generateSoundEffect } from "@/lib/elevenlabs";
import { renderVideo, renderTemplateVideo, renderEditorialVideo, renderTextVideo, renderImageSlideshow, renderCaptionedVideo } from "@/lib/render";
import { uploadFile, generateKey } from "@/lib/storage";
import { generateMusic } from "@/lib/lyria";
import { extractGitHubContent } from "@/lib/github";
import { getTemplate } from "@/lib/templates";
import { mkdir, stat, copyFile } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import type {
  JobStatus,
  SceneProgress,
  GeneratedScene,
  GeneratedScript,
  Scene,
  TemplateId,
  SourceType,
  TemplateInput,
  GenerationEngine,
  PathConfig,
  PathAConfig,
  PathBConfig,
  PathCConfig,
  PathJobType,
  SharedAudioOptions,
  EditAction,
  CaptionSegment,
  CaptionStyle,
  LyriaModel as LyriaModelType,
} from "@/lib/types";
import { DEFAULT_STYLE } from "@/lib/types";

// ═══════════════════════════════════════════════════════════════════════════════
// Global Jobs Map (survives Next.js HMR)
// ═══════════════════════════════════════════════════════════════════════════════

declare global {
  // eslint-disable-next-line no-var
  var __jobsMap: Map<string, JobStatus> | undefined;
}

const jobs: Map<string, JobStatus> =
  global.__jobsMap ?? (global.__jobsMap = new Map());

export { jobs };

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const RENDER_DIR = "/tmp/renders";
const MAX_TELEGRAM_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const FILLER_WORD_PATTERN = /\b(um|uh|uhh|umm|err|errm|hmm|hm|like|you know|i mean|sort of|kind of|basically|actually|literally)\b/gi;

// ═══════════════════════════════════════════════════════════════════════════════
// Job Creation & Status
// ═══════════════════════════════════════════════════════════════════════════════

interface TemplateOptions {
  templateId?: TemplateId;
  sourceType?: SourceType;
  sourceUrl?: string;
  assets?: string[];
  enableVeo?: boolean;
  engine?: GenerationEngine;
  // 3-path architecture
  pathType?: PathJobType;
  pathConfig?: PathConfig;
}

export function createJob(
  prompt: string,
  resolution: string,
  sceneCount: number,
  options?: TemplateOptions
): string {
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  const status: JobStatus = {
    jobId,
    stage: "queued",
    progress: 0,
    message: "Job queued",
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(jobId, status);

  // Route to 3-path pipelines
  if (options?.pathType === "path-a" && options.pathConfig?.path === "ai-video") {
    processPathAJob(jobId, options.pathConfig as PathAConfig);
    return jobId;
  }
  if (options?.pathType === "path-b" && options.pathConfig?.path === "remotion-only") {
    processPathBJob(jobId, options.pathConfig as PathBConfig);
    return jobId;
  }
  if (options?.pathType === "path-c" && options.pathConfig?.path === "upload-edit") {
    processPathCJob(jobId, options.pathConfig as PathCConfig);
    return jobId;
  }

  // Legacy routing
  const engine: GenerationEngine = options?.engine ?? "auto";

  if (options?.templateId === "editorial") {
    processEditorialJob(jobId, prompt, resolution);
  } else if (options?.templateId) {
    processTemplateJob(jobId, prompt, resolution, options);
  } else {
    processJob(jobId, prompt, resolution, sceneCount, engine);
  }

  return jobId;
}

export function getJobStatus(jobId: string): JobStatus | undefined {
  return jobs.get(jobId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function updateJob(jobId: string, updates: Partial<JobStatus>): void {
  const job = jobs.get(jobId);
  if (!job) return;

  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
}

/** Throw if the cancel endpoint has already marked this job as failed. */
function checkCancelled(jobId: string): void {
  const job = jobs.get(jobId);
  if (job?.stage === "failed") {
    throw new Error(job.message ?? "Cancelled by user");
  }
}

async function updateJobPersistent(jobId: string, updates: Partial<JobStatus>): Promise<void> {
  // Update in-memory
  updateJob(jobId, updates);

  // Also persist to Redis if available
  try {
    if (!(process.env.ENABLE_BULLMQ === "true" && process.env.REDIS_URL)) {
      return;
    }
    const { setJobStatus } = await import("./bull-queue");
    const job = jobs.get(jobId);
    if (job) await setJobStatus(jobId, job);
  } catch {
    // Redis not available, in-memory only
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unknown error occurred";
}

async function ensureRenderDir(): Promise<void> {
  await mkdir(RENDER_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// File Size Check & Re-encode
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check output file size and re-encode at lower bitrate if > 50MB.
 * Returns the final file path (original or re-encoded).
 */
async function ensureFileSizeLimit(filePath: string, jobId: string): Promise<string> {
  try {
    const stats = await stat(filePath);
    if (stats.size <= MAX_TELEGRAM_FILE_SIZE) {
      return filePath;
    }

    // Calculate target bitrate to fit within 50MB
    // Get duration first
    const durationSec = await getVideoDurationFFprobe(filePath);
    // Target: 48MB to leave some margin (in bits)
    const targetBits = 48 * 1024 * 1024 * 8;
    // Reserve 128kbps for audio
    const audioBitrate = 128_000;
    const videoBitrate = Math.floor(targetBits / durationSec - audioBitrate);

    const reEncodedPath = path.join(RENDER_DIR, `${jobId}-compressed.mp4`);

    await runFFmpeg([
      "-i", filePath,
      "-c:v", "libx264",
      "-b:v", `${videoBitrate}`,
      "-maxrate", `${Math.floor(videoBitrate * 1.5)}`,
      "-bufsize", `${Math.floor(videoBitrate * 3)}`,
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y", reEncodedPath,
    ]);

    return reEncodedPath;
  } catch (err) {
    console.warn(`File size check/re-encode failed: ${errorMessage(err)}. Using original.`);
    return filePath;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FFmpeg Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (d: string) => { stderr += d; });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 500)}`));
    });
    proc.on("error", (err) => reject(new Error(`ffmpeg failed to start: ${err.message}`)));
  });
}

function getVideoDurationFFprobe(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);
    let output = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d: string) => { output += d; });
    proc.on("close", (code) => {
      const duration = parseFloat(output.trim());
      if (code !== 0 || isNaN(duration)) {
        reject(new Error(`ffprobe failed with code ${code}`));
      } else {
        resolve(duration);
      }
    });
    proc.on("error", (err) => reject(new Error(`ffprobe not found: ${err.message}`)));
  });
}

/**
 * Overlay an audio file on top of a video using ffmpeg.
 * audioVolume controls the mix level (0.0 - 1.0) of the overlaid audio.
 * Returns the path to the output file.
 */
async function overlayAudioOnVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  audioVolume: number = 0.8
): Promise<string> {
  await runFFmpeg([
    "-i", videoPath,
    "-i", audioPath,
    "-filter_complex",
    `[1:a]volume=${audioVolume}[overlay];[0:a][overlay]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-y", outputPath,
  ]);
  return outputPath;
}

/**
 * Overlay audio on a video that may not have an audio stream.
 * Uses the audio as-is as the sole audio track if the video has no audio.
 */
async function addAudioToVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  volume: number = 0.8
): Promise<string> {
  // Check if video has an audio stream
  const hasAudio = await videoHasAudioStream(videoPath);

  if (hasAudio) {
    return overlayAudioOnVideo(videoPath, audioPath, outputPath, volume);
  }

  // No existing audio — just add the audio track
  await runFFmpeg([
    "-i", videoPath,
    "-i", audioPath,
    "-filter_complex", `[1:a]volume=${volume}[aout]`,
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-y", outputPath,
  ]);
  return outputPath;
}

function videoHasAudioStream(videoPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=index",
      "-of", "csv=p=0",
      videoPath,
    ]);
    let output = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d: string) => { output += d; });
    proc.on("close", () => resolve(output.trim().length > 0));
    proc.on("error", () => resolve(false));
  });
}

/**
 * Cut segments from a video and concatenate them using ffmpeg.
 * Each segment is { startSec, endSec }.
 */
async function cutAndConcatSegments(
  inputPath: string,
  segments: ReadonlyArray<{ readonly startSec: number; readonly endSec: number }>,
  outputPath: string
): Promise<string> {
  if (segments.length === 0) {
    await copyFile(inputPath, outputPath);
    return outputPath;
  }

  const tmpDir = `/tmp/cut-concat-${Date.now()}`;
  await mkdir(tmpDir, { recursive: true });

  // Extract each segment
  const clipPaths = segments.map((_, i) =>
    path.join(tmpDir, `clip-${i.toString().padStart(4, "0")}.mp4`)
  );

  await Promise.all(
    segments.map((seg, i) =>
      runFFmpeg([
        "-i", inputPath,
        "-ss", seg.startSec.toFixed(3),
        "-to", seg.endSec.toFixed(3),
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        clipPaths[i],
      ])
    )
  );

  // Write concat file
  const concatFile = path.join(tmpDir, "concat.txt");
  const { writeFile } = await import("fs/promises");
  await writeFile(concatFile, clipPaths.map((p) => `file '${p}'`).join("\n"), "utf8");

  // Concatenate
  await runFFmpeg([
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    "-c", "copy",
    "-y", outputPath,
  ]);

  return outputPath;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared Audio Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

interface SharedAudioResult {
  readonly narrationUrl?: string;
  readonly narrationLocalPath?: string;
  readonly musicUrl?: string;
  readonly musicLocalPath?: string;
  readonly sfxUrl?: string;
  readonly sfxLocalPath?: string;
}

/**
 * Process shared audio options (narration, music, SFX) and return URLs + local paths.
 * All three are generated in parallel via Promise.allSettled for resilience.
 */
async function processSharedAudio(
  jobId: string,
  sharedAudio: SharedAudioOptions
): Promise<SharedAudioResult> {
  const result: {
    narrationUrl?: string;
    narrationLocalPath?: string;
    musicUrl?: string;
    musicLocalPath?: string;
    sfxUrl?: string;
    sfxLocalPath?: string;
  } = {};

  const tasks: Array<Promise<void>> = [];

  // Narration
  if (sharedAudio.narration) {
    const narrationConfig = sharedAudio.narration;
    tasks.push(
      (async () => {
        const narrationDir = "/tmp/narration";
        await mkdir(narrationDir, { recursive: true });
        const outputPath = path.join(narrationDir, `shared-narration-${jobId.slice(0, 8)}.mp3`);

        const localPath = await generateNarration(
          narrationConfig.script,
          outputPath,
          {
            voiceId: narrationConfig.voiceId,
            modelId: narrationConfig.model,
          }
        );
        result.narrationLocalPath = localPath;

        const key = generateKey(jobId, "shared-narration.mp3");
        result.narrationUrl = await uploadFile(localPath, key);
        console.log(`[SharedAudio] Narration uploaded: ${result.narrationUrl}`);
      })().catch((err) => {
        console.error(`[SharedAudio] Narration failed: ${errorMessage(err)}`);
      })
    );
  }

  // Music
  if (sharedAudio.music) {
    const musicConfig = sharedAudio.music;
    tasks.push(
      (async () => {
        const prompt = [
          musicConfig.genre ? `Genre: ${musicConfig.genre}` : "",
          musicConfig.mood ? `Mood: ${musicConfig.mood}` : "",
          musicConfig.instruments ? `Instruments: ${musicConfig.instruments}` : "",
          musicConfig.withVocals ? "With vocals" : "Instrumental",
        ].filter(Boolean).join(". ");

        const localPath = await generateMusic(prompt, {
          durationSeconds: 30,
          genre: musicConfig.genre,
          mood: musicConfig.mood,
          tempo: musicConfig.tempo,
          model: (musicConfig.lyriaModel as "lyria-2" | "lyria-3-clip" | "lyria-3-pro") ?? "lyria-2",
        });
        result.musicLocalPath = localPath;

        const ext = path.extname(localPath) || ".wav";
        const key = generateKey(jobId, `shared-music${ext}`);
        result.musicUrl = await uploadFile(localPath, key);
        console.log(`[SharedAudio] Music uploaded: ${result.musicUrl}`);
      })().catch((err) => {
        console.error(`[SharedAudio] Music failed: ${errorMessage(err)}`);
      })
    );
  }

  // Sound Effects
  if (sharedAudio.sfx) {
    const sfxConfig = sharedAudio.sfx;
    tasks.push(
      (async () => {
        const sfxDir = "/tmp/sfx";
        await mkdir(sfxDir, { recursive: true });
        const outputPath = path.join(sfxDir, `shared-sfx-${jobId.slice(0, 8)}.mp3`);

        const localPath = await generateSoundEffect(
          sfxConfig.description,
          sfxConfig.durationSeconds ?? 5,
          outputPath
        );
        result.sfxLocalPath = localPath;

        const key = generateKey(jobId, "shared-sfx.mp3");
        result.sfxUrl = await uploadFile(localPath, key);
        console.log(`[SharedAudio] SFX uploaded: ${result.sfxUrl}`);
      })().catch((err) => {
        console.error(`[SharedAudio] SFX failed: ${errorMessage(err)}`);
      })
    );
  }

  await Promise.allSettled(tasks);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Nano Banana Image Generation Helper
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an image using Nano Banana (Gemini image model).
 * Returns the local file path of the generated image.
 */
async function generateImageWithNanoBanana(prompt: string, filename: string): Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: prompt,
    config: { responseModalities: ["IMAGE"] },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  if (!part?.inlineData?.data) {
    throw new Error("Nano Banana returned no image data");
  }

  const outputDir = "/tmp/nano-banan";
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  const { writeFile } = await import("fs/promises");
  await writeFile(filePath, Buffer.from(part.inlineData.data, "base64"));

  return filePath;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy Pipeline (processJob)
// ═══════════════════════════════════════════════════════════════════════════════

export async function processJob(
  jobId: string,
  prompt: string,
  resolution: string,
  sceneCount: number,
  engine: GenerationEngine = "auto"
): Promise<void> {
  try {
    // Stage 1: Generate script via Gemini (5-15%)
    await updateJobPersistent(jobId, {
      stage: "generating_script",
      progress: 5,
      message: "Generating script with Gemini...",
    });

    const script = await generateScript(prompt, sceneCount);

    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      script,
      progress: 15,
      message: "Script generated, reviewed, and enhanced",
    });

    // Stage 2: Generate video clips + Nano Banan assets in parallel (15-55%)
    const sceneProgresses: SceneProgress[] = script.scenes.map((s) => ({
      scene_number: s.scene_number,
      status: "pending" as const,
    }));

    await updateJobPersistent(jobId, {
      stage: "generating_clips",
      progress: 15,
      message: "Generating video clips and assets...",
      scenes: sceneProgresses,
    });

    const useVeo = engine === "veo3" || engine === "auto";
    const useNanoBanan = engine === "nano-banan" || engine === "auto";

    // Run Veo clip generation and Nano Banan asset generation in parallel
    const clipGenerationPromise = useVeo
      ? Promise.allSettled(
          script.scenes.map(async (scene: Scene) => {
            // Mark scene as generating
            const job = jobs.get(jobId);
            if (job?.scenes) {
              const sp = job.scenes.find(
                (s) => s.scene_number === scene.scene_number
              );
              if (sp) sp.status = "generating";
              await updateJobPersistent(jobId, { scenes: job.scenes });
            }

            const clipPath = await generateVideoClip(scene, {
              resolution: resolution as "720p" | "1080p",
            });

            // Mark scene as done generating
            if (job?.scenes) {
              const sp = job.scenes.find(
                (s) => s.scene_number === scene.scene_number
              );
              if (sp) sp.status = "done";
              await updateJobPersistent(jobId, { scenes: job.scenes });
            }

            return { sceneNumber: scene.scene_number, clipPath };
          })
        )
      : Promise.resolve([] as PromiseSettledResult<{ sceneNumber: number; clipPath: string }>[]);

    // Nano Banan asset generation (non-critical in auto mode — failures are tolerated)
    const nanoBananPromise = useNanoBanan
      ? generateAllAssets(script).catch((err) => {
          console.error(
            `Nano Banan asset generation failed: ${err instanceof Error ? err.message : err}`
          );
          return { titleCard: "", keyframes: new Map<number, string>() };
        })
      : Promise.resolve({ titleCard: "", keyframes: new Map<number, string>() });

    const [clipResults, nanoBananAssets] = await Promise.all([
      clipGenerationPromise,
      nanoBananPromise,
    ]);

    // Calculate how many clips succeeded
    const successfulClips: { sceneNumber: number; clipPath: string }[] = [];
    for (let i = 0; i < clipResults.length; i++) {
      const result = clipResults[i];
      const sceneNum = script.scenes[i].scene_number;

      if (result.status === "fulfilled") {
        successfulClips.push(result.value);
      } else {
        const job = jobs.get(jobId);
        if (job?.scenes) {
          const sp = job.scenes.find((s) => s.scene_number === sceneNum);
          if (sp) {
            sp.status = "failed";
            sp.error =
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason);
          }
          await updateJobPersistent(jobId, { scenes: job.scenes });
        }
      }
    }

    const clipProgress = 15 + (successfulClips.length / script.scenes.length) * 40;
    await updateJobPersistent(jobId, {
      progress: Math.round(clipProgress),
      message: `Generated ${successfulClips.length}/${script.scenes.length} clips`,
    });

    // Generate narration and sound effects in parallel (non-critical)
    let narrationMap = new Map<number, string>();
    let sfxMap = new Map<number, string>();

    await updateJobPersistent(jobId, {
      progress: 53,
      message: "Generating narration and sound effects...",
    });

    const [legacyNarrationResult, legacySfxResult] = await Promise.allSettled([
      generateAllNarrations(script.scenes),
      generateAllSFX(script.scenes),
    ]);

    if (legacyNarrationResult.status === "fulfilled") {
      narrationMap = legacyNarrationResult.value;
      console.log(`Narration generation complete: ${narrationMap.size}/${script.scenes.length} scenes`);
    } else {
      console.error(`Narration generation failed: ${legacyNarrationResult.reason instanceof Error ? legacyNarrationResult.reason.message : legacyNarrationResult.reason}`);
    }

    if (legacySfxResult.status === "fulfilled") {
      sfxMap = legacySfxResult.value;
      console.log(`SFX generation complete: ${sfxMap.size}/${script.scenes.length} scenes`);
    } else {
      console.error(`SFX generation failed: ${legacySfxResult.reason instanceof Error ? legacySfxResult.reason.message : legacySfxResult.reason}`);
    }

    // Stage 3: Upload assets (55-70%)
    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      stage: "uploading_assets",
      progress: 55,
      message: "Uploading assets to storage...",
    });

    const generatedScenes: GeneratedScene[] = [];
    let titleCardUrl = "";
    const keyframeUrls = new Map<number, string>();

    // Upload Nano Banan title card if available
    if (nanoBananAssets.titleCard) {
      try {
        const titleCardExt = path.extname(nanoBananAssets.titleCard) || ".png";
        const titleCardKey = generateKey(jobId, `title-card${titleCardExt}`);
        titleCardUrl = await uploadFile(nanoBananAssets.titleCard, titleCardKey);
        console.log(`Title card uploaded: ${titleCardUrl}`);
      } catch (err) {
        console.error(
          `Title card upload failed: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    // Upload Nano Banan keyframes if available
    for (const [sceneNum, keyframePath] of nanoBananAssets.keyframes) {
      try {
        const keyframeExt = path.extname(keyframePath) || ".png";
        const keyframeKey = generateKey(jobId, `keyframe-${sceneNum}${keyframeExt}`);
        const keyframeUrl = await uploadFile(keyframePath, keyframeKey);
        keyframeUrls.set(sceneNum, keyframeUrl);
      } catch (err) {
        console.error(
          `Keyframe upload for scene ${sceneNum} failed: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    // Upload narration audio files
    const narrationUrls = new Map<number, string>();
    for (const [sceneNum, narrationPath] of narrationMap) {
      try {
        const narrationKey = generateKey(jobId, `narration-${sceneNum}.mp3`);
        const narrationUrl = await uploadFile(narrationPath, narrationKey);
        narrationUrls.set(sceneNum, narrationUrl);
        console.log(`Narration for scene ${sceneNum} uploaded: ${narrationUrl}`);
      } catch (err) {
        console.error(
          `Narration upload for scene ${sceneNum} failed: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    // Upload SFX audio files
    const sfxUrls = new Map<number, string>();
    for (const [sceneNum, sfxPath] of sfxMap) {
      try {
        const sfxKey = generateKey(jobId, `sfx-${sceneNum}.mp3`);
        const sfxUrl = await uploadFile(sfxPath, sfxKey);
        sfxUrls.set(sceneNum, sfxUrl);
        console.log(`SFX for scene ${sceneNum} uploaded: ${sfxUrl}`);
      } catch (err) {
        console.error(
          `SFX upload for scene ${sceneNum} failed: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    for (const scene of script.scenes) {
      const clip = successfulClips.find(
        (c) => c.sceneNumber === scene.scene_number
      );

      if (clip) {
        const job = jobs.get(jobId);
        if (job?.scenes) {
          const sp = job.scenes.find(
            (s) => s.scene_number === scene.scene_number
          );
          if (sp) sp.status = "uploading";
          await updateJobPersistent(jobId, { scenes: job.scenes });
        }

        const clipExt = path.extname(clip.clipPath) || ".mp4";
        const key = generateKey(jobId, `scene-${scene.scene_number}${clipExt}`);
        const videoUrl = await uploadFile(clip.clipPath, key);

        if (job?.scenes) {
          const sp = job.scenes.find(
            (s) => s.scene_number === scene.scene_number
          );
          if (sp) sp.status = "done";
          await updateJobPersistent(jobId, { scenes: job.scenes });
        }

        generatedScenes.push({
          ...scene,
          videoUrl,
          videoLocalPath: clip.clipPath,
          narrationAudioUrl: narrationUrls.get(scene.scene_number),
          soundEffectUrl: sfxUrls.get(scene.scene_number),
        });
      } else {
        // Fall back to a keyframe image if Veo did not produce a clip.
        generatedScenes.push({
          ...scene,
          videoUrl: keyframeUrls.get(scene.scene_number) ?? "",
          narrationAudioUrl: narrationUrls.get(scene.scene_number),
          soundEffectUrl: sfxUrls.get(scene.scene_number),
        });
      }
    }

    // Stage 4: Generate music (70-75%)
    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      progress: 70,
      message: "Assets uploaded, generating background music...",
    });

    const generatedScript: GeneratedScript = {
      title: script.title,
      theme: script.theme,
      target_audience: script.target_audience,
      music_prompt: script.music_prompt,
      total_duration_seconds: script.total_duration_seconds,
      scenes: generatedScenes,
      titleCardUrl,
    };

    try {
      const musicPath = "/Users/charlie/Downloads/product-launch-advertising-commercial-music-301409.mp3";
      const musicKey = generateKey(jobId, "music.mp3");
      const musicUrl = await uploadFile(musicPath, musicKey);
      generatedScript.musicUrl = musicUrl;
      console.log(`Music uploaded: ${musicUrl}`);
    } catch (err) {
      const musicError = err instanceof Error ? err.message : String(err);
      console.error(`Music upload failed: ${musicError}`);
      await updateJobPersistent(jobId, {
        message: `Music generation failed (video will have no background music): ${musicError}`,
      });
    }

    await updateJobPersistent(jobId, {
      progress: 75,
      message: "Music generated",
    });

    // Stage 5: Compose video with Remotion (75-95%)
    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      stage: "composing_video",
      progress: 75,
      message: "Composing final video with Remotion...",
    });

    const renderDir = "/tmp/renders";
    await mkdir(renderDir, { recursive: true });
    const outputPath = `${renderDir}/${jobId}.mp4`;

    let downloadUrl: string;
    const firstSuccessful = generatedScenes.find((s) => s.videoUrl);

    try {
      const renderStart = Date.now();
      console.log(`Starting Remotion render for job ${jobId}...`);

      await renderVideo(generatedScript, DEFAULT_STYLE, outputPath);

      const renderDuration = ((Date.now() - renderStart) / 1000).toFixed(1);
      console.log(`Remotion render completed in ${renderDuration}s for job ${jobId}`);

      await updateJobPersistent(jobId, {
        progress: 95,
        message: "Uploading final video...",
      });

      const downloadKey = generateKey(jobId, "final.mp4");
      downloadUrl = await uploadFile(outputPath, downloadKey);
    } catch (err) {
      console.error(
        `Remotion render failed: ${err instanceof Error ? err.message : err}. Using preview fallback.`
      );
      downloadUrl = firstSuccessful?.videoUrl ?? "";
    }

    // Stage 6: Completed
    await updateJobPersistent(jobId, {
      stage: "completed",
      progress: 100,
      message: "Video generation completed",
      generatedScript,
      previewUrl: firstSuccessful?.videoUrl,
      downloadUrl,
    });
  } catch (error) {
    await updateJobPersistent(jobId, {
      stage: "failed",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template Pipeline (processTemplateJob)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Template-based generation pipeline.
 * Stages: extract content -> generate template content -> generate music -> render -> upload
 */
async function processTemplateJob(
  jobId: string,
  prompt: string,
  resolution: string,
  options: TemplateOptions
): Promise<void> {
  const templateId = options.templateId!;
  const sourceType = options.sourceType || "prompt";
  const sourceUrl = options.sourceUrl;

  try {
    // Stage 1: Extract content from source (0-15%)
    await updateJobPersistent(jobId, {
      stage: "generating_script",
      progress: 5,
      message: "Extracting content from source...",
    });

    let sourceContent = prompt;

    if (sourceType === "youtube" && sourceUrl) {
      console.log(`Analyzing YouTube video with Gemini: ${sourceUrl}`);
      const ytAnalysis = await analyzeYouTubeVideo(sourceUrl);
      sourceContent = `YouTube Video Analysis:\n${ytAnalysis}\n\nUser prompt: ${prompt}`;
    } else if (sourceType === "github" && sourceUrl) {
      const ghMeta = await extractGitHubContent(sourceUrl);
      sourceContent = `Repository: ${ghMeta.name}\nDescription: ${ghMeta.description}\nLanguage: ${ghMeta.language}\nStars: ${ghMeta.stars}\nTopics: ${ghMeta.topics.join(", ")}\nFeatures: ${ghMeta.features.join(", ")}\nREADME:\n${ghMeta.readmeContent.slice(0, 2000)}\n\nUser prompt: ${prompt}`;
    }

    await updateJobPersistent(jobId, {
      progress: 15,
      message: "Content extracted",
    });

    // Stage 2: Generate template content via Gemini (15-40%)
    await updateJobPersistent(jobId, {
      progress: 20,
      message: "Generating template content with Gemini...",
    });

    const templateContent: TemplateInput = await generateTemplateContent(templateId, sourceContent, sourceType);

    // Merge user-provided assets into template content
    const enrichedContent = { ...templateContent } as Record<string, unknown>;
    if (options.assets?.length) {
      // Assign assets to the appropriate image field based on template
      if (templateId === "product-launch") {
        enrichedContent.productImages = options.assets;
      } else if (templateId === "social-promo" && options.assets[0]) {
        enrichedContent.productImage = options.assets[0];
      } else if (templateId === "brand-story") {
        enrichedContent.teamPhotos = options.assets;
      }
    }

    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      progress: 40,
      message: "Template content generated",
    });

    // Stage 3: Generate music, narration, and SFX in parallel (40-60%)
    await updateJobPersistent(jobId, {
      progress: 45,
      message: "Generating audio (music, narration, sound effects)...",
    });

    const template = getTemplate(templateId);
    const moodMap: Record<TemplateId, string> = {
      "product-launch": "energetic, exciting, modern electronic",
      "explainer": "calm, educational, light ambient",
      "social-promo": "bold, upbeat, trendy pop",
      "brand-story": "inspiring, cinematic, emotional orchestral",
      "editorial": "elegant, restrained, quiet ambient",
    };

    // Build scenes for narration + SFX from template content
    const templateScenes: Scene[] = [];
    if (templateId === "product-launch") {
      const pl = enrichedContent as Record<string, unknown>;
      const features = (pl.features as string[]) || [];
      features.forEach((f, i) => {
        templateScenes.push({
          scene_number: i + 1,
          title: String(pl.brandName || ""),
          visual_description: f,
          narration_text: f,
          duration_seconds: 5,
          camera_direction: "static",
          mood: "energetic",
          transition: "cut" as const,
        });
      });
    } else if (templateId === "explainer") {
      const ex = enrichedContent as Record<string, unknown>;
      const steps = (ex.steps as { title: string; description: string }[]) || [];
      const introNarration = (ex.introNarration as string) || `Let's explore ${ex.title}. Here's what you need to know.`;
      const summaryNarration = (ex.summaryNarration as string) || String(ex.conclusion || "And that's a wrap.");

      // Write narration text back so it reaches the Explainer component for captions
      enrichedContent.introNarration = introNarration;
      enrichedContent.summaryNarration = summaryNarration;

      // Scene 0: Intro narration — hook the viewer
      templateScenes.push({
        scene_number: 0,
        title: "Introduction",
        visual_description: String(ex.title || ""),
        narration_text: introNarration,
        duration_seconds: 7,
        camera_direction: "static",
        mood: "welcoming",
        transition: "fade" as const,
      });

      // Scene 1..N: Step narrations — teach each concept
      steps.forEach((step, i) => {
        const stepNarration = `Step ${i + 1}: ${step.title}. ${step.description}`;
        templateScenes.push({
          scene_number: i + 1,
          title: step.title,
          visual_description: step.description,
          narration_text: stepNarration,
          duration_seconds: 10,
          camera_direction: "static",
          mood: "educational",
          transition: "fade" as const,
        });
      });

      // Final scene: Summary narration — wrap up with conclusion
      templateScenes.push({
        scene_number: steps.length + 1,
        title: "Summary",
        visual_description: String(ex.conclusion || ""),
        narration_text: summaryNarration,
        duration_seconds: 8,
        camera_direction: "static",
        mood: "concluding",
        transition: "fade" as const,
      });
    } else if (templateId === "social-promo") {
      const sp = enrichedContent as Record<string, unknown>;
      const features = (sp.features as string[]) || [];
      templateScenes.push({
        scene_number: 1,
        title: "Hook",
        visual_description: String(sp.hook || ""),
        narration_text: String(sp.hook || ""),
        duration_seconds: 3,
        camera_direction: "static",
        mood: "bold",
        transition: "cut" as const,
      });
      features.forEach((f, i) => {
        templateScenes.push({
          scene_number: i + 2,
          title: f,
          visual_description: f,
          narration_text: f,
          duration_seconds: 3,
          camera_direction: "static",
          mood: "upbeat",
          transition: "cut" as const,
        });
      });
    } else if (templateId === "brand-story") {
      const bs = enrichedContent as Record<string, unknown>;
      templateScenes.push({
        scene_number: 1,
        title: String(bs.companyName || ""),
        visual_description: String(bs.mission || ""),
        narration_text: String(bs.mission || ""),
        duration_seconds: 6,
        camera_direction: "slow pan",
        mood: "inspiring",
        transition: "fade" as const,
      });
      const milestones = (bs.milestones as { year: string; event: string }[]) || [];
      milestones.forEach((m, i) => {
        templateScenes.push({
          scene_number: i + 2,
          title: m.year,
          visual_description: m.event,
          narration_text: `In ${m.year}, ${m.event}`,
          duration_seconds: 5,
          camera_direction: "static",
          mood: "cinematic",
          transition: "dissolve" as const,
        });
      });
    }

    // Run music, narration, and SFX generation in parallel
    let musicUrl: string | undefined;
    let narrationUrls = new Map<number, string>();
    let sfxUrls = new Map<number, string>();

    const [musicResult, narrationResult, sfxResult] = await Promise.allSettled([
      // Music: use local MP3 directly
      uploadFile(
        "/Users/charlie/Downloads/product-launch-advertising-commercial-music-301409.mp3",
        generateKey(jobId, "music.mp3")
      ),
      // Narration generation
      templateScenes.length > 0 ? generateAllNarrations(templateScenes) : Promise.resolve(new Map<number, string>()),
      // SFX generation
      templateScenes.length > 0 ? generateAllSFX(templateScenes) : Promise.resolve(new Map<number, string>()),
    ]);

    // Process music result
    if (musicResult.status === "fulfilled") {
      musicUrl = musicResult.value;
      console.log(`Music uploaded: ${musicUrl}`);
    } else {
      console.error(`Music upload failed: ${musicResult.reason instanceof Error ? musicResult.reason.message : musicResult.reason}`);
    }

    // Process narration result
    if (narrationResult.status === "fulfilled") {
      const narrationMap = narrationResult.value;
      for (const [sceneNum, narrationPath] of narrationMap) {
        try {
          const narrationKey = generateKey(jobId, `narration-${sceneNum}.mp3`);
          const url = await uploadFile(narrationPath, narrationKey);
          narrationUrls.set(sceneNum, url);
          console.log(`Narration for scene ${sceneNum} uploaded: ${url}`);
        } catch (err) {
          console.error(`Narration upload for scene ${sceneNum} failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    } else {
      console.error(`Narration generation failed: ${narrationResult.reason instanceof Error ? narrationResult.reason.message : narrationResult.reason}`);
    }

    // Process SFX result
    if (sfxResult.status === "fulfilled") {
      const sfxMap = sfxResult.value;
      for (const [sceneNum, sfxPath] of sfxMap) {
        try {
          const sfxKey = generateKey(jobId, `sfx-${sceneNum}.mp3`);
          const url = await uploadFile(sfxPath, sfxKey);
          sfxUrls.set(sceneNum, url);
          console.log(`SFX for scene ${sceneNum} uploaded: ${url}`);
        } catch (err) {
          console.error(`SFX upload for scene ${sceneNum} failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    } else {
      console.error(`SFX generation failed: ${sfxResult.reason instanceof Error ? sfxResult.reason.message : sfxResult.reason}`);
    }

    await updateJobPersistent(jobId, {
      progress: 60,
      message: `Audio generated — music: ${musicUrl ? "yes" : "no"}, narrations: ${narrationUrls.size}, sfx: ${sfxUrls.size}`,
    });

    // Stage 4: Render via Remotion (60-90%)
    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      stage: "composing_video",
      progress: 65,
      message: "Composing video with Remotion...",
    });

    const renderDir = "/tmp/renders";
    await mkdir(renderDir, { recursive: true });
    const outputPath = `${renderDir}/${jobId}.mp4`;

    const renderProps = {
      ...enrichedContent,
      musicUrl,
      narrationUrls: Object.fromEntries(narrationUrls),
      sfxUrls: Object.fromEntries(sfxUrls),
    } as TemplateInput & { musicUrl?: string; narrationUrls?: Record<number, string>; sfxUrls?: Record<number, string> };

    let downloadUrl: string;
    try {
      const renderStart = Date.now();
      console.log(`Starting Remotion template render for job ${jobId} (${templateId})...`);

      await renderTemplateVideo(templateId, renderProps, outputPath);

      const renderDuration = ((Date.now() - renderStart) / 1000).toFixed(1);
      console.log(`Remotion render completed in ${renderDuration}s for job ${jobId}`);

      await updateJobPersistent(jobId, {
        progress: 90,
        message: "Uploading final video...",
      });

      const downloadKey = generateKey(jobId, "final.mp4");
      downloadUrl = await uploadFile(outputPath, downloadKey);
    } catch (err) {
      console.error(`Remotion render failed: ${err instanceof Error ? err.message : err}`);
      downloadUrl = "";
    }

    // Stage 5: Completed
    await updateJobPersistent(jobId, {
      stage: "completed",
      progress: 100,
      message: "Video generation completed",
      downloadUrl,
    });
  } catch (error) {
    await updateJobPersistent(jobId, {
      stage: "failed",
      message: error instanceof Error ? error.message : "An unknown error occurred",
      error: error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Editorial Pipeline (processEditorialJob)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Editorial video generation pipeline.
 * Uses the editorial engine (source -> brain -> director -> compiler -> Remotion render).
 */
async function processEditorialJob(
  jobId: string,
  prompt: string,
  resolution: string,
): Promise<void> {
  try {
    // Stage 1: Build editorial spec via the engine pipeline (0-40%)
    await updateJobPersistent(jobId, {
      stage: "generating_script",
      progress: 3,
      message: "Analyzing source content...",
    });

    // Detect and fetch remote content (GitHub URLs, YouTube URLs)
    let enrichedPrompt = prompt;
    const { parseGitHubUrl, fetchGitHubMetadata } = await import("@/lib/github");
    const ghParsed = parseGitHubUrl(prompt);
    if (ghParsed) {
      await updateJobPersistent(jobId, {
        progress: 3,
        message: `Cloning ${ghParsed.owner}/${ghParsed.repo}...`,
      });
      try {
        const { execSync } = await import("child_process");
        const { readFileSync, readdirSync, statSync, existsSync } = await import("fs");
        const cloneDir = `/tmp/editorial-repos/${jobId}`;
        const ghToken = process.env.GITHUB_TOKEN;
        const cloneUrl = ghToken
          ? `https://${ghToken}@github.com/${ghParsed.owner}/${ghParsed.repo}.git`
          : `https://github.com/${ghParsed.owner}/${ghParsed.repo}.git`;
        execSync(`rm -rf ${cloneDir} && git clone --depth 1 ${cloneUrl} ${cloneDir}`, {
          timeout: 30_000,
          stdio: "pipe",
        });
        console.log(`[Editorial] Cloned ${ghParsed.owner}/${ghParsed.repo} to ${cloneDir}`);

        await updateJobPersistent(jobId, {
          progress: 5,
          message: "Reading and analyzing repository...",
        });

        // Read key files from the repo
        const readFile = (p: string) => { try { return readFileSync(p, "utf-8"); } catch { return ""; } };
        const readme = readFile(`${cloneDir}/README.md`) || readFile(`${cloneDir}/readme.md`);
        const pkgJson = readFile(`${cloneDir}/package.json`);
        const claudeMd = readFile(`${cloneDir}/CLAUDE.md`);

        // Collect source file tree (max 3 levels, skip node_modules/dist/build)
        const skipDirs = new Set(["node_modules", "dist", "build", "out", ".git", ".next", "__pycache__", "vendor", "target"]);
        const fileTree: string[] = [];
        const keyFiles: { path: string; content: string }[] = [];
        const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".swift", ".kt"]);

        const walk = (dir: string, depth: number) => {
          if (depth > 3) return;
          try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.name.startsWith(".") || skipDirs.has(entry.name)) continue;
              const fullPath = `${dir}/${entry.name}`;
              const relPath = fullPath.replace(`${cloneDir}/`, "");
              if (entry.isDirectory()) {
                fileTree.push(`${relPath}/`);
                walk(fullPath, depth + 1);
              } else {
                fileTree.push(relPath);
                const ext = entry.name.substring(entry.name.lastIndexOf("."));
                // Collect key source files for analysis (first 50 lines each, max 15 files)
                if (codeExtensions.has(ext) && keyFiles.length < 25) {
                  const content = readFile(fullPath);
                  if (content.length > 50) {
                    keyFiles.push({ path: relPath, content: content.split("\n").slice(0, 80).join("\n") });
                  }
                }
              }
            }
          } catch { /* skip unreadable dirs */ }
        };
        walk(cloneDir, 0);

        // Parse package.json for dependencies
        let deps = "";
        if (pkgJson) {
          try {
            const pkg = JSON.parse(pkgJson);
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
            deps = Object.keys(allDeps).slice(0, 20).join(", ");
          } catch { /* ignore */ }
        }

        await updateJobPersistent(jobId, {
          progress: 7,
          message: "Deep analyzing code with Gemini...",
        });

        // Use Gemini to create a deep analysis of the repo
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const analysisPrompt = [
          `You are a senior software architect reviewing this GitHub repository. Your analysis will be turned into a 40-second video presentation. Extract CONCRETE TECHNICAL FACTS, not marketing fluff.`,
          "",
          `## Repository: ${ghParsed.owner}/${ghParsed.repo}`,
          "",
          readme ? `## README\n${readme.slice(0, 6000)}` : "",
          claudeMd ? `## Project Rules (CLAUDE.md)\n${claudeMd.slice(0, 4000)}` : "",
          "",
          `## File Structure (${fileTree.length} files)\n${fileTree.slice(0, 80).join("\n")}`,
          "",
          deps ? `## Dependencies\n${deps}` : "",
          "",
          keyFiles.length > 0 ? `## Key Source Files (read these carefully)\n${keyFiles.map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n")}` : "",
          "",
          `Extract and present these SPECIFIC details:`,
          `1. WHAT IT DOES: One sentence. What problem does it solve? Be specific.`,
          `2. HOW IT WORKS: The actual technical pipeline/flow. e.g. "User prompt → Gemini generates script → Veo makes clips → Remotion composes → MP4"`,
          `3. ARCHITECTURE: What frameworks/libraries/APIs are used and WHY each was chosen`,
          `4. KEY NUMBERS: File count, language breakdown (e.g. "786K TypeScript"), dependencies count, any performance stats`,
          `5. STANDOUT FEATURES: 3-5 specific features with technical detail (not vague "AI-powered")`,
          `6. DATA FLOW: How data moves through the system. Which APIs call which services.`,
          `7. DEPLOYMENT: How it runs (Next.js app router, Telegram bot, etc.)`,
          "",
          `Be SPECIFIC and TECHNICAL. Instead of "uses AI for video", say "Gemini 2.5 Flash writes scene scripts with structured JSON output, then Veo 3 generates 8-second clips per scene at 30fps".`,
          `Include actual file paths, function names, and API endpoints you found in the source code.`,
        ].filter(Boolean).join("\n");

        const analysisResponse = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: analysisPrompt,
        });
        const analysis = analysisResponse.text ?? "";

        // Combine everything into the enriched prompt
        const meta = await fetchGitHubMetadata(ghParsed.owner, ghParsed.repo);
        enrichedPrompt = [
          `# ${meta.name}`,
          meta.description,
          `Language: ${meta.language} | Stars: ${meta.stars} | ${fileTree.length} files | ${fileTree.filter(f => f.endsWith("/")).length} directories`,
          meta.topics.length > 0 ? `Topics: ${meta.topics.join(", ")}` : "",
          "",
          "## Deep Technical Analysis",
          analysis,
          "",
          meta.features.length > 0 ? `## Key Features\n${meta.features.map(f => `- ${f}`).join("\n")}` : "",
          "",
          `## File Structure\n${fileTree.slice(0, 40).join("\n")}`,
          "",
          deps ? `## Dependencies\n${deps}` : "",
          "",
          keyFiles.length > 0 ? `## Source Code Samples\n${keyFiles.slice(0, 8).map(f => `### ${f.path}\n${f.content.split("\n").slice(0, 20).join("\n")}`).join("\n\n")}` : "",
        ].filter(Boolean).join("\n");

        console.log(`[Editorial] Deep analysis complete for ${ghParsed.owner}/${ghParsed.repo}: ${analysis.length} chars, ${fileTree.length} files scanned`);

        // Cleanup clone
        execSync(`rm -rf ${cloneDir}`, { stdio: "pipe" });
      } catch (err) {
        console.warn(`[Editorial] Deep GitHub analysis failed, falling back to API: ${err instanceof Error ? err.message : err}`);
        // Fallback: use basic API metadata
        try {
          const meta = await fetchGitHubMetadata(ghParsed.owner, ghParsed.repo);
          enrichedPrompt = [
            `# ${meta.name}`, meta.description,
            `Language: ${meta.language} | Stars: ${meta.stars}`,
            meta.features.length > 0 ? `## Key Features\n${meta.features.map(f => `- ${f}`).join("\n")}` : "",
            meta.readmeContent.slice(0, 4000),
          ].filter(Boolean).join("\n");
        } catch { /* use raw prompt */ }
      }
    } else if (/youtube\.com|youtu\.be/.test(prompt)) {
      await updateJobPersistent(jobId, {
        progress: 5,
        message: "Analyzing YouTube video...",
      });
      try {
        const ytAnalysis = await analyzeYouTubeVideo(prompt);
        enrichedPrompt = `YouTube Video Analysis:\n\n${ytAnalysis}`;
        console.log(`[Editorial] Fetched YouTube analysis for ${prompt}`);
      } catch (err) {
        console.warn(`[Editorial] YouTube analysis failed, using URL as prompt: ${err instanceof Error ? err.message : err}`);
      }
    } else if (/^https?:\/\//.test(prompt.trim())) {
      // Generic URL — fetch and summarize with Gemini
      await updateJobPersistent(jobId, {
        progress: 5,
        message: "Fetching and analyzing URL content...",
      });
      try {
        const urlRes = await fetch(prompt.trim(), {
          headers: { "User-Agent": "AI-Video-Generator/1.0" },
          signal: AbortSignal.timeout(15_000),
        });
        if (urlRes.ok) {
          const contentType = urlRes.headers.get("content-type") ?? "";
          if (contentType.includes("text") || contentType.includes("json")) {
            const rawText = await urlRes.text();
            // Strip HTML tags for a cleaner summary
            const cleaned = rawText
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 5000);
            enrichedPrompt = `# Content from ${prompt.trim()}\n\n${cleaned}`;
            console.log(`[Editorial] Fetched URL content from ${prompt.trim()} (${cleaned.length} chars)`);
          }
        }
      } catch (err) {
        console.warn(`[Editorial] URL fetch failed, using URL as prompt: ${err instanceof Error ? err.message : err}`);
      }
    }

    await updateJobPersistent(jobId, {
      progress: 8,
      message: "Planning editorial structure...",
    });

    const { buildEditorialEngineResult } = await import("@/editorial/engine");

    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      progress: 20,
      message: "Compiling editorial beat sheet...",
    });

    // Generate dynamic images tailored to the content
    await updateJobPersistent(jobId, {
      progress: 22,
      message: "Generating visuals tailored to content...",
    });

    type EditorialAsset = {
      id: string;
      role: "hero_object" | "detail_crop" | "context_frame" | "closing_object";
      src: string;
      semanticTags: string[];
      treatment?: { radius?: number; saturation?: number; opacity?: number; blur?: number };
      drift?: { fromX?: number; toX?: number; fromY?: number; toY?: number; scaleFrom?: number; scaleTo?: number };
    };

    const dynamicAssets: EditorialAsset[] = [];
    const { resolveEditorialSource } = await import("@/editorial/source");
    const editorialSource = resolveEditorialSource(enrichedPrompt);
    const title = editorialSource.title;
    const abstract = editorialSource.abstract;
    const keywords = editorialSource.keywords.slice(0, 5).join(", ");
    const sections = editorialSource.sections.slice(0, 3).map(s => s.title).join(", ");

    const assetPrompts: { id: string; role: EditorialAsset["role"]; prompt: string; tags: string[] }[] = [
      {
        id: `editorial-hero-${jobId.slice(0, 8)}`,
        role: "hero_object",
        prompt: `Minimalist, editorial-quality hero image representing "${title}". ${abstract}. Clean composition, soft lighting, premium magazine aesthetic. No text or words in the image.`,
        tags: ["intro", "hero", "overview", ...editorialSource.keywords.slice(0, 3)],
      },
      {
        id: `editorial-detail-${jobId.slice(0, 8)}`,
        role: "detail_crop",
        prompt: `Close-up detail shot related to ${keywords || title}. Shallow depth of field, warm tones, editorial magazine quality. Abstract and artistic. No text or words.`,
        tags: ["detail", "close-up", ...editorialSource.keywords.slice(1, 4)],
      },
      {
        id: `editorial-context-${jobId.slice(0, 8)}`,
        role: "context_frame",
        prompt: `Wide contextual scene representing the world of ${title}. ${sections ? `Themes: ${sections}.` : ""} Environmental, architectural feel, cool tones, editorial quality. No text.`,
        tags: ["context", "environment", ...editorialSource.keywords.slice(2, 5)],
      },
      {
        id: `editorial-closing-${jobId.slice(0, 8)}`,
        role: "closing_object",
        prompt: `Quiet, contemplative closing image for "${title}". Soft, faded, minimal. Evokes completion and reflection. Editorial quality, muted tones. No text.`,
        tags: ["closing", "quiet", "fade", ...editorialSource.keywords.slice(0, 2)],
      },
    ];

    try {
      const { mkdir: mkdirAsync, writeFile: writeFileAsync } = await import("fs/promises");
      const imgDir = `/tmp/editorial-assets/${jobId}`;
      await mkdirAsync(imgDir, { recursive: true });

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

      const imageResults = await Promise.allSettled(
        assetPrompts.map(async (ap) => {
          const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-image-preview",
            contents: ap.prompt,
            config: { responseModalities: ["IMAGE"] },
          });
          const part = response.candidates?.[0]?.content?.parts?.[0];
          if (!part?.inlineData?.data) throw new Error("No image data");
          const filePath = `${imgDir}/${ap.id}.png`;
          await writeFileAsync(filePath, Buffer.from(part.inlineData.data, "base64"));
          return { ...ap, filePath };
        })
      );

      for (const ir of imageResults) {
        if (ir.status === "fulfilled") {
          // Upload to storage so Remotion can access via HTTP URL
          let assetUrl = ir.value.filePath;
          try {
            const assetKey = generateKey(jobId, `${ir.value.id}.png`);
            assetUrl = await uploadFile(ir.value.filePath, assetKey);
            console.log(`[Editorial] Uploaded ${ir.value.role} image: ${assetUrl.slice(0, 80)}`);
          } catch (uploadErr) {
            console.warn(`[Editorial] Asset upload failed, using local path: ${uploadErr instanceof Error ? uploadErr.message : uploadErr}`);
          }
          dynamicAssets.push({
            id: ir.value.id,
            role: ir.value.role,
            src: assetUrl,
            semanticTags: ir.value.tags,
            treatment: { radius: 24, saturation: 0.85, opacity: 1 },
            drift: { fromX: 0, toX: 0, fromY: -4, toY: 4, scaleFrom: 1, scaleTo: 1.01 },
          });
        } else {
          console.warn(`[Editorial] Image generation failed for one asset: ${ir.reason}`);
        }
      }
      console.log(`[Editorial] Generated ${dynamicAssets.length}/4 dynamic assets`);
    } catch (imgError) {
      console.warn(`[Editorial] Dynamic image generation failed, using reference assets: ${imgError instanceof Error ? imgError.message : imgError}`);
    }

    await updateJobPersistent(jobId, {
      progress: 35,
      message: `Generated ${dynamicAssets.length} custom visuals, compiling beat sheet...`,
    });

    // Use LLM-powered compiler: Gemini decides all layout, spacing, timing
    const { compileWithLLM } = await import("@/editorial/llm-compiler");
    const llmSpec = await compileWithLLM(enrichedPrompt, dynamicAssets);

    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      progress: 40,
      message: `LLM compiled: ${llmSpec.beats.length} beats, ${llmSpec.meta.durationSec.toFixed(1)}s`,
    });

    // Stage 2: Render with Remotion (40-90%)
    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      stage: "composing_video",
      progress: 45,
      message: "Rendering editorial video with Remotion...",
    });

    const renderDir = "/tmp/renders";
    await mkdir(renderDir, { recursive: true });
    const outputPath = `${renderDir}/${jobId}.mp4`;

    // Scale 4K composition to 1080p output
    const renderSpec = {
      ...llmSpec,
      meta: { ...llmSpec.meta, width: 3840, height: 2160 },
    };

    const renderStart = Date.now();
    console.log(`[Editorial] Starting Remotion render for job ${jobId} (${renderSpec.meta.width}x${renderSpec.meta.height} ${renderSpec.meta.fps}fps)...`);

    await renderEditorialVideo(renderSpec, outputPath);

    const renderDuration = ((Date.now() - renderStart) / 1000).toFixed(1);
    console.log(`[Editorial] Render completed in ${renderDuration}s for job ${jobId}`);

    // Stage 3: Upload (90-100%)
    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      progress: 92,
      message: "Uploading final video...",
    });

    const downloadKey = generateKey(jobId, "final.mp4");
    const downloadUrl = await uploadFile(outputPath, downloadKey);

    await updateJobPersistent(jobId, {
      stage: "completed",
      progress: 100,
      message: "Editorial video completed",
      downloadUrl,
    });
  } catch (error) {
    await updateJobPersistent(jobId, {
      stage: "failed",
      message: error instanceof Error ? error.message : "An unknown error occurred",
      error: error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3-Path Architecture Processors
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Path A: AI Video Generation ─────────────────────────────────────────────

/**
 * Path A: Direct Veo video generation.
 *
 * Pipeline:
 *   1. (Optional) Generate first frame with Nano Banana
 *   2. Call Veo with model, aspectRatio, prompt, style, duration, firstFrame, generateAudio
 *   3. If audioStrategy === "custom" -> run shared audio pipeline
 *   4. If generateThumbnail -> generate thumbnail with Nano Banana
 *   5. File size check + upload -> mark completed
 */
async function processPathAJob(
  jobId: string,
  config: PathAConfig
): Promise<void> {
  try {
    // ── Step 1: First Frame Generation ──────────────────────────────────────
    let firstFrameImageUrl = config.firstFrameImageUrl;

    if (firstFrameImageUrl === "__ai_generate__") {
      await updateJobPersistent(jobId, {
        stage: "generating_clips",
        progress: 5,
        message: "Generating first frame with Nano Banana...",
      });

      try {
        const firstFramePrompt = `Opening shot for video: ${config.prompt}. ${config.style ? `Style: ${config.style}.` : ""} Cinematic, high quality, photorealistic. Perfect as a video's opening frame.`;
        const firstFramePath = await generateImageWithNanoBanana(
          firstFramePrompt,
          `first-frame-${jobId.slice(0, 8)}.png`
        );

        // Upload the first frame so Veo can reference it via URL
        const firstFrameKey = generateKey(jobId, "first-frame.png");
        firstFrameImageUrl = await uploadFile(firstFramePath, firstFrameKey);
        console.log(`[PathA] First frame generated and uploaded: ${firstFrameImageUrl}`);
      } catch (err) {
        console.warn(`[PathA] First frame generation failed, proceeding without: ${errorMessage(err)}`);
        firstFrameImageUrl = undefined;
      }
    }

    // ── Step 2: Veo Video Generation ────────────────────────────────────────
    await updateJobPersistent(jobId, {
      stage: "generating_clips",
      progress: 10,
      message: `Generating video with ${config.model}...`,
    });

    // Map user model names to API model IDs
    const modelMap: Record<string, string> = {
      "veo-3": "veo-3.0-generate-001",
      "veo-3-fast": "veo-3.0-fast-generate-001",
      "veo-3.1": "veo-3.1-generate-preview",
    };
    const modelId = modelMap[config.model] ?? "veo-3.1-generate-preview";

    // Build visual description with optional style as negative prompt hint
    const visualDescription = config.style
      ? `${config.style} style: ${config.prompt}`
      : config.prompt;

    // Determine if Veo should generate native audio
    const generateAudio = config.audioStrategy !== "custom";

    const scene: Scene = {
      scene_number: 1,
      title: "AI Video",
      visual_description: visualDescription,
      narration_text: config.prompt,
      duration_seconds: config.durationSeconds ?? 8,
      camera_direction: "cinematic",
      mood: "dynamic",
      transition: "cut",
    };

    const clipPath = await generateVideoClip(scene, {
      model: modelId,
      aspectRatio: config.aspectRatio === "1:1" ? "16:9" : config.aspectRatio,
      resolution: (config.resolution === "4k" ? "1080p" : config.resolution) ?? "720p",
      durationSeconds: config.durationSeconds,
      firstFrameImageUrl: firstFrameImageUrl && firstFrameImageUrl !== "__ai_generate__"
        ? firstFrameImageUrl
        : undefined,
    });

    checkCancelled(jobId);

    // ── Step 3: Custom Audio Pipeline ───────────────────────────────────────
    let sharedAudioResult: SharedAudioResult = {};

    if (config.audioStrategy === "custom" && config.sharedAudio) {
      await updateJobPersistent(jobId, {
        progress: 45,
        message: "Generating custom audio (narration, music, SFX)...",
      });

      sharedAudioResult = await processSharedAudio(jobId, config.sharedAudio);

      // Overlay audio layers onto the video using ffmpeg
      let currentVideoPath = clipPath;
      const tmpDir = `/tmp/path-a-audio-${jobId.slice(0, 8)}`;
      await mkdir(tmpDir, { recursive: true });

      if (sharedAudioResult.narrationLocalPath) {
        const withNarration = path.join(tmpDir, "with-narration.mp4");
        try {
          currentVideoPath = await addAudioToVideo(
            currentVideoPath,
            sharedAudioResult.narrationLocalPath,
            withNarration,
            0.9
          );
        } catch (err) {
          console.warn(`[PathA] Narration overlay failed: ${errorMessage(err)}`);
        }
      }

      if (sharedAudioResult.musicLocalPath) {
        const withMusic = path.join(tmpDir, "with-music.mp4");
        try {
          currentVideoPath = await addAudioToVideo(
            currentVideoPath,
            sharedAudioResult.musicLocalPath,
            withMusic,
            0.3
          );
        } catch (err) {
          console.warn(`[PathA] Music overlay failed: ${errorMessage(err)}`);
        }
      }

      if (sharedAudioResult.sfxLocalPath) {
        const withSfx = path.join(tmpDir, "with-sfx.mp4");
        try {
          currentVideoPath = await addAudioToVideo(
            currentVideoPath,
            sharedAudioResult.sfxLocalPath,
            withSfx,
            0.7
          );
        } catch (err) {
          console.warn(`[PathA] SFX overlay failed: ${errorMessage(err)}`);
        }
      }

      // Use the audio-mixed video as the final clip
      if (currentVideoPath !== clipPath) {
        // Copy the final mixed file to the expected location
        const finalMixedPath = path.join(tmpDir, "final-mixed.mp4");
        if (currentVideoPath !== finalMixedPath) {
          await copyFile(currentVideoPath, finalMixedPath);
          currentVideoPath = finalMixedPath;
        }
      }
      // Update clipPath reference for the upload step
      // We will use currentVideoPath below
      Object.defineProperty(scene, "_finalVideoPath", { value: currentVideoPath, writable: true });
    }

    // ── Step 3b: Standalone Music Generation (when sharedAudio.music provided without custom pipeline) ──
    if (config.sharedAudio?.music && !sharedAudioResult.musicUrl) {
      try {
        const musicGenConfig = config.sharedAudio.music;
        const musicPrompt = `${musicGenConfig.genre ?? "ambient"} ${musicGenConfig.mood ?? "upbeat"} background music for: ${config.prompt.slice(0, 100)}`;

        const musicPath = await generateMusic(musicPrompt, {
          durationSeconds: config.durationSeconds ?? 8,
          genre: musicGenConfig.genre,
          mood: musicGenConfig.mood ?? "upbeat",
          tempo: musicGenConfig.tempo ?? "medium",
          instruments: musicGenConfig.instruments,
          withVocals: musicGenConfig.withVocals,
          model: musicGenConfig.lyriaModel ?? "lyria-3-clip",
        });

        const musicKey = generateKey(jobId, "music.mp3");
        const musicUrl = await uploadFile(musicPath, musicKey);
        sharedAudioResult = { ...sharedAudioResult, musicUrl: musicUrl, musicLocalPath: musicPath };

        // Overlay music onto the video
        const tmpDir = `/tmp/path-a-audio-${jobId.slice(0, 8)}`;
        await mkdir(tmpDir, { recursive: true });
        const withMusic = path.join(tmpDir, "with-music.mp4");
        const baseVideo = ((scene as unknown as Record<string, string>)._finalVideoPath as string | undefined) ?? clipPath;
        try {
          const mixedPath = await addAudioToVideo(baseVideo, musicPath, withMusic, 0.3);
          Object.defineProperty(scene, "_finalVideoPath", { value: mixedPath, writable: true });
        } catch (overlayErr) {
          console.warn(`[PathA] Music overlay failed: ${errorMessage(overlayErr)}`);
        }

        console.log(`[PathA] Standalone music generated and uploaded: ${musicUrl}`);
      } catch (err) {
        console.warn(`[PathA] Music generation failed (non-blocking): ${errorMessage(err)}`);
      }
    }

    // ── Step 4: Thumbnail Generation ────────────────────────────────────────
    let thumbnailUrl: string | undefined;

    if (config.sharedAudio?.generateThumbnail) {
      await updateJobPersistent(jobId, {
        progress: 65,
        message: "Generating thumbnail...",
      });

      try {
        const thumbPrompt = `Eye-catching YouTube thumbnail for: ${config.prompt}. ${config.style ? `Style: ${config.style}.` : ""} Bold, attention-grabbing, high contrast. No excessive text.`;
        const thumbPath = await generateImageWithNanoBanana(
          thumbPrompt,
          `thumbnail-${jobId.slice(0, 8)}.png`
        );
        const thumbKey = generateKey(jobId, "thumbnail.png");
        thumbnailUrl = await uploadFile(thumbPath, thumbKey);
        console.log(`[PathA] Thumbnail uploaded: ${thumbnailUrl}`);
      } catch (err) {
        console.warn(`[PathA] Thumbnail generation failed: ${errorMessage(err)}`);
      }
    }

    // ── Step 5: File Size Check + Upload ────────────────────────────────────
    await updateJobPersistent(jobId, {
      stage: "uploading_assets",
      progress: 75,
      message: "Checking file size and uploading video...",
    });

    // Determine the final video path (may have audio overlays from custom pipeline or standalone music)
    const finalVideoPath = (scene as unknown as Record<string, string>)._finalVideoPath ?? clipPath;

    // File size check
    const uploadReadyPath = await ensureFileSizeLimit(finalVideoPath, jobId);

    const downloadKey = generateKey(jobId, "final.mp4");
    const downloadUrl = await uploadFile(uploadReadyPath, downloadKey);

    await updateJobPersistent(jobId, {
      stage: "completed",
      progress: 100,
      message: "Video generation completed",
      downloadUrl,
      generatedScript: {
        title: "AI Video",
        theme: "ai-generated",
        target_audience: "general",
        music_prompt: "",
        total_duration_seconds: config.durationSeconds ?? 8,
        scenes: [{
          ...scene,
          videoUrl: downloadUrl,
          videoLocalPath: finalVideoPath,
          narrationAudioUrl: sharedAudioResult.narrationUrl,
          soundEffectUrl: sharedAudioResult.sfxUrl,
        }],
        ...(thumbnailUrl ? { titleCardUrl: thumbnailUrl } : {}),
        ...(sharedAudioResult.musicUrl ? { musicUrl: sharedAudioResult.musicUrl } : {}),
      },
    });
  } catch (error) {
    await updateJobPersistent(jobId, {
      stage: "failed",
      message: errorMessage(error),
      error: errorMessage(error),
    });
  }
}

// ─── Path B: Remotion-Only Video ─────────────────────────────────────────────

/**
 * Path B: Remotion-only video generation.
 *
 * Handles ALL 6 types:
 *   1. text-video       -> TextVideo composition
 *   2. image-slideshow  -> ImageSlideshow composition
 *   3. motion-graphics  -> TextVideo with enhanced animation props
 *   4. data-viz         -> TextVideo with formatted data display
 *   5. explainer        -> Explainer template composition
 *   6. promo            -> SocialPromo template composition
 *
 * Also handles: animation style, transitions, backgrounds, AI image generation,
 * shared audio pipeline, and thumbnail generation.
 */
async function processPathBJob(
  jobId: string,
  config: PathBConfig
): Promise<void> {
  try {
    await updateJobPersistent(jobId, {
      stage: "composing_video",
      progress: 5,
      message: `Preparing ${config.type} video...`,
    });

    // ── Step 1: AI Image Generation (if requested) ──────────────────────────
    let generatedImages: string[] = [];

    if (config.generateAiImages) {
      await updateJobPersistent(jobId, {
        progress: 8,
        message: "Generating AI images for scenes...",
      });

      try {
        // Determine how many images to generate based on type
        const imagePrompts: string[] = [];

        if (config.type === "text-video" || config.type === "motion-graphics") {
          const lines = (config.text ?? "").split("\n").map(l => l.trim()).filter(Boolean);
          for (const line of lines.slice(0, 10)) {
            imagePrompts.push(`Illustration for: ${line}. Clean, modern, visually striking.`);
          }
        } else if (config.type === "data-viz") {
          imagePrompts.push(`Professional data visualization background. Clean, minimal, with subtle grid pattern.`);
        } else if (config.type === "explainer") {
          const steps = (config.steps ?? "").split("\n").filter(Boolean);
          for (const step of steps.slice(0, 8)) {
            imagePrompts.push(`Icon/illustration for explainer step: ${step}. Flat design, modern.`);
          }
        } else if (config.type === "promo") {
          imagePrompts.push(`Product showcase background for: ${config.promoDetails?.headline ?? "promotion"}. Premium, eye-catching.`);
        }

        const imageResults = await Promise.allSettled(
          imagePrompts.map((prompt, i) =>
            generateImageWithNanoBanana(prompt, `pathb-img-${jobId.slice(0, 8)}-${i}.png`)
              .then(async (localPath) => {
                const key = generateKey(jobId, `scene-image-${i}.png`);
                return uploadFile(localPath, key);
              })
          )
        );

        generatedImages = imageResults
          .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
          .map(r => r.value);

        console.log(`[PathB] Generated ${generatedImages.length}/${imagePrompts.length} AI images`);
      } catch (err) {
        console.warn(`[PathB] AI image generation failed: ${errorMessage(err)}`);
      }
    }

    // ── Step 2: Background Image (if AI-generated) ──────────────────────────
    let backgroundImageUrl = config.backgroundImageUrl;

    if (config.backgroundType === "ai-generated" && !backgroundImageUrl) {
      try {
        const bgPrompt = `Abstract background for ${config.type} video. ${config.theme ?? "dark"} theme. Minimal, elegant, no text.`;
        const bgPath = await generateImageWithNanoBanana(bgPrompt, `pathb-bg-${jobId.slice(0, 8)}.png`);
        const bgKey = generateKey(jobId, "background.png");
        backgroundImageUrl = await uploadFile(bgPath, bgKey);
        console.log(`[PathB] Background image generated: ${backgroundImageUrl}`);
      } catch (err) {
        console.warn(`[PathB] Background generation failed: ${errorMessage(err)}`);
      }
    }

    // ── Step 3: Shared Audio Pipeline ───────────────────────────────────────
    let sharedAudioResult: SharedAudioResult = {};
    let musicUrl: string | undefined;

    if (config.sharedAudio) {
      await updateJobPersistent(jobId, {
        progress: 15,
        message: "Generating audio layers...",
      });

      sharedAudioResult = await processSharedAudio(jobId, config.sharedAudio);
      musicUrl = sharedAudioResult.musicUrl;
    }

    // If no shared audio music and user didn't explicitly decline, generate background music
    // When sharedAudio exists but music is undefined, user said "No" to music — respect that
    const userDeclinedMusic = config.sharedAudio && !config.sharedAudio.music;
    if (!musicUrl && !userDeclinedMusic) {
      try {
        const contentHint = config.type === "text-video"
          ? (config.text ?? "").slice(0, 100)
          : config.type === "promo"
            ? (config.promoDetails?.headline ?? "promotional video")
            : `${config.type} video`;

        const musicGenConfig = config.sharedAudio?.music;
        const musicPrompt = musicGenConfig
          ? `${musicGenConfig.genre ?? "ambient"} ${musicGenConfig.mood ?? "upbeat"} background music for: ${contentHint}`
          : `Background music for: ${contentHint}`;

        const musicPath = await generateMusic(musicPrompt, {
          durationSeconds: config.duration ?? 30,
          genre: musicGenConfig?.genre,
          mood: musicGenConfig?.mood ?? "upbeat",
          tempo: musicGenConfig?.tempo ?? "medium",
          instruments: musicGenConfig?.instruments,
          withVocals: musicGenConfig?.withVocals,
          model: musicGenConfig?.lyriaModel ?? "lyria-3-clip",
        });
        const musicExt = path.extname(musicPath) || ".mp3";
        const musicKey = generateKey(jobId, `music${musicExt}`);
        musicUrl = await uploadFile(musicPath, musicKey);
      } catch (err) {
        console.warn(`[PathB] Music generation failed (non-blocking): ${errorMessage(err)}`);
      }
    }

    // ── Step 4: Render with Remotion ────────────────────────────────────────
    await updateJobPersistent(jobId, {
      progress: 30,
      message: `Rendering ${config.type} video with Remotion...`,
    });

    await ensureRenderDir();
    const outputPath = path.join(RENDER_DIR, `${jobId}.mp4`);

    switch (config.type) {
      case "text-video": {
        // Check for repo slides mode
        if (config.text?.startsWith("__REPO_SLIDES__:")) {
          const repoUrl = config.text.replace("__REPO_SLIDES__:", "");

          await updateJobPersistent(jobId, {
            progress: 10,
            message: "Analyzing GitHub repository...",
          });

          const { analyzeRepo } = await import("@/lib/github");
          const ghAnalysis = await analyzeRepo(repoUrl);

          checkCancelled(jobId);
          await updateJobPersistent(jobId, {
            progress: 30,
            message: "Generating slide content with AI...",
          });

          // Map github.ts RepoAnalysis -> repo-slides.ts RepoAnalysis
          const repoSlidesAnalysis = {
            name: ghAnalysis.metadata.name,
            fullName: `${ghAnalysis.metadata.name}`,
            description: ghAnalysis.metadata.description,
            url: repoUrl,
            stars: ghAnalysis.metadata.stars,
            forks: 0,
            openIssues: 0,
            language: ghAnalysis.metadata.language,
            topics: ghAnalysis.metadata.topics,
            readmeContent: ghAnalysis.metadata.readmeContent,
            ownerAvatarUrl: ghAnalysis.metadata.ownerAvatarUrl,
            defaultBranch: "main",
            createdAt: "",
            updatedAt: "",
            license: ghAnalysis.stats.license || undefined,
            languages: ghAnalysis.languages,
            fileTree: ghAnalysis.fileTree.map((entry) => entry.path),
            dependencies: {} as Record<string, string>,
            recentCommits: ghAnalysis.recentCommits.map(
              (c) => `${c.sha.slice(0, 7)} ${c.message} (${c.author})`
            ),
            contributors: ghAnalysis.contributors.map((c) => ({
              login: c.login,
              avatarUrl: c.avatarUrl,
              contributions: c.contributions,
            })),
          };

          // Extract dependencies from package.json if available
          const pkgJson = ghAnalysis.keyFiles["package.json"];
          if (pkgJson) {
            try {
              const pkg = JSON.parse(pkgJson);
              repoSlidesAnalysis.dependencies = {
                ...(pkg.dependencies ?? {}),
                ...(pkg.devDependencies ?? {}),
              };
            } catch {
              // Ignore parse failures
            }
          }

          const { generateRepoSlides } = await import("@/lib/repo-slides");
          const slideshow = await generateRepoSlides(repoSlidesAnalysis);

          checkCancelled(jobId);
          await updateJobPersistent(jobId, {
            progress: 50,
            message: `Rendering ${slideshow.slides.length} slides...`,
          });

          // Convert slides to text lines for TextVideo composition
          const lines = slideshow.slides.map((slide) => {
            if (slide.type === "title") {
              return `${slide.title}${slide.subtitle ? "\n" + slide.subtitle : ""}`;
            }
            if (slide.bullets && slide.bullets.length > 0) {
              return `${slide.title}\n${slide.bullets.join("\n")}`;
            }
            if (slide.stats) {
              const statLines = Object.entries(slide.stats).map(
                ([k, v]) => `${k}: ${v}`
              );
              return `${slide.title}\n${statLines.join("\n")}`;
            }
            return slide.title;
          });

          // Cap total video at 90 seconds max
          const MAX_VIDEO_SECONDS = 90;
          const SECONDS_PER_SLIDE = 5;
          const maxSlides = Math.floor(MAX_VIDEO_SECONDS / SECONDS_PER_SLIDE);
          const cappedLines = lines.slice(0, maxSlides);
          console.log(`[RepoSlides] Slides: ${cappedLines.length}/${lines.length}, Duration: ${cappedLines.length * SECONDS_PER_SLIDE}s (max ${MAX_VIDEO_SECONDS}s)`);

          await renderTextVideo(
            cappedLines.join("\n"),
            { aspectRatio: config.aspectRatio, duration: SECONDS_PER_SLIDE, musicUrl },
            outputPath
          );
          break;
        }

        // Normal text video rendering
        await renderTextVideo(
          config.text ?? "",
          {
            aspectRatio: config.aspectRatio,
            duration: config.duration,
            musicUrl,
          },
          outputPath
        );
        break;
      }

      case "image-slideshow": {
        // Merge uploaded images with AI-generated images
        const allImages = [...(config.images ?? []), ...generatedImages];
        await renderImageSlideshow(
          allImages,
          {
            aspectRatio: config.aspectRatio,
            duration: config.duration,
            musicUrl,
          },
          outputPath
        );
        break;
      }

      case "motion-graphics": {
        // Use TextVideo as base with enhanced animation parameters
        const motionText = config.text ?? "Motion Graphics";
        await renderTextVideo(
          motionText,
          {
            aspectRatio: config.aspectRatio,
            duration: config.duration ?? 5,
            musicUrl,
          },
          outputPath
        );
        break;
      }

      case "data-viz": {
        // Format data for visual display, render as text video with chart description
        const dataContent = config.data ?? "No data provided";
        const chartLabel = config.chartType ? `[${config.chartType} chart]\n` : "";
        const formattedText = `${chartLabel}${dataContent}`;

        await renderTextVideo(
          formattedText,
          {
            aspectRatio: config.aspectRatio,
            duration: config.duration ?? 5,
            musicUrl,
          },
          outputPath
        );
        break;
      }

      case "explainer": {
        // Build explainer input from config steps
        const stepsText = config.steps ?? "";
        const parsedSteps = stepsText
          .split("\n")
          .filter(Boolean)
          .map((line, i) => {
            const parts = line.split(":").map(s => s.trim());
            return {
              title: parts[0] ?? `Step ${i + 1}`,
              description: parts.slice(1).join(":") || line,
            };
          });

        const explainerInput = {
          title: "Explainer",
          steps: parsedSteps,
          conclusion: "That's a wrap!",
          musicUrl,
        };

        try {
          await renderTemplateVideo(
            "explainer",
            explainerInput as unknown as TemplateInput & { musicUrl?: string },
            outputPath
          );
        } catch (err) {
          // Fallback: render as text video if explainer template fails
          console.warn(`[PathB] Explainer template failed, falling back to text: ${errorMessage(err)}`);
          const fallbackText = parsedSteps.map((s, i) => `${i + 1}. ${s.title}\n${s.description}`).join("\n\n");
          await renderTextVideo(
            fallbackText,
            { aspectRatio: config.aspectRatio, duration: config.duration, musicUrl },
            outputPath
          );
        }
        break;
      }

      case "promo": {
        // Build social promo input from config
        const promoInput = {
          hook: config.promoDetails?.headline ?? "Check this out!",
          productImage: generatedImages[0] ?? "",
          features: config.promoDetails?.tagline
            ? [config.promoDetails.tagline]
            : ["Amazing features", "Great value"],
          cta: config.promoDetails?.cta ?? "Learn More",
          aspectRatio: config.aspectRatio,
          musicUrl,
        };

        try {
          await renderTemplateVideo(
            "social-promo",
            promoInput as unknown as TemplateInput & { musicUrl?: string },
            outputPath
          );
        } catch (err) {
          // Fallback: render as text video
          console.warn(`[PathB] Promo template failed, falling back to text: ${errorMessage(err)}`);
          const fallbackText = [
            config.promoDetails?.headline ?? "",
            config.promoDetails?.tagline ?? "",
            config.promoDetails?.cta ?? "",
          ].filter(Boolean).join("\n\n");
          await renderTextVideo(
            fallbackText || "Promotional Video",
            { aspectRatio: config.aspectRatio, duration: config.duration, musicUrl },
            outputPath
          );
        }
        break;
      }

      default: {
        // Exhaustive fallback — should not reach here
        const text = config.text ?? `${config.type} video`;
        await renderTextVideo(
          text,
          { aspectRatio: config.aspectRatio, duration: config.duration, musicUrl },
          outputPath
        );
      }
    }

    checkCancelled(jobId);

    // ── Step 5: Overlay shared audio onto rendered video ────────────────────
    let finalVideoPath = outputPath;

    if (config.sharedAudio) {
      const tmpDir = `/tmp/path-b-audio-${jobId.slice(0, 8)}`;
      await mkdir(tmpDir, { recursive: true });

      if (sharedAudioResult.narrationLocalPath) {
        const withNarration = path.join(tmpDir, "with-narration.mp4");
        try {
          finalVideoPath = await addAudioToVideo(
            finalVideoPath,
            sharedAudioResult.narrationLocalPath,
            withNarration,
            0.9
          );
        } catch (err) {
          console.warn(`[PathB] Narration overlay failed: ${errorMessage(err)}`);
        }
      }

      if (sharedAudioResult.sfxLocalPath) {
        const withSfx = path.join(tmpDir, "with-sfx.mp4");
        try {
          finalVideoPath = await addAudioToVideo(
            finalVideoPath,
            sharedAudioResult.sfxLocalPath,
            withSfx,
            0.7
          );
        } catch (err) {
          console.warn(`[PathB] SFX overlay failed: ${errorMessage(err)}`);
        }
      }
    }

    // ── Step 6: Thumbnail Generation ────────────────────────────────────────
    let thumbnailUrl: string | undefined;

    if (config.sharedAudio?.generateThumbnail) {
      await updateJobPersistent(jobId, {
        progress: 75,
        message: "Generating thumbnail...",
      });

      try {
        const thumbDesc = config.type === "text-video"
          ? (config.text ?? "").slice(0, 100)
          : config.type === "promo"
            ? (config.promoDetails?.headline ?? "promo")
            : config.type;

        const thumbPrompt = `Eye-catching thumbnail for a ${config.type} video about: ${thumbDesc}. Bold, modern, attention-grabbing.`;
        const thumbPath = await generateImageWithNanoBanana(
          thumbPrompt,
          `thumbnail-${jobId.slice(0, 8)}.png`
        );
        const thumbKey = generateKey(jobId, "thumbnail.png");
        thumbnailUrl = await uploadFile(thumbPath, thumbKey);
        console.log(`[PathB] Thumbnail uploaded: ${thumbnailUrl}`);
      } catch (err) {
        console.warn(`[PathB] Thumbnail generation failed: ${errorMessage(err)}`);
      }
    }

    // ── Step 7: File Size Check + Upload ────────────────────────────────────
    await updateJobPersistent(jobId, {
      stage: "uploading_assets",
      progress: 85,
      message: "Checking file size and uploading...",
    });

    const uploadReadyPath = await ensureFileSizeLimit(finalVideoPath, jobId);
    const downloadKey = generateKey(jobId, "final.mp4");
    const downloadUrl = await uploadFile(uploadReadyPath, downloadKey);

    await updateJobPersistent(jobId, {
      stage: "completed",
      progress: 100,
      message: "Video created successfully",
      downloadUrl,
    });
  } catch (error) {
    await updateJobPersistent(jobId, {
      stage: "failed",
      message: errorMessage(error),
      error: errorMessage(error),
    });
  }
}

// ─── Path C: Upload & Edit ───────────────────────────────────────────────────

/**
 * Path C: Upload and edit existing video.
 *
 * Handles ALL edit actions (single or multi-select):
 *   1. add-captions     -> transcribe with Gemini -> render CaptionedVideo
 *   2. remove-silence   -> detect + remove silence with ffmpeg
 *   3. remove-filler    -> transcribe -> regex match filler words -> cut + concat
 *   4. add-music        -> generate music with Lyria -> overlay with ffmpeg
 *   5. add-narration    -> generate narration with ElevenLabs -> overlay with ffmpeg
 *   6. add-sfx          -> generate SFX with ElevenLabs -> overlay with ffmpeg
 *   7. add-overlays     -> render overlay composition with Remotion
 *   8. full-edit        -> run all applicable actions in sequence
 *
 * For multi-select: chain actions sequentially, each operating on the output of the previous.
 */
async function processPathCJob(
  jobId: string,
  config: PathCConfig
): Promise<void> {
  try {
    await ensureRenderDir();

    // Determine the action list: multi-select (config.actions) or single (config.action)
    let actionList: EditAction[];

    if (config.actions && config.actions.length > 0) {
      actionList = config.actions;
    } else if (config.action === "full-edit") {
      // Full edit applies a standard sequence of all relevant actions
      actionList = [
        "remove-silence",
        "remove-filler",
        "add-captions",
        "add-narration",
        "add-music",
        "add-sfx",
        "add-overlays",
      ];
    } else {
      actionList = [config.action];
    }

    // Filter out inapplicable actions (e.g., add-narration without narrationConfig)
    const applicableActions = actionList.filter((action) => {
      switch (action) {
        case "add-narration": return !!config.narrationConfig;
        case "add-music": return !!config.musicConfig;
        case "add-sfx": return !!config.sfxConfig;
        case "add-overlays": return !!config.overlayConfig;
        default: return true;
      }
    });

    if (applicableActions.length === 0) {
      // Nothing to do — just upload the original
      const downloadKey = generateKey(jobId, "final.mp4");
      const downloadUrl = await uploadFile(config.videoLocalPath, downloadKey);
      await updateJobPersistent(jobId, {
        stage: "completed",
        progress: 100,
        message: "No actions to apply — original video delivered",
        downloadUrl,
      });
      return;
    }

    const progressPerAction = 80 / applicableActions.length;
    let currentVideoPath = config.videoLocalPath;
    let currentProgress = 5;

    for (let i = 0; i < applicableActions.length; i++) {
      const action = applicableActions[i];
      const stepOutput = path.join(RENDER_DIR, `${jobId}-step-${i}.mp4`);

      await updateJobPersistent(jobId, {
        stage: i === 0 ? "generating_script" : "composing_video",
        progress: Math.round(currentProgress),
        message: `Processing: ${formatActionName(action)} (${i + 1}/${applicableActions.length})...`,
      });

      checkCancelled(jobId);

      try {
        currentVideoPath = await processEditAction(
          jobId,
          action,
          currentVideoPath,
          stepOutput,
          config
        );
      } catch (err) {
        console.error(`[PathC] Action "${action}" failed: ${errorMessage(err)}. Continuing with previous output.`);
        // Non-fatal: continue with the video from the previous step
      }

      currentProgress += progressPerAction;
    }

    // ── File Size Check + Upload ────────────────────────────────────────────
    checkCancelled(jobId);
    await updateJobPersistent(jobId, {
      stage: "uploading_assets",
      progress: 88,
      message: "Checking file size and uploading processed video...",
    });

    const uploadReadyPath = await ensureFileSizeLimit(currentVideoPath, jobId);
    const downloadKey = generateKey(jobId, "final.mp4");
    const downloadUrl = await uploadFile(uploadReadyPath, downloadKey);

    await updateJobPersistent(jobId, {
      stage: "completed",
      progress: 100,
      message: "Video processed successfully",
      downloadUrl,
    });
  } catch (error) {
    await updateJobPersistent(jobId, {
      stage: "failed",
      message: errorMessage(error),
      error: errorMessage(error),
    });
  }
}

/**
 * Process a single edit action on a video file.
 * Returns the path to the output file.
 */
async function processEditAction(
  jobId: string,
  action: EditAction,
  inputPath: string,
  outputPath: string,
  config: PathCConfig
): Promise<string> {
  switch (action) {
    // ── Add Captions ──────────────────────────────────────────────────────
    case "add-captions": {
      const { transcribeVideo } = await import("@/lib/transcribe");
      const captions = await transcribeVideo(inputPath);

      if (captions.length === 0) {
        console.warn("[PathC] No speech detected for captioning — skipping");
        return inputPath;
      }

      // Remotion's OffthreadVideo requires an HTTP URL
      const sourceKey = generateKey(jobId, `source-captions${path.extname(inputPath) || ".mp4"}`);
      const sourceVideoUrl = await uploadFile(inputPath, sourceKey);

      await renderCaptionedVideo(sourceVideoUrl, captions, outputPath);
      return outputPath;
    }

    // ── Remove Silence ────────────────────────────────────────────────────
    case "remove-silence": {
      const { detectSilence, removeSilence } = await import("@/lib/silence");
      const silenceIntervals = await detectSilence(inputPath);

      if (silenceIntervals.length === 0) {
        console.log("[PathC] No silence detected — skipping");
        return inputPath;
      }

      await removeSilence(inputPath, silenceIntervals, outputPath);
      return outputPath;
    }

    // ── Remove Filler Words ───────────────────────────────────────────────
    case "remove-filler": {
      const { transcribeVideo } = await import("@/lib/transcribe");
      const captions = await transcribeVideo(inputPath);

      if (captions.length === 0) {
        console.log("[PathC] No speech detected for filler removal — skipping");
        return inputPath;
      }

      // Identify filler word segments
      const fillerRanges: Array<{ startSec: number; endSec: number }> = [];

      for (const caption of captions) {
        if (FILLER_WORD_PATTERN.test(caption.text.toLowerCase())) {
          fillerRanges.push({
            startSec: caption.startMs / 1000,
            endSec: caption.endMs / 1000,
          });
        }
        // Reset lastIndex since we use the global flag
        FILLER_WORD_PATTERN.lastIndex = 0;
      }

      if (fillerRanges.length === 0) {
        console.log("[PathC] No filler words detected — skipping");
        return inputPath;
      }

      console.log(`[PathC] Found ${fillerRanges.length} filler word segments to remove`);

      // Compute keep segments (inverse of filler ranges)
      const duration = await getVideoDurationFFprobe(inputPath);
      const keepSegments: Array<{ startSec: number; endSec: number }> = [];

      // Sort filler ranges by start time
      const sortedFillers = [...fillerRanges].sort((a, b) => a.startSec - b.startSec);

      let lastEnd = 0;
      for (const filler of sortedFillers) {
        if (filler.startSec > lastEnd + 0.05) {
          keepSegments.push({ startSec: lastEnd, endSec: filler.startSec });
        }
        lastEnd = Math.max(lastEnd, filler.endSec);
      }
      if (lastEnd < duration) {
        keepSegments.push({ startSec: lastEnd, endSec: duration });
      }

      if (keepSegments.length === 0) {
        console.warn("[PathC] All content is filler words — returning original");
        return inputPath;
      }

      await cutAndConcatSegments(inputPath, keepSegments, outputPath);
      return outputPath;
    }

    // ── Add Music ─────────────────────────────────────────────────────────
    case "add-music": {
      const musicConfig = config.musicConfig;
      if (!musicConfig) return inputPath;

      const prompt = [
        musicConfig.genre ? `Genre: ${musicConfig.genre}` : "",
        musicConfig.mood ? `Mood: ${musicConfig.mood}` : "",
        musicConfig.instruments ? `Instruments: ${musicConfig.instruments}` : "",
      ].filter(Boolean).join(". ") || "Background music";

      const videoDuration = await getVideoDurationFFprobe(inputPath);

      const musicPath = await generateMusic(prompt, {
        durationSeconds: Math.ceil(videoDuration),
        genre: musicConfig.genre,
        mood: musicConfig.mood,
        tempo: musicConfig.tempo,
        model: (musicConfig.lyriaModel as "lyria-2" | "lyria-3-clip" | "lyria-3-pro") ?? "lyria-2",
      });

      await addAudioToVideo(inputPath, musicPath, outputPath, 0.3);
      return outputPath;
    }

    // ── Add Narration ─────────────────────────────────────────────────────
    case "add-narration": {
      const narrationConfig = config.narrationConfig;
      if (!narrationConfig) return inputPath;

      const narrationDir = "/tmp/narration";
      await mkdir(narrationDir, { recursive: true });
      const narrationPath = path.join(narrationDir, `pathc-narration-${jobId.slice(0, 8)}.mp3`);

      await generateNarration(
        narrationConfig.script,
        narrationPath,
        {
          voiceId: narrationConfig.voiceId,
          modelId: narrationConfig.model,
        }
      );

      await addAudioToVideo(inputPath, narrationPath, outputPath, 0.9);
      return outputPath;
    }

    // ── Add SFX ───────────────────────────────────────────────────────────
    case "add-sfx": {
      const sfxConfig = config.sfxConfig;
      if (!sfxConfig) return inputPath;

      const sfxDir = "/tmp/sfx";
      await mkdir(sfxDir, { recursive: true });
      const sfxPath = path.join(sfxDir, `pathc-sfx-${jobId.slice(0, 8)}.mp3`);

      await generateSoundEffect(
        sfxConfig.description,
        sfxConfig.durationSeconds ?? 5,
        sfxPath
      );

      await addAudioToVideo(inputPath, sfxPath, outputPath, 0.7);
      return outputPath;
    }

    // ── Add Overlays ──────────────────────────────────────────────────────
    case "add-overlays": {
      const overlayConfig = config.overlayConfig;
      if (!overlayConfig) return inputPath;

      // Upload source video for Remotion access
      const sourceKey = generateKey(jobId, `source-overlay${path.extname(inputPath) || ".mp4"}`);
      const sourceVideoUrl = await uploadFile(inputPath, sourceKey);

      // Build overlay text content for CaptionedVideo (reuse as overlay renderer)
      // Create synthetic captions from overlay config
      const overlaySegments: CaptionSegment[] = [];
      const videoDuration = await getVideoDurationFFprobe(inputPath);
      const durationMs = videoDuration * 1000;

      if (overlayConfig.titleText) {
        overlaySegments.push({
          text: overlayConfig.titleText,
          startMs: 0,
          endMs: Math.min(5000, durationMs),
        });
      }

      if (overlayConfig.lowerThirdText) {
        overlaySegments.push({
          text: overlayConfig.lowerThirdText,
          startMs: 2000,
          endMs: Math.min(durationMs - 2000, durationMs),
        });
      }

      if (overlayConfig.endCardCta) {
        overlaySegments.push({
          text: overlayConfig.endCardCta,
          startMs: Math.max(0, durationMs - 5000),
          endMs: durationMs,
        });
      }

      if (overlaySegments.length === 0) {
        console.log("[PathC] No overlay content to apply — skipping");
        return inputPath;
      }

      // Render with CaptionedVideo composition (repurposed for overlays)
      await renderCaptionedVideo(sourceVideoUrl, overlaySegments, outputPath);
      return outputPath;
    }

    // ── Full Edit (handled by the caller loop) ────────────────────────────
    case "full-edit": {
      // This case should not be reached since full-edit is expanded in processPathCJob
      return inputPath;
    }

    default: {
      console.warn(`[PathC] Unknown action: ${action} — skipping`);
      return inputPath;
    }
  }
}

/**
 * Format an edit action name for display.
 */
function formatActionName(action: EditAction): string {
  const names: Record<EditAction, string> = {
    "add-captions": "Adding captions",
    "remove-silence": "Removing silence",
    "remove-filler": "Removing filler words",
    "add-music": "Adding background music",
    "add-narration": "Adding narration",
    "add-sfx": "Adding sound effects",
    "add-overlays": "Adding text overlays",
    "full-edit": "Full edit suite",
  };
  return names[action] ?? action;
}
