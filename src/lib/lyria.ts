import { mkdir, access, writeFile, readdir } from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import type { LyriaModel as LyriaModelType, MusicGenConfig } from "./types";

export type LyriaModel = "lyria-2" | "lyria-3-clip" | "lyria-3-pro";

export interface MusicConfig {
  durationSeconds: number;
  genre?: string;
  mood?: string;
  tempo?: "slow" | "medium" | "fast";
  instruments?: string;
  withVocals?: boolean;
  model?: LyriaModel;
}

/** Maps user-facing model names to Lyria API model IDs */
const LYRIA_MODEL_MAP: Record<LyriaModel, string> = {
  "lyria-3-clip": "lyria-3-clip-preview",
  "lyria-3-pro": "lyria-3-pro-preview",
  "lyria-2": "models/lyria-realtime-exp",
};

const LYRIA_DIR = "/tmp/lyria";

async function ensureLyriaDir(): Promise<void> {
  try {
    await access(LYRIA_DIR);
  } catch {
    await mkdir(LYRIA_DIR, { recursive: true });
  }
}

function tempoToBpm(tempo?: "slow" | "medium" | "fast"): number {
  switch (tempo) {
    case "slow":
      return 70;
    case "fast":
      return 130;
    case "medium":
    default:
      return 100;
  }
}

function writePcmToWav(
  pcmData: Buffer,
  outputPath: string,
  sampleRate: number,
  channels: number
): Buffer {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;
  const headerSize = 44;

  const wavBuffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(headerSize + dataSize - 8, 4);
  wavBuffer.write("WAVE", 8);

  // fmt sub-chunk
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16); // sub-chunk size
  wavBuffer.writeUInt16LE(1, 20); // PCM format
  wavBuffer.writeUInt16LE(channels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(dataSize, 40);

  // Copy PCM data after header
  pcmData.copy(wavBuffer, headerSize);

  return wavBuffer;
}

/**
 * Build a rich prompt from MusicGenConfig fields for Lyria models.
 */
function buildMusicPrompt(config: MusicGenConfig, basePrompt?: string): string {
  const parts: string[] = [];

  if (basePrompt) parts.push(basePrompt);
  if (config.genre) parts.push(`Genre: ${config.genre}`);
  if (config.mood) parts.push(`Mood: ${config.mood}`);
  if (config.instruments) parts.push(`Instruments: ${config.instruments}`);
  if (config.tempo) parts.push(`Tempo: ${config.tempo}`);
  if (config.withVocals !== undefined) {
    parts.push(config.withVocals ? "Include vocals" : "Instrumental only, no vocals");
  }

  return parts.length > 0 ? parts.join(". ") : "Background music";
}

export async function generateMusic(
  prompt: string,
  config: MusicConfig
): Promise<string> {
  const model = config.model ?? "lyria-2";

  try {
    if (model === "lyria-3-clip") {
      return await generateWithLyria3(prompt, config, "lyria-3-clip-preview");
    }
    if (model === "lyria-3-pro") {
      return await generateWithLyria3(prompt, config, "lyria-3-pro-preview");
    }
    // Default: lyria-2 (real-time streaming)
    return await generateWithLyria(prompt, config);
  } catch (err) {
    console.warn(
      `Lyria generation failed (model=${model}): ${err instanceof Error ? err.message : err}. Trying lyria-3-clip fallback.`
    );

    // Fallback: try lyria-3-clip before resorting to placeholder
    if (model !== "lyria-3-clip") {
      try {
        return await generateWithLyria3(prompt, config, "lyria-3-clip-preview");
      } catch (fallbackErr) {
        console.warn(
          `Lyria fallback (lyria-3-clip) also failed: ${fallbackErr instanceof Error ? fallbackErr.message : fallbackErr}. Using placeholder.`
        );
      }
    }

    return await getPlaceholderMusic(config);
  }
}

/**
 * Generate music using a MusicGenConfig from the 3-path architecture.
 * Routes to the appropriate Lyria model based on config.lyriaModel.
 */
export async function generateMusicWithConfig(
  config: MusicGenConfig,
  durationSeconds: number
): Promise<string> {
  const lyriaModel: LyriaModel = config.lyriaModel ?? "lyria-2";
  const prompt = buildMusicPrompt(config);

  const musicConfig: MusicConfig = {
    durationSeconds,
    genre: config.genre,
    mood: config.mood,
    tempo: config.tempo,
    instruments: config.instruments,
    withVocals: config.withVocals,
    model: lyriaModel,
  };

  try {
    const modelId = LYRIA_MODEL_MAP[lyriaModel];

    if (lyriaModel === "lyria-3-clip") {
      return await generateWithLyria3(prompt, musicConfig, modelId as "lyria-3-clip-preview");
    }
    if (lyriaModel === "lyria-3-pro") {
      return await generateWithLyria3(prompt, musicConfig, modelId as "lyria-3-pro-preview");
    }
    // Default: lyria-2 (real-time streaming)
    return await generateWithLyria(prompt, musicConfig);
  } catch (err) {
    console.warn(
      `Lyria generation failed (model=${lyriaModel}): ${err instanceof Error ? err.message : err}. Falling back to placeholder.`
    );
    return await getPlaceholderMusic(musicConfig);
  }
}

/**
 * Generate music using Lyria 3 models (Clip or Pro) via Gemini generateContent.
 * These models use response_modalities: ["AUDIO"] and return inline audio data.
 */
export async function generateWithLyria3(
  prompt: string,
  config: MusicConfig,
  modelId: "lyria-3-clip-preview" | "lyria-3-pro-preview"
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set — cannot use Lyria 3 API");
  }

  await ensureLyriaDir();

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Build a descriptive prompt incorporating genre/mood/tempo/instruments/vocals
  const parts: string[] = [prompt];
  if (config.genre) parts.push(`Genre: ${config.genre}`);
  if (config.mood) parts.push(`Mood: ${config.mood}`);
  if (config.tempo) parts.push(`Tempo: ${tempoToBpm(config.tempo)} BPM`);
  if (config.instruments) parts.push(`Instruments: ${config.instruments}`);
  if (config.withVocals === false) parts.push("Instrumental only, no vocals");
  parts.push(`Duration: approximately ${config.durationSeconds} seconds`);

  const fullPrompt = parts.join(". ");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

  let response;
  try {
    response = await client.models.generateContent({
      model: modelId,
      contents: fullPrompt,
      config: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  // Extract inline audio data from the response
  const candidate = response.candidates?.[0];
  const audioPart = candidate?.content?.parts?.find(
    (p: any) => p.inlineData?.mimeType?.startsWith("audio/")
  );

  if (!audioPart?.inlineData?.data) {
    throw new Error(`Lyria 3 (${modelId}) returned no audio data`);
  }

  const audioBuffer = Buffer.from(audioPart.inlineData.data, "base64");
  const mimeType = audioPart.inlineData.mimeType ?? "audio/mp3";
  const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("mp3") ? "mp3" : "mp3";
  const outputPath = path.join(LYRIA_DIR, `music-${modelId}-${Date.now()}.${ext}`);
  await writeFile(outputPath, audioBuffer);

  return outputPath;
}

export async function generateWithLyria(
  prompt: string,
  config: MusicConfig
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set — cannot use Lyria API");
  }

  await ensureLyriaDir();

  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    apiVersion: "v1alpha",
  });

  const sampleRate = 48000;
  const channels = 2;
  const bytesPerSample = 2; // 16-bit
  const targetBytes = config.durationSeconds * sampleRate * channels * bytesPerSample;
  const timeoutMs = (config.durationSeconds + 10) * 1000;

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  const audioPromise = new Promise<Buffer>((resolve, reject) => {
    let sessionRef: any = null;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        if (sessionRef) {
          try { sessionRef.close(); } catch { /* ignore */ }
        }
        if (totalBytes > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error("Lyria RealTime timed out with no audio data"));
        }
      }
    }, timeoutMs);

    client.live.music.connect({
      model: "models/lyria-realtime-exp",
      callbacks: {
        onmessage: (message: any) => {
          if (message.serverContent?.audioChunks) {
            for (const chunk of message.serverContent.audioChunks) {
              const buf = Buffer.from(chunk.data, "base64");
              chunks.push(buf);
              totalBytes += buf.length;

              if (totalBytes >= targetBytes && !settled) {
                settled = true;
                clearTimeout(timer);
                if (sessionRef) {
                  try { sessionRef.close(); } catch { /* ignore */ }
                }
                resolve(Buffer.concat(chunks));
              }
            }
          }
        },
        onerror: (error: any) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        },
        onclose: () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            if (totalBytes > 0) {
              resolve(Buffer.concat(chunks));
            } else {
              reject(new Error("Lyria RealTime session closed with no audio data"));
            }
          }
        },
      },
    }).then(async (session: any) => {
      sessionRef = session;

      await session.setWeightedPrompts({
        weightedPrompts: [
          { text: prompt, weight: 1.0 },
        ],
      });

      await session.setMusicGenerationConfig({
        musicGenerationConfig: {
          bpm: tempoToBpm(config.tempo),
          temperature: 1.0,
          audioFormat: "pcm16",
          sampleRateHz: sampleRate,
        },
      });

      await session.play();
    }).catch((err: any) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });

  const pcmData = await audioPromise;

  // Trim to exact target length if we got more data than needed
  const trimmed = pcmData.length > targetBytes
    ? pcmData.subarray(0, targetBytes)
    : pcmData;

  const wavBuffer = writePcmToWav(trimmed, "", sampleRate, channels);
  const outputPath = path.join(LYRIA_DIR, `music-${Date.now()}.wav`);
  await writeFile(outputPath, wavBuffer);

  return outputPath;
}

export async function getPlaceholderMusic(
  config: MusicConfig
): Promise<string> {
  await ensureLyriaDir();

  const sampleRate = 48000;
  const numChannels = 2;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = Math.ceil(config.durationSeconds) * byteRate;
  const headerSize = 44;

  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(headerSize + dataSize - 8, 4);
  buffer.write("WAVE", 8);

  // fmt sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // sub-chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk (all zeros = silence)
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  const outputPath = path.join(LYRIA_DIR, `placeholder-${Date.now()}.wav`);
  await writeFile(outputPath, buffer);

  console.warn(
    "Using silent placeholder audio — configure Lyria API or add royalty-free music to public/music/"
  );

  return outputPath;
}

export async function getMusicFromLibrary(
  musicDir: string,
  mood?: string
): Promise<string | null> {
  try {
    await access(musicDir);
  } catch {
    return null;
  }

  let files: string[];
  try {
    const entries = await readdir(musicDir);
    files = entries.filter(
      (f) =>
        f.toLowerCase().endsWith(".mp3") || f.toLowerCase().endsWith(".wav")
    );
  } catch {
    return null;
  }

  if (files.length === 0) {
    return null;
  }

  if (mood) {
    const moodLower = mood.toLowerCase();
    const matching = files.filter((f) =>
      f.toLowerCase().includes(moodLower)
    );
    if (matching.length > 0) {
      return path.join(musicDir, matching[Math.floor(Math.random() * matching.length)]);
    }
  }

  return path.join(musicDir, files[Math.floor(Math.random() * files.length)]);
}
