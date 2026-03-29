import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { writeFile, mkdir, access } from "fs/promises";
import path from "path";
import type { Scene, NarrationConfig, SfxGenConfig, ElevenVoiceModel } from "./types";

export interface ElevenLabsConfig {
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

/** Voice ID presets for commonly used ElevenLabs voices */
export const VOICE_PRESETS: Record<string, string> = {
  george: "JBFqnCBsd6RMkjVDRZzb",
  rachel: "21m00Tcm4TlvDq8ikWAM",
  domi: "AZnzlk1XvdvUeBnXmlld",
  bella: "EXAVITQu4vr4xnSDxMaL",
  antoni: "ErXwobaYiN019PkySvjV",
};

/** Model ID mapping for ElevenLabs voice models */
export const VOICE_MODEL_MAP: Record<ElevenVoiceModel, string> = {
  eleven_v3: "eleven_v3",
  eleven_multilingual_v2: "eleven_multilingual_v2",
  eleven_flash_v2_5: "eleven_flash_v2_5",
};

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const NARRATION_DIR = "/tmp/narration";
const SFX_DIR = "/tmp/sfx";

let client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Please set it in your environment variables."
    );
  }
  if (!client) {
    client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  }
  return client;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

/** Collect audio stream chunks into a single Uint8Array */
async function collectAudioStream(audio: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = audio.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** Resolve a voice ID from a name preset or pass through a raw ID */
function resolveVoiceId(voiceIdOrName?: string): string {
  if (!voiceIdOrName) return DEFAULT_VOICE_ID;
  const preset = VOICE_PRESETS[voiceIdOrName.toLowerCase()];
  return preset ?? voiceIdOrName;
}

/** Resolve model ID from ElevenVoiceModel enum or pass through raw ID */
function resolveModelId(model?: ElevenVoiceModel | string): string {
  if (!model) return DEFAULT_MODEL_ID;
  const mapped = VOICE_MODEL_MAP[model as ElevenVoiceModel];
  return mapped ?? model;
}

export async function generateNarration(
  text: string,
  outputPath: string,
  config?: ElevenLabsConfig
): Promise<string> {
  const elevenlabs = getClient();

  const voiceId = config?.voiceId ?? DEFAULT_VOICE_ID;
  const modelId = config?.modelId ?? DEFAULT_MODEL_ID;
  const stability = config?.stability ?? 0.6;
  const similarityBoost = config?.similarityBoost ?? 0.75;

  const audio = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    modelId,
    voiceSettings: {
      stability,
      similarityBoost,
    },
  });

  const result = await collectAudioStream(audio);
  await writeFile(outputPath, result);

  return outputPath;
}

/**
 * Generate narration using a NarrationConfig from the 3-path architecture.
 * Supports voiceId (name or raw ID), model selection, and speed control.
 */
export async function generateNarrationWithConfig(
  config: NarrationConfig
): Promise<string> {
  await ensureDir(NARRATION_DIR);

  const elevenlabs = getClient();

  const voiceId = resolveVoiceId(config.voiceId);
  const modelId = resolveModelId(config.model);
  const speed = config.speed ?? 1.0;

  // Clamp speed to valid range
  const clampedSpeed = Math.max(0.7, Math.min(1.2, speed));

  const outputPath = path.join(NARRATION_DIR, `narration-${Date.now()}.mp3`);

  const audio = await elevenlabs.textToSpeech.convert(voiceId, {
    text: config.script,
    modelId,
    voiceSettings: {
      stability: 0.6,
      similarityBoost: 0.75,
      speed: clampedSpeed,
    },
  });

  const result = await collectAudioStream(audio);
  await writeFile(outputPath, result);

  return outputPath;
}

/**
 * Generate a sound effect using a SfxGenConfig from the 3-path architecture.
 * Supports description, duration, and looping configuration.
 */
export async function generateSfxWithConfig(
  config: SfxGenConfig
): Promise<string> {
  await ensureDir(SFX_DIR);

  const elevenlabs = getClient();

  const durationSeconds = config.durationSeconds ?? 5;
  const outputPath = path.join(SFX_DIR, `sfx-${Date.now()}.mp3`);

  // Build the prompt, appending looping instruction if needed
  let prompt = config.description;
  if (config.looping) {
    prompt = `${prompt}. Seamlessly loopable sound effect.`;
  }

  const audio = await elevenlabs.textToSoundEffects.convert({
    text: prompt,
    durationSeconds,
    ...(config.promptInfluence !== undefined ? { promptInfluence: config.promptInfluence } : {}),
  });

  const result = await collectAudioStream(audio);
  await writeFile(outputPath, result);

  return outputPath;
}

export async function generateSceneNarration(
  scene: Scene,
  config?: ElevenLabsConfig
): Promise<string> {
  await ensureDir(NARRATION_DIR);

  const outputPath = path.join(
    NARRATION_DIR,
    `scene-${scene.scene_number}.mp3`
  );

  return generateNarration(scene.narration_text, outputPath, config);
}

export async function generateAllNarrations(
  scenes: Scene[],
  config?: ElevenLabsConfig
): Promise<Map<number, string>> {
  const results = await Promise.allSettled(
    scenes.map((scene) => generateSceneNarration(scene, config))
  );

  const narrationMap = new Map<number, string>();

  for (let i = 0; i < scenes.length; i++) {
    const result = results[i];
    const sceneNum = scenes[i].scene_number;

    if (result.status === "fulfilled") {
      narrationMap.set(sceneNum, result.value);
      console.log(`Scene ${sceneNum}: narration saved to ${result.value}`);
    } else {
      console.error(
        `Scene ${sceneNum}: narration generation failed —`,
        result.reason
      );
    }
  }

  console.log(
    `Narration generation complete: ${narrationMap.size}/${scenes.length} scenes succeeded`
  );

  return narrationMap;
}

// --- Sound Effects ---

export function buildSFXPrompt(scene: Scene): string {
  const visual = scene.visual_description;
  const mood = scene.mood;
  return `Ambient sounds for: ${visual}. Mood: ${mood}`;
}

export async function generateSoundEffect(
  prompt: string,
  durationSeconds: number,
  outputPath: string
): Promise<string> {
  const elevenlabs = getClient();

  const audio = await elevenlabs.textToSoundEffects.convert({
    text: prompt,
    durationSeconds,
  });

  const result = await collectAudioStream(audio);
  await writeFile(outputPath, result);

  return outputPath;
}

export async function generateSceneSFX(
  scene: Scene,
  durationSeconds?: number
): Promise<string> {
  await ensureDir(SFX_DIR);

  const outputPath = path.join(SFX_DIR, `scene-${scene.scene_number}.mp3`);
  const prompt = buildSFXPrompt(scene);
  const duration = durationSeconds ?? scene.duration_seconds;

  return generateSoundEffect(prompt, duration, outputPath);
}

export async function generateAllSFX(
  scenes: Scene[]
): Promise<Map<number, string>> {
  const results = await Promise.allSettled(
    scenes.map((scene) => generateSceneSFX(scene))
  );

  const sfxMap = new Map<number, string>();

  for (let i = 0; i < scenes.length; i++) {
    const result = results[i];
    const sceneNum = scenes[i].scene_number;

    if (result.status === "fulfilled") {
      sfxMap.set(sceneNum, result.value);
      console.log(`Scene ${sceneNum}: SFX saved to ${result.value}`);
    } else {
      console.error(
        `Scene ${sceneNum}: SFX generation failed —`,
        result.reason
      );
    }
  }

  console.log(
    `SFX generation complete: ${sfxMap.size}/${scenes.length} scenes succeeded`
  );

  return sfxMap;
}
