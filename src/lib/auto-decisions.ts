import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ExtractedContent, AutoDecision } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// ─── Zod Schema for AutoDecision ────────────────────────────────────────────

const AutoDecisionSchema = z.object({
  path: z
    .enum(["ai-video", "remotion-only", "upload-edit"])
    .describe("Which pipeline path to use"),
  style: z
    .enum(["cinematic", "anime", "realistic", "abstract", "social"])
    .describe("Visual style preset for the video"),
  aspectRatio: z
    .enum(["16:9", "9:16", "1:1"])
    .describe("Video aspect ratio"),
  duration: z
    .union([z.literal(4), z.literal(6), z.literal(8)])
    .describe("Clip duration in seconds"),
  model: z
    .enum(["veo-3", "veo-3-fast", "veo-3.1"])
    .describe("Veo model to use for video generation"),
  narration: z.object({
    needed: z.boolean().describe("Whether narration is needed"),
    script: z.string().describe("Narration script text (empty string if not needed)"),
    voice: z.string().describe("ElevenLabs voice ID to use"),
    speed: z.number().min(0.7).max(1.2).describe("Speech speed multiplier"),
    language: z.string().describe("Detected language code (e.g. 'en', 'es', 'ja', 'zh', 'fr', 'de', 'ko', 'pt', 'ar', 'hi')"),
    voiceModel: z
      .enum(["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5"])
      .describe("ElevenLabs model — eleven_v3 for English, eleven_multilingual_v2 for non-English"),
  }),
  music: z.object({
    needed: z.boolean().describe("Whether background music is needed"),
    genre: z.string().describe("Music genre (e.g. lo-fi, pop, orchestral)"),
    mood: z.string().describe("Music mood (e.g. upbeat, calm, energetic)"),
    volume: z.number().min(0).max(1).describe("Music volume level"),
    lyriaModel: z
      .enum(["lyria-3-clip", "lyria-3-pro", "lyria-2"])
      .describe("Google Lyria model for music generation"),
  }),
  sfx: z.object({
    needed: z.boolean().describe("Whether sound effects are needed"),
    descriptions: z
      .array(z.string())
      .describe("Natural-language descriptions of desired sound effects"),
  }),
  captions: z.object({
    needed: z.boolean().describe("Whether captions should be added"),
    style: z
      .enum(["tiktok", "subtitle-bar", "karaoke", "typewriter"])
      .describe("Caption display style"),
  }),
  prompt: z.string().describe("The video generation prompt crafted from the content"),
  reasoning: z.string().describe("Explanation of why these decisions were made"),
});

// ─── System Prompt ──────────────────────────────────────────────────────────

const CREATIVE_DIRECTOR_PROMPT = `You are an elite creative director for an AI video generation platform. Your job is to analyze user-provided content and make every creative decision needed to produce the best possible video — automatically.

You receive extracted content (title, description, raw content, input type) and must return a complete set of production decisions. Think like a seasoned director who knows exactly what works for each type of content.

## DECISION RULES

### PATH SELECTION
- GitHub repos, YouTube videos, websites, text prompts → "ai-video" (Path A, uses Veo for AI-generated video clips)
- Video file uploads → "upload-edit" (Path C, edit the uploaded video)
- Very text-heavy content with no strong visual element → consider "remotion-only" (Path B, motion graphics / text-based video)
- Default to "ai-video" when in doubt

### VIDEO STYLE
- GitHub repos → "realistic" or "social" (clean, professional showcase)
- YouTube content → "cinematic" (polished, editorial feel)
- Promotional / website / product content → "social" (punchy, attention-grabbing)
- Anime or manga related → "anime"
- Abstract art, music, or conceptual → "abstract"
- Creative / artistic prompts → match the mood of the content
- Default to "cinematic" when uncertain

### ASPECT RATIO
- Social media / short-form / TikTok / Reels → "9:16"
- YouTube / presentation / tutorial → "16:9"
- Instagram feed / balanced → "1:1"
- Default to "16:9"

### DURATION
- Quick showcase / social clip → 4 seconds
- Standard content → 6 seconds
- Detailed explainer or cinematic → 8 seconds
- Default to 6 seconds

### VEO MODEL
- High quality, cinematic shots → "veo-3"
- Fast iteration, previews → "veo-3-fast"
- Latest features, experimental → "veo-3.1"
- Default to "veo-3"

### LANGUAGE DETECTION
- Detect the primary language of the content from the raw text, title, and description
- Return the ISO 639-1 language code (e.g. "en", "es", "ja", "zh", "fr", "de", "ko", "pt", "ar", "hi")
- If content is mixed language, use the dominant language
- Default to "en" when uncertain

### NARRATION RULES
- GitHub repos → NEEDED (explain the project, highlight key features and what makes it interesting)
- YouTube videos → NOT NEEDED (video already has its own audio)
- Video uploads → NOT NEEDED (preserve the original audio)
- Text prompts → NEEDED if educational, informational, or explanatory; NOT NEEDED if purely visual or artistic
- Websites → NEEDED (explain the product or service, walk through key value props)
- When needed: write a concise 30-60 second script that sounds natural and engaging
- When not needed: set script to empty string ""
- Write the narration script in the SAME LANGUAGE as the detected content language

### VOICE SELECTION (voice ID by content tone)
- Technical / professional / GitHub repos → "JBFqnCBsd6RMkjVDRZzb" (George — authoritative male)
- Casual / social media / lifestyle → "21m00Tcm4TlvDq8ikWAM" (Rachel — friendly female)
- Energetic / promo / product launch → "ErXwobaYiN019PkySvjV" (Antoni — dynamic male)
- Storytelling / brand / emotional → "EXAVITQu4vr4xnSDxMaL" (Bella — warm female)
- Default: "JBFqnCBsd6RMkjVDRZzb" (George)

### VOICE MODEL SELECTION
- If detected language is "en" (English) → voiceModel: "eleven_v3" (highest quality for English)
- If detected language is NOT English → voiceModel: "eleven_multilingual_v2" (supports 29 languages)
- Default: "eleven_v3"

### NARRATION SPEED
- Technical / educational content → 0.9 (slightly slower for comprehension)
- Promotional / social / energetic → 1.1 (upbeat pace)
- Cinematic / storytelling → 0.9 (dramatic pacing)
- Default → 1.0

### MUSIC RULES
- Technical / code content → genre: "lo-fi", mood: "focused", volume: 0.2
- Promotional / marketing → genre: "pop", mood: "upbeat", volume: 0.35
- Artistic / creative → genre: "orchestral", mood: "cinematic", volume: 0.5
- Educational / explainer → genre: "ambient", mood: "calm", volume: 0.2
- If narration is NEEDED → cap music volume at 0.3 (so voice stays clear)
- YouTube content → NOT NEEDED (already has audio)
- Video uploads → NOT NEEDED (preserve original audio)
- Default Lyria model: "lyria-3-pro" for high quality, "lyria-3-clip" for shorter/faster
- Default: genre "ambient", mood "neutral", volume 0.25

### SOUND EFFECTS
- Generally NOT NEEDED unless the content has clear sound-worthy moments
- Product launches → subtle whoosh or reveal sounds
- Gaming / action → impact sounds
- If sfx not needed, set descriptions to empty array []

### CAPTIONS
- Narration ON → captions NEEDED
- Narration OFF → captions NOT NEEDED
- Video uploads → captions NEEDED with style "tiktok" (auto-transcribe)
- Caption style by content type:
  - Social media / TikTok / Reels / energetic → "tiktok" (bold, animated)
  - Educational / professional / technical → "subtitle-bar" (clean, readable)
  - Artistic / cinematic / abstract → "karaoke" (word-by-word highlight) or no captions
  - Storytelling / long-form → "typewriter" (typed appearance)
- Default style: "subtitle-bar"

### PROMPT CRAFTING
- Transform the content into a vivid, visual video generation prompt
- For GitHub: focus on the product in action, developer experience, key UI/features
- For YouTube: distill the core visual narrative into a cinematic prompt
- For websites: highlight the product value, UI, user flow
- For text: expand into a detailed visual scene description
- Keep prompts under 200 words, specific, and visually rich
- Include lighting, camera angle, atmosphere details

## REASONING
Always explain your creative decisions briefly — why this path, style, and audio setup makes sense for this specific content. Keep it to 2-3 sentences.`;

// ─── Default fallback ───────────────────────────────────────────────────────

function buildDefaultDecision(content: ExtractedContent): AutoDecision {
  const isVideo = content.inputType === "video";
  const isYouTube = content.inputType === "youtube";

  return {
    path: isVideo ? "upload-edit" : "ai-video",
    style: "cinematic",
    aspectRatio: "16:9",
    duration: 6,
    model: "veo-3",
    narration: {
      needed: !isVideo && !isYouTube,
      script: !isVideo && !isYouTube
        ? `Here's a look at ${content.title}. ${content.description}`
        : "",
      voice: "JBFqnCBsd6RMkjVDRZzb",
      speed: 1.0,
      language: "en",
      voiceModel: "eleven_v3",
    },
    music: {
      needed: !isVideo && !isYouTube,
      genre: "ambient",
      mood: "calm",
      volume: 0.25,
      lyriaModel: "lyria-3-pro",
    },
    sfx: { needed: false, descriptions: [] },
    captions: {
      needed: !isVideo && !isYouTube,
      style: "subtitle-bar",
    },
    prompt: `A cinematic video about ${content.title}. ${content.description}`,
    reasoning:
      "Falling back to sensible defaults: cinematic style, 16:9, with narration and ambient music.",
  };
}

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * Use Gemini to make autonomous creative decisions for video generation
 * based on extracted content from user input.
 */
export async function makeAutoDecisions(
  content: ExtractedContent
): Promise<AutoDecision> {
  const jsonSchema = z.toJSONSchema(AutoDecisionSchema, { target: "draft-7" });

  const userMessage = `Analyze the following content and make all creative decisions for video production.

INPUT TYPE: ${content.inputType}
TITLE: ${content.title}
DESCRIPTION: ${content.description}

RAW CONTENT:
${content.rawContent.slice(0, 4000)}

${content.metadata ? `METADATA: ${JSON.stringify(content.metadata, null, 2)}` : ""}
${content.videoLocalPath ? `VIDEO FILE: ${content.videoLocalPath}` : ""}

Return your complete creative decision as structured JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userMessage,
      config: {
        systemInstruction: CREATIVE_DIRECTOR_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) {
      console.warn("Gemini returned empty response for auto-decisions, using defaults");
      return buildDefaultDecision(content);
    }

    const parsed = JSON.parse(text);
    const decision = AutoDecisionSchema.parse(parsed);

    console.log(`[AutoDecisions] Gemini raw decision:`);
    console.log(`[AutoDecisions]   path=${decision.path} model=${decision.model} style=${decision.style} AR=${decision.aspectRatio} dur=${decision.duration}s`);
    console.log(`[AutoDecisions]   narration=${decision.narration.needed} music=${decision.music.needed}(${decision.music.genre}/${decision.music.mood}) sfx=${decision.sfx.needed} captions=${decision.captions.needed}`);
    console.log(`[AutoDecisions]   prompt="${decision.prompt.slice(0, 100)}..."`);
    console.log(`[AutoDecisions]   reasoning="${decision.reasoning.slice(0, 150)}..."`);

    // Enforce consistency rules that the LLM might miss
    const enforced = enforceRules(decision, content);
    if (enforced.path !== decision.path) {
      console.log(`[AutoDecisions]   RULE OVERRIDE: path ${decision.path} → ${enforced.path}`);
    }
    return enforced;
  } catch (error) {
    console.error("[AutoDecisions] FAILED, using defaults:", error);
    return buildDefaultDecision(content);
  }
}

// ─── Post-LLM Rule Enforcement ──────────────────────────────────────────────

/**
 * Apply hard constraints that override the LLM output if it violated any rules.
 */
function enforceRules(decision: AutoDecision, content: ExtractedContent): AutoDecision {
  let { narration, music, path, captions } = decision;

  // Video uploads must use Path C
  if (content.inputType === "video") {
    path = "upload-edit";
  }

  // Non-video inputs must NOT use Path C (no video file to edit)
  if (content.inputType !== "video" && path === "upload-edit") {
    path = "ai-video";
  }

  // YouTube and video uploads should not have narration
  if (content.inputType === "youtube" || content.inputType === "video") {
    narration = { ...narration, needed: false, script: "" };
  }

  // YouTube and video uploads should not have music (preserve original audio)
  if (content.inputType === "youtube" || content.inputType === "video") {
    music = { ...music, needed: false, volume: 0 };
  }

  // If narration is on, cap music volume at 0.3
  if (narration.needed && music.needed && music.volume > 0.3) {
    music = { ...music, volume: 0.3 };
  }

  // If narration is off, no script
  if (!narration.needed) {
    narration = { ...narration, script: "" };
  }

  // Enforce voice model based on detected language
  if (narration.needed) {
    const isEnglish = narration.language === "en" || !narration.language;
    const correctModel = isEnglish ? "eleven_v3" : "eleven_multilingual_v2";
    if (narration.voiceModel !== correctModel) {
      narration = { ...narration, voiceModel: correctModel };
    }
  }

  // Captions follow narration (unless video upload which gets auto-captions)
  if (!narration.needed && content.inputType !== "video") {
    captions = { ...captions, needed: false };
  }

  return {
    ...decision,
    path,
    narration,
    music,
    captions,
  };
}

// ─── Follow-Up Refinement ────────────────────────────────────────────────────

const REFINEMENT_PROMPT = `You are an assistant that modifies video generation decisions based on user feedback.

You receive the original AutoDecision (as JSON) and a user follow-up message. Return an UPDATED AutoDecision with only the requested changes applied. Keep everything else the same.

Common follow-up patterns:
- "make it shorter" / "longer" → adjust duration (4, 6, or 8)
- "vertical" / "for TikTok" / "for Reels" → aspectRatio: "9:16"
- "landscape" / "widescreen" → aspectRatio: "16:9"
- "square" → aspectRatio: "1:1"
- "more energetic" / "upbeat" → adjust music mood/genre
- "no narration" / "remove narration" → narration.needed: false, script: ""
- "add narration" → narration.needed: true (write a new script)
- "no music" → music.needed: false
- "add captions" → captions.needed: true
- "anime style" / "cinematic" etc. → change style
- "again" / "regenerate" → return the same decision unchanged (but update reasoning)
- "make it about X instead" → rewrite the prompt

Always update the reasoning field to explain what changed and why.`;

/**
 * Refine a previous AutoDecision based on user follow-up feedback.
 * Returns an updated decision with only the requested changes applied.
 */
export async function refineAutoDecision(
  previousDecision: AutoDecision,
  followUp: string,
  content: ExtractedContent,
): Promise<AutoDecision> {
  const jsonSchema = z.toJSONSchema(AutoDecisionSchema, { target: "draft-7" });

  const userMessage = `Here is the original video generation decision:

${JSON.stringify(previousDecision, null, 2)}

The user says: "${followUp}"

Return an updated decision with the requested changes. Keep everything else the same.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userMessage,
      config: {
        systemInstruction: REFINEMENT_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        temperature: 0.5,
      },
    });

    const text = response.text;
    if (!text) {
      console.warn("Gemini returned empty response for refinement, reusing previous decision");
      return previousDecision;
    }

    const parsed = JSON.parse(text);
    const refined = AutoDecisionSchema.parse(parsed);
    return enforceRules(refined, content);
  } catch (error) {
    console.error("Auto-decision refinement failed, reusing previous:", error);
    return previousDecision;
  }
}
