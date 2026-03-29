/**
 * LLM-Powered Editorial Compiler
 *
 * Replaces the rule-based brain + director + compiler pipeline with a single
 * Gemini call that generates the complete EditorialVideoSpec from scratch.
 *
 * The LLM decides: beat structure, text content, layout positions, font sizes,
 * animation timing, image placement — everything. No hardcoded layouts.
 */

import { GoogleGenAI } from "@google/genai";
import type {
  EditorialAsset,
  EditorialVideoSpec,
  EditorialBeat,
  TextTrackBeat,
  LineSequenceBeat,
  BlankHoldBeat,
  EndFadeBeat,
  ImageCardBeat,
  SoftPanStillBeat,
  SplitWordObjectBeat,
  TextScatterBeat,
} from "./types";
import { referenceTokens, quietMotionPreset } from "./tokens";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const CANVAS_W = 3840;
const CANVAS_H = 2160;
const FPS = 30;

const SYSTEM_PROMPT = `You are a world-class motion graphics director creating editorial typography videos in the Addx Studio / Oblist style.

CANVAS: ${CANVAS_W}x${CANVAS_H} pixels at ${FPS}fps.
SAFE ZONE: x=280..3560, y=200..1960 (280px horizontal margin, 200px vertical margin).
BACKGROUND: warm beige #f4ede4
INK: near-black #15120f
ACCENT: orange #E84D0E (for stats, numbers, emphasis)
MUTED: gray rgba(21,18,15,0.45) (for labels, kickers)
FONT: Manrope, bold 700 for headings, medium 500 for body, 400 for labels

DESIGN RULES (CRITICAL — follow exactly):
1. ONE idea per beat. Never show more than 2 text elements at once.
2. Text and images MUST NOT overlap. If a beat has an image, text goes on the opposite side.
3. Font sizes: headlines 90-130px, body 50-70px, labels/kickers 26-36px uppercase letter-spacing 0.12em.
4. Images are placed in a rounded rectangle (radius 32px). Max size 1600x1200. Always leave 200px+ gap to any text.
5. Pill badges: rounded-full background #15120f, white text, padding 20px 40px, font 32-40px bold.
6. Stat layouts: small gray label on top (uppercase, 28px), large orange number below (80-120px bold), optional description underneath (44px, muted).
7. Hard cuts between beats — no crossfade. Each beat is a clean new frame.
8. Breathing beats (blank-hold): pure background, no content. Use for pacing.
9. Total video: 30-45 seconds. 6-10 beats.
10. First beat: blank-hold (2s breathing room). Last beat: end-fade (2s).
11. Staccato pacing: short beats (1-3s) for impact words, longer beats (3-5s) for image+text reveals.

BEAT TYPES you can use:
- "blank-hold": Empty frame, just background. For pacing/breathing.
- "end-fade": Final beat, optional closing text centered.
- "text-track": Text-only beat. Array of positioned text segments with x, y, fontSize, fontWeight, color.
- "image-card": Image + optional kicker (small label) + caption. Image in frameBox {x,y,width,height}. Text positioned OUTSIDE the frameBox.
- "soft-pan-still": Same as image-card but with slow drift animation.

For TEXT-TRACK beats, each segment needs:
{
  "id": "unique-id",
  "text": "the text content",
  "x": pixel x position,
  "y": pixel y position,
  "fontSize": number (26-130),
  "fontWeight": 400|500|600|700,
  "color": "#15120f" or "#E84D0E" or "rgba(21,18,15,0.45)",
  "letterSpacing": number (0 for normal, 0.12 for uppercase labels)
}

For IMAGE-CARD / SOFT-PAN-STILL beats:
{
  "frameBox": {"x": number, "y": number, "width": number, "height": number},
  "assetId": "id of the image asset",
  "kickerText": "SMALL LABEL" or null,
  "kickerX": number, "kickerY": number,
  "captionText": "Main caption text",
  "captionX": number, "captionY": number,
  "captionFontSize": 50-80,
  "captionTier": "editorial"
}

OVERLAP PREVENTION:
- If image frameBox is at x=2000..3500 (right side), ALL text must be at x=280..1800 (left side).
- If image frameBox is at x=280..1800 (left side), ALL text must be at x=2000..3560 (right side).
- Text y-positions must not be within the image's y..y+height range unless on the opposite x-side.
- Leave at least 200px gap between any text edge and any image edge.

OUTPUT FORMAT: Return a JSON object with this exact structure:
{
  "beats": [
    {
      "kind": "blank-hold"|"end-fade"|"text-track"|"image-card"|"soft-pan-still",
      "durationSeconds": number,
      "segments": [...] (for text-track only),
      "frameBox": {...} (for image beats),
      "assetId": "..." (for image beats),
      "kickerText": "..." (for image beats, optional),
      "kickerX": number, "kickerY": number,
      "captionText": "..." (for image beats),
      "captionX": number, "captionY": number,
      "captionFontSize": number,
      "closingText": "..." (for end-fade only, optional)
    }
  ],
  "totalDurationSeconds": number
}`;

interface LLMBeat {
  readonly kind: "blank-hold" | "end-fade" | "text-track" | "image-card" | "soft-pan-still";
  readonly durationSeconds: number;
  readonly segments?: ReadonlyArray<{
    readonly id: string;
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly fontSize: number;
    readonly fontWeight: number;
    readonly color: string;
    readonly letterSpacing?: number;
  }>;
  readonly frameBox?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly assetId?: string;
  readonly kickerText?: string;
  readonly kickerX?: number;
  readonly kickerY?: number;
  readonly captionText?: string;
  readonly captionX?: number;
  readonly captionY?: number;
  readonly captionFontSize?: number;
  readonly closingText?: string;
}

interface LLMOutput {
  readonly beats: readonly LLMBeat[];
  readonly totalDurationSeconds: number;
}

function llmBeatToEditorial(beat: LLMBeat, startFrame: number, assets: EditorialAsset[]): EditorialBeat {
  const durationInFrames = Math.max(FPS, Math.round(beat.durationSeconds * FPS));
  const baseProps = {
    startFrame,
    durationInFrames,
    motion: quietMotionPreset,
  };

  switch (beat.kind) {
    case "blank-hold":
      return { ...baseProps, id: `beat-blank-${startFrame}`, kind: "blank-hold" } satisfies BlankHoldBeat;

    case "end-fade":
      return {
        ...baseProps,
        id: `beat-end-${startFrame}`,
        kind: "end-fade",
        ...(beat.closingText ? {
          closingPhrase: {
            id: `closing-text-${startFrame}`,
            text: beat.closingText,
            x: CANVAS_W / 2,
            y: CANVAS_H / 2,
            tier: "editorial" as const,
            align: "center" as const,
          },
        } : {}),
      } satisfies EndFadeBeat;

    case "text-track":
      return {
        ...baseProps,
        id: `beat-text-${startFrame}`,
        kind: "text-track",
        segments: (beat.segments ?? []).map((seg, i) => ({
          id: seg.id || `seg-${startFrame}-${i}`,
          text: seg.text,
          x: seg.x,
          y: seg.y,
          fontSize: seg.fontSize,
          fontWeight: seg.fontWeight,
          color: seg.color,
          letterSpacing: seg.letterSpacing,
          align: "left" as const,
        })),
      } satisfies TextTrackBeat;

    case "image-card":
    case "soft-pan-still": {
      const assetId = beat.assetId ?? assets[0]?.id ?? "fallback";
      const frameBox = beat.frameBox ?? { x: 2000, y: 500, width: 1500, height: 1100 };

      const result: ImageCardBeat | SoftPanStillBeat = {
        ...baseProps,
        id: `beat-img-${startFrame}`,
        kind: beat.kind,
        assetId,
        frameBox,
        ...(beat.kickerText ? {
          kicker: {
            id: `kicker-${startFrame}`,
            text: beat.kickerText,
            x: beat.kickerX ?? 280,
            y: beat.kickerY ?? 400,
            tier: "micro" as const,
            align: "left" as const,
          },
        } : {}),
        ...(beat.captionText ? {
          caption: {
            id: `caption-${startFrame}`,
            text: beat.captionText,
            x: beat.captionX ?? 280,
            y: beat.captionY ?? 600,
            tier: "editorial" as const,
            align: "left" as const,
          },
        } : {}),
      };
      return result;
    }
  }
}

/**
 * Use Gemini to generate a complete EditorialVideoSpec from content + assets.
 */
export async function compileWithLLM(
  content: string,
  assets: EditorialAsset[],
): Promise<EditorialVideoSpec> {
  console.log(`[LLM-Compiler] Starting LLM compilation...`);
  console.log(`[LLM-Compiler] Content length: ${content.length} chars`);
  console.log(`[LLM-Compiler] Available assets: ${assets.map(a => a.id).join(", ") || "none"}`);

  const assetList = assets.length > 0
    ? `\n\nAVAILABLE IMAGE ASSETS (use these assetIds for image beats):\n${assets.map(a => `- "${a.id}" (role: ${a.role})`).join("\n")}`
    : "\n\nNO IMAGE ASSETS AVAILABLE. Use only text-track, blank-hold, and end-fade beats.";

  const userPrompt = `You are creating a killer presentation video about the following project/content.
Your job is to READ EVERY DETAIL below, understand HOW the project actually works technically,
and then create a punchy, informative video that teaches the viewer about it.

CRITICAL: Do NOT just use the title and generic descriptions. DIG INTO the technical details:
- What is the architecture? (e.g. "Next.js + Remotion + Gemini pipeline")
- How does the data flow? (e.g. "Prompt → Gemini script → Veo clips → Remotion compose → MP4")
- What are the specific technologies and WHY? (e.g. "Remotion for programmatic video, not ffmpeg")
- What are the key numbers/stats? (e.g. "149 files, 786K lines TypeScript, 30fps 1080p output")
- What makes it unique? (e.g. "Telegram bot auto-detects GitHub URLs and generates slides autonomously")

CONTENT — READ ALL OF THIS CAREFULLY:
${content.slice(0, 8000)}
${assetList}

NOW CREATE THE VIDEO. Each beat should present ONE specific technical insight, not vague marketing copy.

Example of GOOD beats:
- Beat: "PROMPT → SCRIPT → VIDEO" (shows the pipeline)
- Beat: stat "149 FILES" with label "TYPESCRIPT CODEBASE"
- Beat: "Remotion composes clips programmatically" with image
- Beat: stat "30 FPS" label "1080P OUTPUT"
- Beat: "Gemini writes the script, Veo generates clips, Lyria makes music — all in parallel"

Example of BAD beats (too generic, avoid these):
- "An innovative platform"
- "Cutting-edge technology"
- "The future of video"

Rules:
- 10-14 beats, 35-60 seconds total
- ONE idea per beat, clean and uncluttered
- Text and images NEVER overlap — if image is on right, text is on left
- Use accent color #E84D0E for key stats, numbers, and technical terms
- Use muted gray rgba(21,18,15,0.45) for labels/kickers above stats
- Start with blank-hold (1.5s), end with end-fade (2s)
- Mix short punchy text beats (1.5-3s) with longer image reveals (4-5s)
- Every segment needs precise x,y coordinates in safe zone (280-3560 x, 200-1960 y)`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      temperature: 0.5,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned empty response for editorial compilation");

  console.log(`[LLM-Compiler] Gemini response: ${text.length} chars`);

  const parsed: LLMOutput = JSON.parse(text);
  console.log(`[LLM-Compiler] Parsed ${parsed.beats.length} beats, ${parsed.totalDurationSeconds}s total`);

  // Convert LLM beats to EditorialBeat format
  let cursor = 0;
  const editorialBeats: EditorialBeat[] = [];

  for (const beat of parsed.beats) {
    const compiled = llmBeatToEditorial(beat, cursor, assets);
    editorialBeats.push(compiled);
    cursor += compiled.durationInFrames;

    const label = beat.kind === "text-track"
      ? `${beat.segments?.length ?? 0} segments`
      : beat.kind === "image-card"
        ? `asset=${beat.assetId}`
        : beat.closingText ?? "";
    console.log(`[LLM-Compiler]   Beat: ${beat.kind} ${beat.durationSeconds}s — ${label}`);
  }

  const totalFrames = cursor;
  const usedAssetIds = new Set(
    editorialBeats.flatMap(b => "assetId" in b ? [b.assetId] : []),
  );

  const spec: EditorialVideoSpec = {
    meta: {
      title: "LLM Editorial",
      fps: FPS,
      width: CANVAS_W,
      height: CANVAS_H,
      durationInFrames: totalFrames,
      durationSec: totalFrames / FPS,
      audioMode: "silent",
      preset: "editorial-generator",
      background: referenceTokens.background,
      ink: referenceTokens.ink,
      fontFamily: referenceTokens.fontFamily,
    },
    assets: assets.filter(a => usedAssetIds.has(a.id)),
    beats: editorialBeats,
    anchors: [],
  };

  console.log(`[LLM-Compiler] Final spec: ${spec.beats.length} beats, ${spec.meta.durationSec.toFixed(1)}s, ${spec.meta.width}x${spec.meta.height}`);
  return spec;
}
