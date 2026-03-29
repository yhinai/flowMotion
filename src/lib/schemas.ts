import { z } from "zod";

// ─── Scene & Script Schemas (existing) ─────────────────────────────────────

export const SceneSchema = z.object({
  scene_number: z.number().describe("Sequential scene number starting from 1"),
  title: z.string().describe("Short descriptive title for this scene"),
  visual_description: z
    .string()
    .describe(
      "Detailed visual description for AI video generation. Include setting, subjects, actions, lighting, camera angle, and atmosphere. Be specific and cinematic."
    ),
  narration_text: z
    .string()
    .describe("Narration or caption text to overlay on this scene"),
  duration_seconds: z
    .number()
    .min(4)
    .max(8)
    .describe("Scene duration in seconds (4, 6, or 8)"),
  camera_direction: z
    .string()
    .describe(
      "Camera movement and framing: e.g. wide shot, close-up, slow pan left, tracking shot, static"
    ),
  mood: z
    .string()
    .describe(
      "Emotional tone of the scene: e.g. dramatic, upbeat, calm, tense, inspiring"
    ),
  transition: z
    .enum(["cut", "fade", "dissolve", "wipe"])
    .describe("Transition type to the next scene"),
});

export const ScriptSchema = z.object({
  title: z.string().describe("Title of the video"),
  theme: z
    .string()
    .describe("Overall theme or genre: e.g. documentary, promotional, educational"),
  target_audience: z
    .string()
    .describe("Who this video is intended for"),
  music_prompt: z
    .string()
    .describe(
      "Prompt for background music generation. Describe genre, mood, tempo, instruments."
    ),
  scenes: z
    .array(SceneSchema)
    .min(3)
    .max(8)
    .describe("Array of scenes that make up the video"),
  total_duration_seconds: z
    .number()
    .describe("Total estimated duration of the video in seconds"),
});

// ─── Template Input Schemas (existing) ──────────────────────────────────────

export const ProductLaunchInputSchema = z.object({
  brandName: z.string().describe("Brand or product name"),
  tagline: z.string().describe("Short tagline or slogan"),
  productImages: z.array(z.string()).describe("URLs of product images"),
  features: z.array(z.string()).min(2).max(6).describe("Key product features"),
  brandColor: z.string().optional().describe("Primary brand color as hex"),
  logoUrl: z.string().optional().describe("Brand logo URL"),
});

export const ExplainerInputSchema = z.object({
  title: z.string().describe("Video title"),
  steps: z.array(z.object({
    title: z.string().describe("Step title"),
    description: z.string().describe("Step description written in conversational narration style, as if spoken by a great teacher explaining to a curious student"),
    iconUrl: z.string().optional().describe("Optional icon/diagram URL"),
  })).min(2).max(6).describe("Explanation steps"),
  conclusion: z.string().describe("Summary or conclusion text"),
  introNarration: z.string().optional().describe("A 2-3 sentence spoken introduction that hooks the viewer and sets up the topic. Conversational, engaging, like a great teacher. Example: 'Have you ever wondered how your phone knows what you're saying? Today, we're going to break down speech recognition in 4 simple steps.'"),
  summaryNarration: z.string().optional().describe("A 2-3 sentence spoken conclusion that wraps up the learning memorably. Example: 'And there you have it — from sound waves to text on your screen. Speech recognition isn't magic, it's just math, data, and a lot of practice.'"),
  narrationUrls: z.record(z.string(), z.string()).optional().describe("Map of scene number to narration audio URL"),
  sfxUrls: z.record(z.string(), z.string()).optional().describe("Map of scene number to sound effect URL"),
  musicUrl: z.string().optional().describe("Background music URL"),
});

export const SocialPromoInputSchema = z.object({
  hook: z.string().describe("Attention-grabbing hook text"),
  productImage: z.string().describe("Main product image URL"),
  features: z.array(z.string()).min(2).max(4).describe("Quick feature highlights"),
  cta: z.string().describe("Call to action text"),
  aspectRatio: z.enum(["16:9", "9:16"]).describe("Video aspect ratio"),
});

export const BrandStoryInputSchema = z.object({
  companyName: z.string().describe("Company name"),
  mission: z.string().describe("Company mission statement"),
  teamPhotos: z.array(z.string()).describe("Team member photo URLs"),
  milestones: z.array(z.object({
    year: z.string().describe("Year of milestone"),
    event: z.string().describe("What happened"),
  })).min(2).max(6).describe("Company milestones"),
  vision: z.string().describe("Vision statement for the future"),
  logoUrl: z.string().optional().describe("Company logo URL"),
});

// ─── 3-Path Architecture Schemas ────────────────────────────────────────────

/** Narration configuration schema */
export const NarrationConfigSchema = z.object({
  voiceId: z.string().optional().describe("ElevenLabs voice ID"),
  model: z
    .enum(["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5"])
    .optional()
    .describe("ElevenLabs voice model"),
  speed: z
    .number()
    .min(0.7)
    .max(1.2)
    .optional()
    .describe("Speech speed multiplier (0.7 – 1.2)"),
  script: z.string().describe("Narration script text"),
});

/** Music generation configuration schema */
export const MusicGenConfigSchema = z.object({
  genre: z.string().optional().describe("Music genre (e.g. lo-fi, orchestral, pop)"),
  mood: z.string().optional().describe("Music mood (e.g. upbeat, melancholic, tense)"),
  tempo: z
    .enum(["slow", "medium", "fast"])
    .optional()
    .describe("Tempo preference"),
  instruments: z.string().optional().describe("Instrument hints (e.g. piano, guitar, synth)"),
  withVocals: z.boolean().optional().describe("Whether to include vocals"),
  lyriaModel: z
    .enum(["lyria-3-clip", "lyria-3-pro", "lyria-2"])
    .optional()
    .describe("Google Lyria model selection"),
});

/** Sound effect configuration schema */
export const SfxGenConfigSchema = z.object({
  description: z.string().describe("Natural-language description of the desired sound effect"),
  durationSeconds: z
    .number()
    .min(0.5)
    .max(30)
    .optional()
    .describe("Duration of the sound effect in seconds (0.5 – 30)"),
  looping: z.boolean().optional().describe("Whether the SFX should be seamlessly loopable"),
  promptInfluence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("How strongly the prompt influences generation (0 – 1)"),
});

/** Overlay configuration for Path C */
export const OverlayConfigSchema = z.object({
  titleText: z.string().optional().describe("Title overlay text"),
  titlePosition: z.enum(["top", "center", "bottom"]).optional().describe("Title vertical position"),
  lowerThirdText: z.string().optional().describe("Lower-third text overlay"),
  logoUrl: z.string().optional().describe("Logo image URL"),
  endCardCta: z.string().optional().describe("End-card call-to-action text"),
});

/** Shared audio options collected through the bot flow */
export const SharedAudioOptionsSchema = z.object({
  narration: NarrationConfigSchema.optional().describe("Narration configuration"),
  music: MusicGenConfigSchema.optional().describe("Background music configuration"),
  sfx: SfxGenConfigSchema.optional().describe("Sound effect configuration"),
  captionStyle: z
    .enum(["tiktok", "subtitle-bar", "karaoke", "typewriter"])
    .optional()
    .describe("Caption overlay style"),
  generateThumbnail: z.boolean().optional().describe("Whether to auto-generate a thumbnail"),
});

/** Path A config: direct Veo video generation */
export const PathAConfigSchema = z.object({
  path: z.literal("ai-video").describe("Path identifier"),
  model: z
    .enum(["veo-3", "veo-3-fast", "veo-3.1"])
    .describe("Veo model selection"),
  aspectRatio: z
    .enum(["16:9", "9:16", "1:1"])
    .describe("Video aspect ratio"),
  prompt: z.string().min(1).describe("Generation prompt"),
  style: z
    .enum(["cinematic", "anime", "realistic", "abstract", "social"])
    .optional()
    .describe("Video style preset"),
  durationSeconds: z
    .union([z.literal(4), z.literal(6), z.literal(8)])
    .optional()
    .describe("Clip duration in seconds"),
  firstFrameImageUrl: z.string().optional().describe("URL for the first-frame reference image"),
  audioStrategy: z
    .enum(["native", "custom"])
    .optional()
    .describe("Native Veo audio vs custom audio pipeline"),
  resolution: z
    .enum(["720p", "1080p", "4k"])
    .optional()
    .describe("Output resolution"),
  sharedAudio: SharedAudioOptionsSchema.optional().describe("Shared audio options"),
});

/** Path B config: Remotion-only compositions */
export const PathBConfigSchema = z.object({
  path: z.literal("remotion-only").describe("Path identifier"),
  type: z
    .enum(["text-video", "image-slideshow", "motion-graphics", "data-viz", "explainer", "promo"])
    .describe("Remotion video type"),
  aspectRatio: z
    .enum(["16:9", "9:16", "1:1"])
    .describe("Video aspect ratio"),
  duration: z.number().positive().optional().describe("Total duration in seconds"),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).optional().describe("Frame rate"),
  resolution: z
    .enum(["720p", "1080p", "4k"])
    .optional()
    .describe("Output resolution"),
  // Content fields (conditional on type)
  text: z.string().optional().describe("Text content for text-video"),
  images: z.array(z.string()).optional().describe("Image URLs for image-slideshow"),
  data: z.string().optional().describe("CSV or JSON data for data-viz"),
  chartType: z
    .enum(["bar", "line", "pie", "counter", "bar-race"])
    .optional()
    .describe("Chart type for data-viz"),
  steps: z.string().optional().describe("Step-by-step outline for explainer"),
  promoDetails: z
    .object({
      headline: z.string().optional(),
      tagline: z.string().optional(),
      cta: z.string().optional(),
      brandColors: z.string().optional(),
      logoUrl: z.string().optional(),
    })
    .optional()
    .describe("Promo details"),
  // Style & presentation
  animationStyle: z
    .enum(["smooth", "snappy", "cinematic", "playful", "minimal"])
    .optional()
    .describe("Animation style"),
  transition: z
    .enum(["fade", "slide", "wipe", "clockWipe", "flip", "none"])
    .optional()
    .describe("Transition between scenes"),
  backgroundType: z
    .enum(["solid", "ai-generated", "upload", "transparent"])
    .optional()
    .describe("Background type"),
  backgroundColor: z.string().optional().describe("Hex color for solid background"),
  backgroundImageUrl: z.string().optional().describe("URL for upload or AI-generated background"),
  theme: z
    .enum(["light", "dark", "neon", "minimal", "custom"])
    .optional()
    .describe("Color theme"),
  generateAiImages: z.boolean().optional().describe("Whether to AI-generate images per scene"),
  sharedAudio: SharedAudioOptionsSchema.optional().describe("Shared audio options"),
});

/** Path C config: upload and edit */
export const PathCConfigSchema = z.object({
  path: z.literal("upload-edit").describe("Path identifier"),
  action: z
    .enum([
      "add-captions",
      "remove-silence",
      "remove-filler",
      "add-music",
      "add-narration",
      "add-sfx",
      "add-overlays",
      "full-edit",
    ])
    .describe("Primary edit action"),
  actions: z
    .array(
      z.enum([
        "add-captions",
        "remove-silence",
        "remove-filler",
        "add-music",
        "add-narration",
        "add-sfx",
        "add-overlays",
        "full-edit",
      ])
    )
    .optional()
    .describe("Multi-select edit actions"),
  videoUrl: z.string().describe("Uploaded video URL"),
  videoLocalPath: z.string().describe("Local path to downloaded video"),
  overlayConfig: OverlayConfigSchema.optional().describe("Overlay configuration"),
  narrationConfig: NarrationConfigSchema.optional().describe("Narration configuration"),
  musicConfig: MusicGenConfigSchema.optional().describe("Music configuration"),
  sfxConfig: SfxGenConfigSchema.optional().describe("Sound effect configuration"),
  captionStyle: z
    .enum(["tiktok", "subtitle-bar", "karaoke", "typewriter"])
    .optional()
    .describe("Caption overlay style"),
});

/** Union of all path config schemas */
export const PathConfigSchema = z.discriminatedUnion("path", [
  PathAConfigSchema,
  PathBConfigSchema,
  PathCConfigSchema,
]);

// ─── Generate Request Schema ────────────────────────────────────────────────

export const GenerateRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  templateId: z.enum(["custom", "product-launch", "explainer", "social-promo", "brand-story", "editorial"]).optional().default("product-launch"),
  sourceType: z.enum(["prompt", "youtube", "github"]).optional().default("prompt"),
  sourceUrl: z.string().optional(),
  assets: z.array(z.string()).optional(),
  enableVeo: z.boolean().optional().default(false),
  engine: z.enum(["veo3", "nano-banan", "auto"]).optional().default("auto"),
  resolution: z.enum(["720p", "1080p"]).optional().default("720p"),
  sceneCount: z.number().min(1).max(8).optional().default(5),
  // 3-path architecture
  pathType: z.enum(["path-a", "path-b", "path-c"]).optional(),
  pathConfig: PathConfigSchema.optional(),
});

// ─── Composition Style Schema (existing) ────────────────────────────────────

export const CompositionStyleSchema = z.object({
  titleFontSize: z.number().min(12).max(200).describe("Title text font size in pixels"),
  titleColor: z.string().describe("Title text color as hex (e.g. #ffffff)"),
  titleFontFamily: z.string().describe("Title font family (e.g. sans-serif, serif, monospace)"),
  showTitle: z.boolean().describe("Whether to show the title overlay on the first scene"),
  subtitleFontSize: z.number().min(12).max(100).describe("Subtitle text font size in pixels"),
  subtitleColor: z.string().describe("Subtitle text color as hex"),
  subtitleBgColor: z.string().describe("Subtitle background color as hex"),
  subtitleBgOpacity: z.number().min(0).max(1).describe("Subtitle background opacity (0-1)"),
  subtitlePosition: z.enum(["top", "center", "bottom"]).describe("Subtitle vertical position"),
  showSubtitles: z.boolean().describe("Whether to show subtitle overlays"),
  transitionType: z
    .enum(["cut", "fade", "dissolve", "wipe", "per-scene"])
    .describe("Transition type between scenes. 'per-scene' uses each scene's own transition setting"),
  transitionDurationFrames: z
    .number()
    .min(0)
    .max(60)
    .describe("Transition duration in frames (at 30fps)"),
  musicVolume: z.number().min(0).max(1).describe("Background music volume (0-1)"),
  overlayColor: z.string().describe("Color overlay/tint on video as hex"),
  overlayOpacity: z.number().min(0).max(0.8).describe("Color overlay opacity (0 = no overlay, 0.8 = heavy tint)"),
  watermarkText: z.string().describe("Watermark text to display"),
  showWatermark: z.boolean().describe("Whether to show watermark"),
});

export const EditRequestSchema = z.object({
  instruction: z.string().min(1).max(1000),
  currentStyle: CompositionStyleSchema,
});

// ─── Inferred Types ─────────────────────────────────────────────────────────

export type ScriptOutput = z.infer<typeof ScriptSchema>;
export type SceneOutput = z.infer<typeof SceneSchema>;
export type CompositionStyleOutput = z.infer<typeof CompositionStyleSchema>;
export type PathAConfigOutput = z.infer<typeof PathAConfigSchema>;
export type PathBConfigOutput = z.infer<typeof PathBConfigSchema>;
export type PathCConfigOutput = z.infer<typeof PathCConfigSchema>;
export type PathConfigOutput = z.infer<typeof PathConfigSchema>;
export type SharedAudioOptionsOutput = z.infer<typeof SharedAudioOptionsSchema>;
export type NarrationConfigOutput = z.infer<typeof NarrationConfigSchema>;
export type MusicGenConfigOutput = z.infer<typeof MusicGenConfigSchema>;
export type SfxGenConfigOutput = z.infer<typeof SfxGenConfigSchema>;
