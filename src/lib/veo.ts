import { GoogleGenAI, VideoGenerationReferenceType } from "@google/genai";
import { mkdir, access, writeFile } from "fs/promises";
import path from "path";
import type { Scene, VeoModel, VeoDuration, VideoStyle } from "./types";

export interface VeoConfig {
  aspectRatio?: "16:9" | "9:16";
  resolution?: "720p" | "1080p";
  model?: string;
  durationSeconds?: 4 | 6 | 8;
  firstFrameImageUrl?: string;
}

/** Extended config for single clip generation (Path A) */
export interface SingleClipConfig {
  readonly model?: VeoModel;
  readonly aspectRatio?: "16:9" | "9:16" | "1:1";
  readonly resolution?: "720p" | "1080p";
  readonly durationSeconds?: VeoDuration;
  readonly firstFrameImage?: string; // base64 image data for first frame
  readonly generateAudio?: boolean; // native Veo audio
  readonly negativePrompt?: string;
  readonly style?: VideoStyle;
}

/** Maps user-facing model names to Veo API model IDs */
const VEO_MODEL_MAP: Record<VeoModel, string> = {
  "veo-3": "veo-3.0-generate-001",
  "veo-3-fast": "veo-3.0-fast-generate-001",
  "veo-3.1": "veo-3.1-generate-preview",
};

/** Maps style presets to prompt prefixes */
const STYLE_PREFIX_MAP: Record<VideoStyle, string> = {
  cinematic: "Cinematic film style:",
  anime: "Anime style animation:",
  realistic: "Photorealistic style:",
  abstract: "Abstract artistic style:",
  social: "Social media optimized, vibrant and engaging style:",
};

const DEFAULT_MODEL = "veo-3.1-fast-generate-preview";
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const CLIP_DIR = "/tmp/veo-clips";

function isStubMode(): boolean {
  return process.env.VEO_STUB_MODE !== "off";
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.VEO_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Veo/Gemini API key");
  }
  return new GoogleGenAI({ apiKey });
}

async function ensureClipDir(): Promise<void> {
  try {
    await access(CLIP_DIR);
  } catch {
    await mkdir(CLIP_DIR, { recursive: true });
  }
}

async function createStubSceneAsset(scene: Scene): Promise<string> {
  await ensureClipDir();

  const filePath = path.join(CLIP_DIR, `scene-${scene.scene_number}.svg`);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="50%" stop-color="#1d4ed8" />
          <stop offset="100%" stop-color="#020617" />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#bg)" />
      <text x="960" y="450" text-anchor="middle" fill="#ffffff" font-size="76" font-family="Arial, sans-serif" font-weight="700">
        ${escapeXml(scene.title)}
      </text>
      <text x="960" y="560" text-anchor="middle" fill="#dbeafe" font-size="36" font-family="Arial, sans-serif">
        ${escapeXml(scene.mood)}
      </text>
    </svg>
  `.trim();

  await writeFile(filePath, svg, "utf8");
  return filePath;
}

async function createStubSingleClipAsset(prompt: string): Promise<string> {
  await ensureClipDir();

  const filePath = path.join(CLIP_DIR, `single-clip-${Date.now()}.svg`);
  const truncatedPrompt = prompt.length > 120 ? `${prompt.slice(0, 117)}...` : prompt;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="50%" stop-color="#7c3aed" />
          <stop offset="100%" stop-color="#020617" />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#bg)" />
      <text x="960" y="420" text-anchor="middle" fill="#ffffff" font-size="64" font-family="Arial, sans-serif" font-weight="700">
        Path A — Single Clip
      </text>
      <foreignObject x="260" y="500" width="1400" height="220">
        <div xmlns="http://www.w3.org/1999/xhtml" style="color:#dbeafe;font-size:32px;font-family:Arial,sans-serif;text-align:center;line-height:1.4;">
          ${escapeXml(truncatedPrompt)}
        </div>
      </foreignObject>
    </svg>
  `.trim();

  await writeFile(filePath, svg, "utf8");
  return filePath;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Resolve model identifier: user-facing VeoModel name or raw model ID */
function resolveModelId(model?: string): string {
  if (!model) return DEFAULT_MODEL;
  const mapped = VEO_MODEL_MAP[model as VeoModel];
  return mapped ?? model;
}

/** Prepend style prefix to prompt if a style is provided */
function applyStyleToPrompt(prompt: string, style?: VideoStyle): string {
  if (!style) return prompt;
  const prefix = STYLE_PREFIX_MAP[style];
  return prefix ? `${prefix} ${prompt}` : prompt;
}

export async function generateVideoClip(
  scene: Scene,
  config?: VeoConfig & {
    readonly generateAudio?: boolean;
    readonly negativePrompt?: string;
    readonly style?: VideoStyle;
    readonly firstFrameImage?: string;
  }
): Promise<string> {
  if (isStubMode()) {
    return createStubSceneAsset(scene);
  }

  await ensureClipDir();

  const model = resolveModelId(config?.model);
  const aspectRatio = config?.aspectRatio ?? "16:9";
  const resolution = config?.resolution ?? "720p";
  const prompt = applyStyleToPrompt(scene.visual_description, config?.style);

  const ai = getAiClient();

  // Build optional reference images for first-frame guidance
  const referenceImages = config?.firstFrameImageUrl
    ? [{ referenceImage: { imageUrl: config.firstFrameImageUrl }, referenceType: VideoGenerationReferenceType.STYLE }]
    : config?.firstFrameImage
      ? [{ referenceImage: { imageUrl: `data:image/png;base64,${config.firstFrameImage}` }, referenceType: VideoGenerationReferenceType.STYLE }]
      : undefined;

  let operation = await ai.models.generateVideos({
    model,
    prompt,
    config: {
      aspectRatio,
      resolution,
      numberOfVideos: 1,
      personGeneration: "allow_all",
      ...(config?.durationSeconds ? { durationSeconds: config.durationSeconds } : {}),
      ...(referenceImages ? { referenceImages } : {}),
      ...(config?.generateAudio !== undefined ? { generateAudio: config.generateAudio } : {}),
      ...(config?.negativePrompt ? { negativePrompt: config.negativePrompt } : {}),
    },
  });

  const startTime = Date.now();

  while (!operation.done) {
    if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
      throw new Error(
        `Veo generation timed out after 10 minutes for scene ${scene.scene_number}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
    throw new Error(
      `Veo returned no videos for scene ${scene.scene_number} — possible safety filter rejection`
    );
  }

  const videoFile = generatedVideos[0].video;
  if (!videoFile) {
    throw new Error(
      `Veo returned empty video reference for scene ${scene.scene_number}`
    );
  }

  const downloadPath = path.join(CLIP_DIR, `scene-${scene.scene_number}.mp4`);

  await ai.files.download({ file: videoFile, downloadPath });

  return downloadPath;
}

/**
 * Generate a single video clip from a prompt — Path A (direct clip generation, no scene dependency).
 */
export async function generateSingleClip(
  prompt: string,
  config?: SingleClipConfig
): Promise<string> {
  if (isStubMode()) {
    return createStubSingleClipAsset(prompt);
  }

  await ensureClipDir();

  const model = config?.model
    ? resolveModelId(config.model)
    : DEFAULT_MODEL;
  const aspectRatio = config?.aspectRatio ?? "16:9";
  const resolution = config?.resolution ?? "720p";
  const styledPrompt = applyStyleToPrompt(prompt, config?.style);

  const ai = getAiClient();

  // Build reference images from base64 first frame data
  const referenceImages = config?.firstFrameImage
    ? [{ referenceImage: { imageUrl: `data:image/png;base64,${config.firstFrameImage}` }, referenceType: VideoGenerationReferenceType.STYLE }]
    : undefined;

  let operation = await ai.models.generateVideos({
    model,
    prompt: styledPrompt,
    config: {
      aspectRatio,
      resolution,
      numberOfVideos: 1,
      personGeneration: "allow_all",
      ...(config?.durationSeconds ? { durationSeconds: config.durationSeconds } : {}),
      ...(referenceImages ? { referenceImages } : {}),
      ...(config?.generateAudio !== undefined ? { generateAudio: config.generateAudio } : {}),
      ...(config?.negativePrompt ? { negativePrompt: config.negativePrompt } : {}),
    },
  });

  const startTime = Date.now();

  while (!operation.done) {
    if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
      throw new Error("Veo single clip generation timed out after 10 minutes");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
    throw new Error("Veo returned no videos for single clip — possible safety filter rejection");
  }

  const videoFile = generatedVideos[0].video;
  if (!videoFile) {
    throw new Error("Veo returned empty video reference for single clip");
  }

  const downloadPath = path.join(CLIP_DIR, `single-clip-${Date.now()}.mp4`);
  await ai.files.download({ file: videoFile, downloadPath });

  return downloadPath;
}

export async function generateAllClips(
  scenes: Scene[],
  config?: VeoConfig
): Promise<Map<number, string>> {
  const results = await Promise.allSettled(
    scenes.map((scene) => generateVideoClip(scene, config))
  );

  const clipMap = new Map<number, string>();

  for (let i = 0; i < scenes.length; i++) {
    const result = results[i];
    const sceneNum = scenes[i].scene_number;

    if (result.status === "fulfilled") {
      clipMap.set(sceneNum, result.value);
      console.log(`Scene ${sceneNum}: clip saved to ${result.value}`);
    } else {
      console.error(`Scene ${sceneNum}: generation failed —`, result.reason);
    }
  }

  console.log(
    `Video generation complete: ${clipMap.size}/${scenes.length} scenes succeeded`
  );

  return clipMap;
}
