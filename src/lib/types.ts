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
export type VeoModel = 'veo-3' | 'veo-3-fast' | 'veo-3.1';

/** Supported aspect ratios across all paths */
export type AspectRatio = '16:9' | '9:16' | '1:1';

/** Video resolution */
export type VideoResolution = '720p' | '1080p' | '4k';

/** Remotion-only video types for Path B */
export type RemotionVideoType = 'text-video' | 'image-slideshow' | 'motion-graphics' | 'data-viz' | 'explainer' | 'promo';

/** Edit actions for Path C */
export type EditAction = 'add-captions' | 'remove-silence' | 'remove-filler' | 'add-music' | 'add-narration' | 'add-sfx' | 'add-overlays' | 'full-edit';

/** Video style presets for Path A */
export type VideoStyle = 'cinematic' | 'anime' | 'realistic' | 'abstract' | 'social';

/** Veo duration options in seconds */
export type VeoDuration = 4 | 6 | 8;

/** First frame source option */
export type FirstFrameOption = 'none' | 'upload' | 'generate';

/** Audio strategy for Path A */
export type AudioStrategy = 'native' | 'custom';

/** Animation style for Remotion compositions */
export type AnimationStyle = 'smooth' | 'snappy' | 'cinematic' | 'playful' | 'minimal';

/** Transition types for Remotion */
export type RemotionTransition = 'fade' | 'slide' | 'wipe' | 'clockWipe' | 'flip' | 'none';

/** Background type for Remotion compositions */
export type BackgroundType = 'solid' | 'ai-generated' | 'upload' | 'transparent';

/** Caption overlay style */
export type CaptionStyle = 'tiktok' | 'subtitle-bar' | 'karaoke' | 'typewriter';

/** Lyria music model selection */
export type LyriaModel = 'lyria-3-clip' | 'lyria-3-pro' | 'lyria-2';

/** ElevenLabs voice model selection */
export type ElevenVoiceModel = 'eleven_v3' | 'eleven_multilingual_v2' | 'eleven_flash_v2_5';

/** Narration configuration */
export interface NarrationConfig {
  readonly voiceId?: string;
  readonly model?: ElevenVoiceModel;
  readonly speed?: number; // 0.7 - 1.2
  readonly script: string;
}

/** Music generation configuration */
export interface MusicGenConfig {
  readonly genre?: string;
  readonly mood?: string;
  readonly tempo?: 'slow' | 'medium' | 'fast';
  readonly instruments?: string;
  readonly withVocals?: boolean;
  readonly lyriaModel?: LyriaModel;
}

/** Sound effect configuration */
export interface SfxGenConfig {
  readonly description: string;
  readonly durationSeconds?: number; // 0.5 - 30
  readonly looping?: boolean;
  readonly promptInfluence?: number; // 0 - 1
}

/** Overlay configuration for Path C */
export interface OverlayConfig {
  readonly titleText?: string;
  readonly titlePosition?: 'top' | 'center' | 'bottom';
  readonly lowerThirdText?: string;
  readonly logoUrl?: string;
  readonly endCardCta?: string;
}

/** Post-delivery user actions */
export type DeliveryAction = 'regenerate' | 'edit-settings' | 'download-hd' | 'share' | 'rate';

/** Shared audio options collected through bot flow */
export interface SharedAudioOptions {
  readonly narration?: NarrationConfig;
  readonly music?: MusicGenConfig;
  readonly sfx?: SfxGenConfig;
  readonly captionStyle?: CaptionStyle;
  readonly generateThumbnail?: boolean;
}

/** Path A config: direct Veo video generation */
export interface PathAConfig {
  readonly path: 'ai-video';
  readonly model: VeoModel;
  readonly aspectRatio: AspectRatio;
  readonly prompt: string;
  readonly style?: VideoStyle;
  readonly durationSeconds?: VeoDuration;
  readonly firstFrameImageUrl?: string;
  readonly audioStrategy?: AudioStrategy;
  readonly resolution?: VideoResolution;
  readonly sharedAudio?: SharedAudioOptions;
}

/** Path B config: Remotion-only compositions */
export interface PathBConfig {
  readonly path: 'remotion-only';
  readonly type: RemotionVideoType;
  readonly aspectRatio: AspectRatio;
  readonly duration?: number; // seconds
  readonly fps?: 24 | 30 | 60;
  readonly resolution?: VideoResolution;
  readonly text?: string; // for text-video
  readonly images?: string[]; // for image-slideshow
  readonly data?: string; // for data-viz (CSV/JSON)
  readonly chartType?: 'bar' | 'line' | 'pie' | 'counter' | 'bar-race';
  readonly steps?: string; // for explainer (step-by-step outline)
  readonly promoDetails?: { headline?: string; tagline?: string; cta?: string; brandColors?: string; logoUrl?: string };
  readonly animationStyle?: AnimationStyle;
  readonly transition?: RemotionTransition;
  readonly backgroundType?: BackgroundType;
  readonly backgroundColor?: string; // hex for solid
  readonly backgroundImageUrl?: string; // for upload or AI-generated
  readonly theme?: 'light' | 'dark' | 'neon' | 'minimal' | 'custom';
  readonly generateAiImages?: boolean;
  readonly sharedAudio?: SharedAudioOptions;
}

/** Path C config: upload and edit */
export interface PathCConfig {
  readonly path: 'upload-edit';
  readonly action: EditAction;
  readonly actions?: EditAction[]; // for multi-select
  readonly videoUrl: string; // uploaded video URL
  readonly videoLocalPath: string; // local path to downloaded video
  readonly overlayConfig?: OverlayConfig;
  readonly narrationConfig?: NarrationConfig;
  readonly musicConfig?: MusicGenConfig;
  readonly sfxConfig?: SfxGenConfig;
  readonly captionStyle?: CaptionStyle;
}

export type PathConfig = PathAConfig | PathBConfig | PathCConfig;

// ─── Conversation State Machine (Telegram Bot) ──────────────────────────────

export type ConversationStep =
  | { step: 'idle' }
  | { step: 'path_selection' }
  // ── Path A states ──
  | { step: 'a_model_selection' }
  | { step: 'a_style_selection'; model: VeoModel }
  | { step: 'a_aspect_ratio'; model: VeoModel; style: VideoStyle }
  | { step: 'a_duration_selection'; model: VeoModel; style: VideoStyle; aspectRatio: AspectRatio }
  | { step: 'a_first_frame'; model: VeoModel; style: VideoStyle; aspectRatio: AspectRatio; durationSeconds: VeoDuration }
  | { step: 'a_first_frame_upload'; model: VeoModel; style: VideoStyle; aspectRatio: AspectRatio; durationSeconds: VeoDuration }
  | { step: 'a_first_frame_generate'; model: VeoModel; style: VideoStyle; aspectRatio: AspectRatio; durationSeconds: VeoDuration }
  | { step: 'a_awaiting_prompt'; model: VeoModel; style: VideoStyle; aspectRatio: AspectRatio; durationSeconds: VeoDuration; firstFrameImageUrl?: string }
  | { step: 'a_audio_strategy'; model: VeoModel; style: VideoStyle; aspectRatio: AspectRatio; durationSeconds: VeoDuration; firstFrameImageUrl?: string; prompt: string }
  // ── Path B states ──
  | { step: 'b_type_selection' }
  | { step: 'b_content_input'; type: RemotionVideoType }
  | { step: 'b_awaiting_text'; type: RemotionVideoType }
  | { step: 'b_collecting_images'; type: RemotionVideoType; images: string[] }
  | { step: 'b_awaiting_data'; type: RemotionVideoType }
  | { step: 'b_chart_type'; type: RemotionVideoType; data: string }
  | { step: 'b_awaiting_steps'; type: RemotionVideoType }
  | { step: 'b_awaiting_promo'; type: RemotionVideoType }
  | { step: 'b_settings'; type: RemotionVideoType; content: PathBContentPayload }
  | { step: 'b_animation_style'; type: RemotionVideoType; content: PathBContentPayload; aspectRatio: AspectRatio }
  | { step: 'b_transition'; type: RemotionVideoType; content: PathBContentPayload; aspectRatio: AspectRatio; animationStyle: AnimationStyle }
  | { step: 'b_background'; type: RemotionVideoType; content: PathBContentPayload; aspectRatio: AspectRatio; animationStyle: AnimationStyle; transition: RemotionTransition }
  | { step: 'b_bg_color_input'; type: RemotionVideoType; content: PathBContentPayload; aspectRatio: AspectRatio; animationStyle: AnimationStyle; transition: RemotionTransition }
  | { step: 'b_bg_ai_prompt'; type: RemotionVideoType; content: PathBContentPayload; aspectRatio: AspectRatio; animationStyle: AnimationStyle; transition: RemotionTransition }
  | { step: 'b_bg_upload'; type: RemotionVideoType; content: PathBContentPayload; aspectRatio: AspectRatio; animationStyle: AnimationStyle; transition: RemotionTransition }
  | { step: 'b_ai_images'; type: RemotionVideoType; content: PathBContentPayload; aspectRatio: AspectRatio; animationStyle: AnimationStyle; transition: RemotionTransition; backgroundType: BackgroundType; backgroundColor?: string; backgroundImageUrl?: string }
  // ── Path C states ──
  | { step: 'c_awaiting_video' }
  | { step: 'c_action_selection'; videoUrl: string; videoLocalPath: string; selectedActions: EditAction[] }
  | { step: 'c_overlay_input'; videoUrl: string; videoLocalPath: string; selectedActions: EditAction[] }
  | { step: 'c_narration_input'; videoUrl: string; videoLocalPath: string; selectedActions: EditAction[] }
  | { step: 'c_confirm'; videoUrl: string; videoLocalPath: string; selectedActions: EditAction[]; overlayConfig?: OverlayConfig; narrationScript?: string }
  // ── Shared audio questions (all paths merge) ──
  | { step: 'shared_narration'; preJobPayload: PreJobPayload }
  | { step: 'shared_narration_voice'; preJobPayload: PreJobPayload }
  | { step: 'shared_narration_script'; preJobPayload: PreJobPayload; voiceId: string; voiceModel: ElevenVoiceModel }
  | { step: 'shared_music'; preJobPayload: PreJobPayload; narration?: NarrationConfig }
  | { step: 'shared_music_genre'; preJobPayload: PreJobPayload; narration?: NarrationConfig }
  | { step: 'shared_music_mood'; preJobPayload: PreJobPayload; narration?: NarrationConfig; genre: string }
  | { step: 'shared_music_model'; preJobPayload: PreJobPayload; narration?: NarrationConfig; genre: string; mood: string }
  | { step: 'shared_sfx'; preJobPayload: PreJobPayload; narration?: NarrationConfig; music?: MusicGenConfig }
  | { step: 'shared_sfx_input'; preJobPayload: PreJobPayload; narration?: NarrationConfig; music?: MusicGenConfig }
  | { step: 'shared_captions'; preJobPayload: PreJobPayload; narration?: NarrationConfig; music?: MusicGenConfig; sfx?: SfxGenConfig }
  | { step: 'shared_thumbnail'; preJobPayload: PreJobPayload; narration?: NarrationConfig; music?: MusicGenConfig; sfx?: SfxGenConfig; captionStyle?: CaptionStyle }
  // ── Processing & delivery ──
  | { step: 'processing'; jobId: string }
  | { step: 'post_delivery'; jobId: string; downloadUrl: string; preJobPayload?: PreJobPayload }
  | { step: 'rating'; jobId: string };

/** Intermediate content payload for Path B before settings */
export interface PathBContentPayload {
  readonly text?: string;
  readonly images?: string[];
  readonly data?: string;
  readonly chartType?: string;
  readonly steps?: string;
  readonly promoDetails?: { headline?: string; tagline?: string; cta?: string; brandColors?: string; logoUrl?: string };
}

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
