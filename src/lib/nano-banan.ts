import { GoogleGenAI } from "@google/genai";
import { mkdir, access, writeFile } from "fs/promises";
import path from "path";
import type { Scene, Script } from "./types";

const MODEL = "gemini-3.1-flash-image-preview";
const OUTPUT_DIR = "/tmp/nano-banan";

function isStubMode(): boolean {
  return process.env.NANO_BANAN_STUB_MODE === "on" || process.env.VEO_STUB_MODE !== "off";
}

function getAiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

async function ensureOutputDir(): Promise<void> {
  try {
    await access(OUTPUT_DIR);
  } catch {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }
}

async function generateAndSaveImage(
  prompt: string,
  filename: string
): Promise<string> {
  await ensureOutputDir();

  if (isStubMode()) {
    const filePath = path.join(OUTPUT_DIR, filename.replace(/\.\w+$/, ".svg"));
    const svg = buildPlaceholderSvg(filename.replace(/\.\w+$/, ""), prompt);
    await writeFile(filePath, svg, "utf8");
    return filePath;
  }

  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { responseModalities: ["IMAGE"] },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  if (!part?.inlineData?.data) {
    throw new Error("Gemini returned no image data");
  }

  const filePath = path.join(OUTPUT_DIR, filename);
  await writeFile(filePath, Buffer.from(part.inlineData.data, "base64"));

  return filePath;
}

function buildPlaceholderSvg(title: string, prompt: string): string {
  const safeTitle = escapeXml(title.replaceAll("-", " "));
  const safePrompt = escapeXml(prompt.slice(0, 180));

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#111827" />
          <stop offset="50%" stop-color="#2563eb" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#bg)" />
      <text x="960" y="430" text-anchor="middle" fill="#ffffff" font-size="80" font-family="Arial, sans-serif" font-weight="700">
        ${safeTitle}
      </text>
      <foreignObject x="260" y="500" width="1400" height="220">
        <div xmlns="http://www.w3.org/1999/xhtml" style="color:#dbeafe;font-size:32px;font-family:Arial,sans-serif;text-align:center;line-height:1.4;">
          ${safePrompt}
        </div>
      </foreignObject>
    </svg>
  `.trim();
}

function buildPlaceholderSvgWithSize(
  title: string,
  prompt: string,
  width: number,
  height: number
): string {
  const safeTitle = escapeXml(title.replaceAll("-", " "));
  const safePrompt = escapeXml(prompt.slice(0, 120));

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#111827" />
          <stop offset="50%" stop-color="#7c3aed" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <text x="${width / 2}" y="${height * 0.4}" text-anchor="middle" fill="#ffffff" font-size="${Math.min(width / 12, 64)}" font-family="Arial, sans-serif" font-weight="700">
        ${safeTitle}
      </text>
      <text x="${width / 2}" y="${height * 0.6}" text-anchor="middle" fill="#dbeafe" font-size="${Math.min(width / 20, 28)}" font-family="Arial, sans-serif">
        ${safePrompt}
      </text>
    </svg>
  `.trim();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Compute pixel dimensions from an aspect ratio string */
function aspectRatioToDimensions(
  aspectRatio: string,
  maxDimension: number
): { width: number; height: number } {
  const parts = aspectRatio.split(":").map(Number);
  const wRatio = parts[0] ?? 16;
  const hRatio = parts[1] ?? 9;

  if (wRatio >= hRatio) {
    const width = maxDimension;
    const height = Math.round((hRatio / wRatio) * maxDimension);
    return { width, height };
  }
  const height = maxDimension;
  const width = Math.round((wRatio / hRatio) * maxDimension);
  return { width, height };
}

export async function generateKeyframe(scene: Scene): Promise<string> {
  const prompt = [
    `Generate a cinematic keyframe image for a video scene.`,
    `Visual description: ${scene.visual_description}`,
    `Camera direction: ${scene.camera_direction}`,
    `Mood: ${scene.mood}`,
    `Style: photorealistic, high quality, cinematic lighting.`,
  ].join("\n");

  const filePath = await generateAndSaveImage(
    prompt,
    `${scene.scene_number}.png`
  );
  console.log(`Keyframe for scene ${scene.scene_number} saved to ${filePath}`);
  return filePath;
}

export async function generateTitleCard(
  title: string,
  theme: string
): Promise<string> {
  const prompt = `A cinematic title card for a video titled '${title}', theme: ${theme}. Professional, clean typography on a cinematic background. The text '${title}' should be clearly visible and legible.`;

  const filePath = await generateAndSaveImage(prompt, "title-card.png");
  console.log(`Title card saved to ${filePath}`);
  return filePath;
}

/**
 * Generate a thumbnail image (320x320 max for Telegram).
 */
export async function generateThumbnail(
  description: string,
  aspectRatio: string
): Promise<string> {
  const { width, height } = aspectRatioToDimensions(aspectRatio, 320);

  const prompt = [
    `Generate a compelling thumbnail image.`,
    `Description: ${description}`,
    `Style: eye-catching, vibrant colors, clear focal point, suitable for video thumbnails.`,
    `Dimensions: ${width}x${height} pixels.`,
  ].join("\n");

  if (isStubMode()) {
    await ensureOutputDir();
    const filePath = path.join(OUTPUT_DIR, `thumbnail-${Date.now()}.svg`);
    const svg = buildPlaceholderSvgWithSize("Thumbnail", description, width, height);
    await writeFile(filePath, svg, "utf8");
    return filePath;
  }

  const filePath = await generateAndSaveImage(prompt, `thumbnail-${Date.now()}.png`);
  console.log(`Thumbnail saved to ${filePath}`);
  return filePath;
}

/**
 * Generate a first frame image for Veo video generation.
 */
export async function generateFirstFrame(
  description: string,
  aspectRatio: string
): Promise<string> {
  const { width, height } = aspectRatioToDimensions(aspectRatio, 1920);

  const prompt = [
    `Generate a high-quality first frame image for an AI video.`,
    `Scene description: ${description}`,
    `Style: photorealistic, cinematic composition, high detail.`,
    `This image will be used as the starting frame for video generation.`,
    `Dimensions: ${width}x${height} pixels.`,
  ].join("\n");

  if (isStubMode()) {
    await ensureOutputDir();
    const filePath = path.join(OUTPUT_DIR, `first-frame-${Date.now()}.svg`);
    const svg = buildPlaceholderSvgWithSize("First Frame", description, width, height);
    await writeFile(filePath, svg, "utf8");
    return filePath;
  }

  const filePath = await generateAndSaveImage(prompt, `first-frame-${Date.now()}.png`);
  console.log(`First frame saved to ${filePath}`);
  return filePath;
}

/**
 * Generate a background image for Remotion compositions.
 */
export async function generateBackgroundImage(
  description: string,
  width: number,
  height: number
): Promise<string> {
  const prompt = [
    `Generate a background image for a video composition.`,
    `Description: ${description}`,
    `Style: suitable as a background — not too busy, good for text overlays, professional.`,
    `Dimensions: ${width}x${height} pixels.`,
  ].join("\n");

  if (isStubMode()) {
    await ensureOutputDir();
    const filePath = path.join(OUTPUT_DIR, `background-${Date.now()}.svg`);
    const svg = buildPlaceholderSvgWithSize("Background", description, width, height);
    await writeFile(filePath, svg, "utf8");
    return filePath;
  }

  const filePath = await generateAndSaveImage(prompt, `background-${Date.now()}.png`);
  console.log(`Background image saved to ${filePath}`);
  return filePath;
}

export async function generateAllAssets(
  script: Script
): Promise<{ titleCard: string; keyframes: Map<number, string> }> {
  const results = await Promise.allSettled([
    generateTitleCard(script.title, script.theme),
    ...script.scenes.map((scene) => generateKeyframe(scene)),
  ]);

  const titleCardResult = results[0];
  let titleCard = "";
  if (titleCardResult.status === "fulfilled") {
    titleCard = titleCardResult.value;
  } else {
    console.error("Title card generation failed:", titleCardResult.reason);
  }

  const keyframes = new Map<number, string>();
  for (let i = 0; i < script.scenes.length; i++) {
    const result = results[i + 1];
    const sceneNum = script.scenes[i].scene_number;

    if (result.status === "fulfilled") {
      keyframes.set(sceneNum, result.value);
    } else {
      console.error(
        `Keyframe for scene ${sceneNum} failed:`,
        result.reason
      );
    }
  }

  console.log(
    `Asset generation complete: title card ${titleCard ? "OK" : "FAILED"}, ${keyframes.size}/${script.scenes.length} keyframes succeeded`
  );

  return { titleCard, keyframes };
}
