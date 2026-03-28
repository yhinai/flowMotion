import { GoogleGenAI } from "@google/genai";
import { readFile } from "fs/promises";
import type { CaptionSegment } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

/**
 * Transcribe video audio using Gemini and return timed caption segments.
 *
 * Gemini accepts video input and can transcribe speech with approximate
 * segment-level timestamps. For the skeleton, this provides good-enough
 * captioning. Upgrade to @remotion/install-whisper-cpp for word-level
 * precision in the future.
 */
export async function transcribeVideo(
  videoPath: string
): Promise<CaptionSegment[]> {
  const videoBuffer = await readFile(videoPath);
  const base64Video = videoBuffer.toString("base64");

  // Determine mime type from extension
  const ext = videoPath.split(".").pop()?.toLowerCase() ?? "mp4";
  const mimeType =
    ext === "webm"
      ? "video/webm"
      : ext === "mov"
        ? "video/quicktime"
        : "video/mp4";

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Video,
            },
          },
          {
            text: `Transcribe the spoken words in this video. Return ONLY a valid JSON array of caption segments. Each segment should capture a natural phrase (3-10 words). Use this exact format:

[
  {"text": "spoken phrase here", "startMs": 0, "endMs": 2500},
  {"text": "next phrase", "startMs": 2500, "endMs": 5000}
]

Rules:
- Timestamps must be in milliseconds
- Segments must not overlap
- Segments must be in chronological order
- If there is no speech, return an empty array: []
- Return ONLY the JSON array, no other text`,
          },
        ],
      },
    ],
    config: {
      temperature: 0.1,
    },
  });

  const text = response.text;
  if (!text) {
    return [];
  }

  // Extract JSON from response (Gemini might wrap it in markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [];
  }

  const parsed: unknown[] = JSON.parse(jsonMatch[0]);

  // Validate and transform
  const captions: CaptionSegment[] = parsed
    .filter(
      (item): item is { text: string; startMs: number; endMs: number } =>
        typeof item === "object" &&
        item !== null &&
        "text" in item &&
        "startMs" in item &&
        "endMs" in item &&
        typeof (item as Record<string, unknown>).text === "string" &&
        typeof (item as Record<string, unknown>).startMs === "number" &&
        typeof (item as Record<string, unknown>).endMs === "number"
    )
    .map((item) => ({
      text: item.text,
      startMs: item.startMs,
      endMs: item.endMs,
    }));

  return captions;
}
