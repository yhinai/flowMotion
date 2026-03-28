export interface Scene {
  scene_number: number;
  title: string;
  visual_description: string;
  narration_text: string;
  duration_seconds: number;
  camera_direction: string;
  mood: string;
  transition: "cut" | "fade" | "dissolve" | "wipe";
}

export interface Script {
  title: string;
  theme: string;
  target_audience: string;
  music_prompt: string;
  scenes: Scene[];
  total_duration_seconds: number;
}

export interface GeneratedScene extends Scene {
  videoUrl: string;
  videoLocalPath?: string;
  narrationAudioUrl?: string;
  soundEffectUrl?: string;
}

export interface GeneratedScript extends Omit<Script, "scenes"> {
  scenes: GeneratedScene[];
  musicUrl?: string;
  titleCardUrl?: string;
}

export type JobStage =
  | "queued"
  | "generating_script"
  | "generating_clips"
  | "uploading_assets"
  | "composing_video"
  | "completed"
  | "failed";

export interface SceneProgress {
  scene_number: number;
  status: "pending" | "generating" | "uploading" | "done" | "failed";
  error?: string;
}

export interface JobStatus {
  jobId: string;
  stage: JobStage;
  progress: number; // 0-100
  message: string;
  scenes?: SceneProgress[];
  script?: Script;
  generatedScript?: GeneratedScript;
  previewUrl?: string;
  downloadUrl?: string;
  error?: string;

  createdAt: string;
  updatedAt: string;
}

export interface CompositionStyle {
  // Title overlay
  titleFontSize: number;
  titleColor: string;
  titleFontFamily: string;
  showTitle: boolean;

  // Subtitle overlay
  subtitleFontSize: number;
  subtitleColor: string;
  subtitleBgColor: string;
  subtitleBgOpacity: number;
  subtitlePosition: "top" | "center" | "bottom";
  showSubtitles: boolean;

  // Transition overrides
  transitionType: "cut" | "fade" | "dissolve" | "wipe" | "per-scene";
  transitionDurationFrames: number;

  // Music
  musicVolume: number;

  // Color overlay / tint
  overlayColor: string;
  overlayOpacity: number;

  // Watermark
  watermarkText: string;
  showWatermark: boolean;
}

export const DEFAULT_STYLE: CompositionStyle = {
  titleFontSize: 72,
  titleColor: "#ffffff",
  titleFontFamily: "sans-serif",
  showTitle: true,
  subtitleFontSize: 36,
  subtitleColor: "#ffffff",
  subtitleBgColor: "#000000",
  subtitleBgOpacity: 0.6,
  subtitlePosition: "bottom",
  showSubtitles: true,
  transitionType: "per-scene",
  transitionDurationFrames: 15,
  musicVolume: 0.3,
  overlayColor: "#000000",
  overlayOpacity: 0,
  watermarkText: "",
  showWatermark: false,
};

export interface EditRequest {
  instruction: string;
  currentStyle: CompositionStyle;
}

export interface EditResponse {
  style: CompositionStyle;
  explanation: string;
}

export interface EditHistoryEntry {
  instruction: string;
  style: CompositionStyle;
  explanation: string;
  timestamp: string;
}

export type GenerationEngine = "veo3" | "nano-banan" | "auto";

export interface GenerateRequest {
  prompt: string;
  templateId?: TemplateId;
  sourceType?: SourceType;
  sourceUrl?: string;
  assets?: string[];
  enableVeo?: boolean;
  engine?: GenerationEngine;
  resolution?: "720p" | "1080p";
  sceneCount?: number;
}

export const ENGINE_INFO: Record<GenerationEngine, { name: string; description: string; icon: string }> = {
  veo3: {
    name: "Veo 3",
    description: "AI-generated video clips per scene. Best for motion-heavy content.",
    icon: "film",
  },
  "nano-banan": {
    name: "Nano Banan Pro",
    description: "AI-generated images per scene. Best for presentations and visual stories.",
    icon: "image",
  },
  auto: {
    name: "Auto",
    description: "AI picks the best engine per scene. Recommended for most projects.",
    icon: "sparkles",
  },
};

export interface GenerateResponse {
  jobId: string;
  message: string;
}

// Template system types
export type TemplateId = 'product-launch' | 'explainer' | 'social-promo' | 'brand-story' | 'editorial';
export type TemplateIdOrCustom = TemplateId | 'custom';

export interface ProductLaunchInput {
  brandName: string;
  tagline: string;
  productImages: string[];
  features: string[];
  brandColor?: string;
  logoUrl?: string;
}

export interface ExplainerInput {
  title: string;
  steps: { title: string; description: string; iconUrl?: string }[];
  conclusion: string;
  introNarration?: string;
  summaryNarration?: string;
  narrationUrls?: Record<number, string>;
  sfxUrls?: Record<number, string>;
  musicUrl?: string;
}

export interface SocialPromoInput {
  hook: string;
  productImage: string;
  features: string[];
  cta: string;
  aspectRatio: '16:9' | '9:16';
}

export interface BrandStoryInput {
  companyName: string;
  mission: string;
  teamPhotos: string[];
  milestones: { year: string; event: string }[];
  vision: string;
  logoUrl?: string;
}

export interface EditorialInput {
  prompt: string;
  brainMode?: 'rule-based' | 'llm';
  resolution?: '1080p' | '4k';
}

export type TemplateInput = ProductLaunchInput | ExplainerInput | SocialPromoInput | BrandStoryInput | EditorialInput;

export interface TemplateConfig {
  id: TemplateId;
  name: string;
  description: string;
  defaultDurationSeconds: number;
  defaultAspectRatio: '16:9' | '9:16';
  compositionId: string;
}

export interface YouTubeMetadata {
  title: string;
  description: string;
  thumbnailUrl: string;
  channelName: string;
  viewCount?: string;
  publishedAt?: string;
}

export interface GitHubMetadata {
  name: string;
  description: string;
  stars: number;
  language: string;
  topics: string[];
  readmeContent: string;
  ownerAvatarUrl: string;
  features: string[];
}

export type SourceType = 'prompt' | 'youtube' | 'github';

// ─── 3-Path Architecture Types ───────────────────────────────────────────────

/** The three top-level creation paths */
export type BotPath = 'ai-video' | 'remotion-only' | 'upload-edit';

/** Veo model selection for Path A */
export type VeoModel = 'veo-3' | 'veo-3.1';

/** Supported aspect ratios across all paths */
export type AspectRatio = '16:9' | '9:16';

/** Remotion-only video types for Path B */
export type RemotionVideoType = 'text-video' | 'image-slideshow';

/** Edit actions for Path C */
export type EditAction = 'add-captions' | 'remove-silence';

/** Audio generation settings for narration and sound effects */
export interface AudioSettings {
  readonly narration?: boolean;
  readonly sfx?: boolean;
  readonly voiceId?: string;
}

/** Path A config: direct Veo video generation */
export interface PathAConfig {
  readonly path: 'ai-video';
  readonly model: VeoModel;
  readonly aspectRatio: AspectRatio;
  readonly prompt: string;
  readonly audio?: AudioSettings;
}

/** Path B config: Remotion-only compositions */
export interface PathBConfig {
  readonly path: 'remotion-only';
  readonly type: RemotionVideoType;
  readonly aspectRatio: AspectRatio;
  readonly duration?: number; // seconds
  readonly text?: string; // for text-video
  readonly images?: string[]; // for image-slideshow
  readonly audio?: AudioSettings;
}

/** Path C config: upload and edit */
export interface PathCConfig {
  readonly path: 'upload-edit';
  readonly action: EditAction;
  readonly videoUrl: string; // uploaded video URL
  readonly videoLocalPath: string; // local path to downloaded video
}

export type PathConfig = PathAConfig | PathBConfig | PathCConfig;

// ─── Conversation State Machine (Telegram Bot) ──────────────────────────────

export type ConversationStep =
  | { step: 'idle' }
  | { step: 'path_selection' }
  // Path A states
  | { step: 'a_model_selection' }
  | { step: 'a_aspect_ratio'; model: VeoModel }
  | { step: 'a_style_selection'; model: VeoModel; aspectRatio: AspectRatio }
  | { step: 'a_duration_selection'; model: VeoModel; aspectRatio: AspectRatio; style: string }
  | { step: 'a_first_frame'; model: VeoModel; aspectRatio: AspectRatio; style: string; durationSeconds: 4 | 6 | 8 }
  | { step: 'a_audio_strategy'; model: VeoModel; aspectRatio: AspectRatio; style: string; durationSeconds: 4 | 6 | 8; firstFrameImageUrl?: string }
  | { step: 'a_awaiting_prompt'; model: VeoModel; aspectRatio: AspectRatio; style?: string; durationSeconds?: 4 | 6 | 8; firstFrameImageUrl?: string; audioStrategy?: 'native' | 'custom' }
  // Path B states
  | { step: 'b_type_selection' }
  | { step: 'b_aspect_ratio'; type: RemotionVideoType }
  | { step: 'b_awaiting_text'; type: RemotionVideoType; aspectRatio: AspectRatio }
  | { step: 'b_collecting_images'; type: RemotionVideoType; aspectRatio: AspectRatio; images: string[] }
  // Path C states
  | { step: 'c_awaiting_video' }
  | { step: 'c_action_selection'; videoUrl: string; videoLocalPath: string }
  // Shared pre-processing questions
  | { step: 'shared_narration'; preJobPayload: PreJobPayload }
  | { step: 'shared_music'; preJobPayload: PreJobPayload; narration: boolean }
  | { step: 'shared_sfx'; preJobPayload: PreJobPayload; narration: boolean; music: boolean }
  | { step: 'shared_captions'; preJobPayload: PreJobPayload; narration: boolean; music: boolean; sfx: boolean }
  | { step: 'shared_thumbnail'; preJobPayload: PreJobPayload; narration: boolean; music: boolean; sfx: boolean; captions: boolean }
  // Shared
  | { step: 'processing'; jobId: string }
  | { step: 'post_delivery'; jobId: string; downloadUrl: string; preJobPayload?: PreJobPayload }
  | { step: 'rating'; jobId: string };

/** Pre-job payload carried through shared question steps */
export interface PreJobPayload {
  readonly prompt: string;
  readonly pathType: PathJobType;
  readonly pathConfig: PathConfig;
}

/** Caption segment from transcription */
export interface CaptionSegment {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** Silence interval detected in audio */
export interface SilenceInterval {
  readonly startSec: number;
  readonly endSec: number;
}

/** Job types for the 3-path architecture */
export type PathJobType = 'path-a' | 'path-b' | 'path-c';
