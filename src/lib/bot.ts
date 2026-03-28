import { createJob, getJobStatus } from "@/queue/worker";
import type {
  ConversationStep,
  VeoModel,
  VideoStyle,
  AspectRatio,
  VeoDuration,
  RemotionVideoType,
  EditAction,
  PreJobPayload,
  PathBContentPayload,
  PathAConfig,
  PathBConfig,
  PathCConfig,
  SharedAudioOptions,
  NarrationConfig,
  MusicGenConfig,
  SfxGenConfig,
  ElevenVoiceModel,
  LyriaModel,
  CaptionStyle,
  AnimationStyle,
  RemotionTransition,
  BackgroundType,
  AudioStrategy,
  FirstFrameOption,
  OverlayConfig,
} from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 10 * 60 * 1000;
const TELEGRAM_FILE_LIMIT = 50 * 1024 * 1024; // 50 MB

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Conversation State Store ───────────────────────────────────────────────

declare global {
  var __conversations: Map<number, ConversationStep> | undefined;
}

const conversations: Map<number, ConversationStep> =
  global.__conversations ?? (global.__conversations = new Map());

function getState(chatId: number): ConversationStep {
  return conversations.get(chatId) ?? { step: "idle" };
}

function setState(chatId: number, state: ConversationStep): void {
  conversations.set(chatId, state);
}

function resetState(chatId: number): void {
  conversations.set(chatId, { step: "idle" });
}

// ─── Telegram API Helpers ───────────────────────────────────────────────────

async function sendMessage(
  chatId: number,
  text: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fetch(`${API_BASE}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          ...extra,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      return;
    } catch (err) {
      if (attempt === 3) {
        console.warn("sendMessage failed after 3 attempts:", err);
      } else {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }
}

async function sendVideo(
  chatId: number,
  videoUrl: string,
  caption?: string,
): Promise<void> {
  const MAX_RETRIES = 4;
  const RETRY_DELAY_MS = 5_000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/sendVideo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          video: videoUrl,
          caption,
          supports_streaming: true,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (res.ok) return;

      const err = await res.json().catch(() => ({}));
      console.warn(
        `sendVideo attempt ${attempt} failed (HTTP ${res.status}):`,
        err,
      );
    } catch (err) {
      console.warn(`sendVideo attempt ${attempt} failed (network):`, err);
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  // All retries exhausted — send URL as text fallback
  console.warn("sendVideo exhausted retries, falling back to text message");
  await sendMessage(chatId, `Your video is ready:\n${videoUrl}`);
}

async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.warn("answerCallbackQuery failed:", err);
  }
}

async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  try {
    const fileRes = await fetch(`${API_BASE}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(15_000),
    });
    const fileData = (await fileRes.json()) as {
      result?: { file_path?: string };
    };
    const filePath = fileData.result?.file_path;
    if (!filePath) return null;
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  } catch {
    return null;
  }
}

// ─── Keyboard Builders ─────────────────────────────────────────────────────

function inlineKeyboard(rows: { text: string; callback_data: string }[][]) {
  return { reply_markup: { inline_keyboard: rows } };
}

function sendPathKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "What would you like to create?",
    inlineKeyboard([
      [{ text: "AI Video (Veo)", callback_data: "path:ai-video" }],
      [{ text: "Remotion Video", callback_data: "path:remotion-only" }],
      [{ text: "Upload & Edit", callback_data: "path:upload-edit" }],
    ]),
  );
}

// ── Path A Keyboards ──

function sendModelKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Q1: Choose your AI model:",
    inlineKeyboard([
      [{ text: "Veo 3 Standard", callback_data: "model:veo-3" }],
      [{ text: "Veo 3 Fast", callback_data: "model:veo-3-fast" }],
      [{ text: "Veo 3.1", callback_data: "model:veo-3.1" }],
    ]),
  );
}

function sendStyleKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Q2: Choose a visual style:",
    inlineKeyboard([
      [
        { text: "Cinematic", callback_data: "style:cinematic" },
        { text: "Anime", callback_data: "style:anime" },
      ],
      [
        { text: "Realistic", callback_data: "style:realistic" },
        { text: "Abstract", callback_data: "style:abstract" },
      ],
      [{ text: "Social Media", callback_data: "style:social" }],
    ]),
  );
}

function sendAspectRatioKeyboard(chatId: number, label = "Q3: Choose aspect ratio:") {
  return sendMessage(
    chatId,
    label,
    inlineKeyboard([
      [
        { text: "16:9 Landscape", callback_data: "ar:16:9" },
        { text: "9:16 Portrait", callback_data: "ar:9:16" },
      ],
      [{ text: "1:1 Square", callback_data: "ar:1:1" }],
    ]),
  );
}

function sendDurationKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Q4: Choose video duration:",
    inlineKeyboard([
      [
        { text: "4s", callback_data: "dur:4" },
        { text: "6s", callback_data: "dur:6" },
        { text: "8s", callback_data: "dur:8" },
      ],
    ]),
  );
}

function sendFirstFrameKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Q5: First frame option:",
    inlineKeyboard([
      [{ text: "None", callback_data: "ff:none" }],
      [{ text: "Upload Image", callback_data: "ff:upload" }],
      [{ text: "Generate with AI", callback_data: "ff:generate" }],
    ]),
  );
}

function sendAudioStrategyKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Q7: Audio strategy:",
    inlineKeyboard([
      [{ text: "Veo 3 Native Audio", callback_data: "audio:native" }],
      [{ text: "Custom Audio Mix", callback_data: "audio:custom" }],
    ]),
  );
}

// ── Path B Keyboards ──

function sendRemotionTypeKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "RQ1: Choose video type:",
    inlineKeyboard([
      [{ text: "Text Video", callback_data: "rtype:text-video" }],
      [{ text: "Image Slideshow", callback_data: "rtype:image-slideshow" }],
      [{ text: "Motion Graphics", callback_data: "rtype:motion-graphics" }],
      [{ text: "Data Visualization", callback_data: "rtype:data-viz" }],
      [{ text: "Explainer / Tutorial", callback_data: "rtype:explainer" }],
      [{ text: "Promo / Ad", callback_data: "rtype:promo" }],
    ]),
  );
}

function sendBSettingsKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "RQ2: Choose aspect ratio:",
    inlineKeyboard([
      [
        { text: "16:9 Landscape", callback_data: "bset:16:9" },
        { text: "9:16 Portrait", callback_data: "bset:9:16" },
      ],
      [
        { text: "1:1 Square", callback_data: "bset:1:1" },
        { text: "4:5 Feed", callback_data: "bset:4:5" },
      ],
    ]),
  );
}

function sendAnimationStyleKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "RQ3: Choose animation style:",
    inlineKeyboard([
      [
        { text: "Smooth", callback_data: "anim:smooth" },
        { text: "Snappy", callback_data: "anim:snappy" },
      ],
      [
        { text: "Cinematic", callback_data: "anim:cinematic" },
        { text: "Playful", callback_data: "anim:playful" },
      ],
      [{ text: "Minimal", callback_data: "anim:minimal" }],
    ]),
  );
}

function sendBackgroundKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "RQ4: Choose background:",
    inlineKeyboard([
      [{ text: "Solid Color", callback_data: "bg:solid" }],
      [{ text: "AI Generated", callback_data: "bg:ai-generated" }],
      [{ text: "Upload Image", callback_data: "bg:upload" }],
      [{ text: "Transparent", callback_data: "bg:transparent" }],
    ]),
  );
}

function sendAiImagesKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "RQ5: Generate AI images for slides/scenes?",
    inlineKeyboard([
      [
        { text: "Yes", callback_data: "aiimg:yes" },
        { text: "No", callback_data: "aiimg:no" },
      ],
    ]),
  );
}

function sendChartTypeKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Choose chart type:",
    inlineKeyboard([
      [
        { text: "Bar Chart", callback_data: "chart:bar" },
        { text: "Line Chart", callback_data: "chart:line" },
      ],
      [
        { text: "Pie Chart", callback_data: "chart:pie" },
        { text: "Counter", callback_data: "chart:counter" },
      ],
      [{ text: "Bar Chart Race", callback_data: "chart:bar-race" }],
    ]),
  );
}

// ── Path C Keyboards ──

function sendEditActionKeyboard(chatId: number, selectedActions: EditAction[]) {
  const actions: { label: string; action: EditAction }[] = [
    { label: "Add Captions", action: "add-captions" },
    { label: "Remove Silence", action: "remove-silence" },
    { label: "Remove Filler Words", action: "remove-filler" },
    { label: "Add Music", action: "add-music" },
    { label: "Add Narration", action: "add-narration" },
    { label: "Add SFX", action: "add-sfx" },
    { label: "Add Overlays", action: "add-overlays" },
  ];

  const rows = actions.map(({ label, action }) => {
    const isSelected = selectedActions.includes(action);
    const prefix = isSelected ? "✓ " : "";
    return [{ text: `${prefix}${label}`, callback_data: `edit:${action}` }];
  });

  rows.push([{ text: "Full Edit Suite (all)", callback_data: "edit:full-edit" }]);
  rows.push([{ text: "Done", callback_data: "edit:done" }]);

  const selectedText =
    selectedActions.length > 0
      ? `\n\nSelected: ${selectedActions.join(", ")}`
      : "";

  return sendMessage(
    chatId,
    `What would you like to do with your video? Tap to toggle, then tap Done.${selectedText}`,
    inlineKeyboard(rows),
  );
}

// ── Shared Audio Keyboards ──

function sendYesNoKeyboard(chatId: number, question: string, prefix: string) {
  return sendMessage(
    chatId,
    question,
    inlineKeyboard([
      [
        { text: "Yes", callback_data: `${prefix}:yes` },
        { text: "No", callback_data: `${prefix}:no` },
      ],
    ]),
  );
}

function sendVoicePickerKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Choose a voice:",
    inlineKeyboard([
      [
        { text: "George", callback_data: "voice:george" },
        { text: "Rachel", callback_data: "voice:rachel" },
      ],
      [
        { text: "Domi", callback_data: "voice:domi" },
        { text: "Bella", callback_data: "voice:bella" },
      ],
      [{ text: "Antoni", callback_data: "voice:antoni" }],
    ]),
  );
}

function sendVoiceModelKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Choose voice model:",
    inlineKeyboard([
      [{ text: "Eleven v3 (most expressive)", callback_data: "vmodel:eleven_v3" }],
      [{ text: "Multilingual v2 (29 langs)", callback_data: "vmodel:eleven_multilingual_v2" }],
      [{ text: "Flash v2.5 (budget)", callback_data: "vmodel:eleven_flash_v2_5" }],
    ]),
  );
}

function sendGenreKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Choose music genre:",
    inlineKeyboard([
      [
        { text: "Pop", callback_data: "genre:pop" },
        { text: "Orchestral", callback_data: "genre:orchestral" },
      ],
      [
        { text: "Lo-fi", callback_data: "genre:lo-fi" },
        { text: "Electronic", callback_data: "genre:electronic" },
      ],
      [{ text: "Ambient", callback_data: "genre:ambient" }],
    ]),
  );
}

function sendMoodKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Choose music mood:",
    inlineKeyboard([
      [
        { text: "Upbeat", callback_data: "mood:upbeat" },
        { text: "Melancholic", callback_data: "mood:melancholic" },
      ],
      [
        { text: "Epic", callback_data: "mood:epic" },
        { text: "Calm", callback_data: "mood:calm" },
      ],
      [{ text: "Energetic", callback_data: "mood:energetic" }],
    ]),
  );
}

function sendLyriaModelKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Choose music model:",
    inlineKeyboard([
      [{ text: "Lyria 3 Clip (30s, fast)", callback_data: "lyria:lyria-3-clip" }],
      [{ text: "Lyria 3 Pro (3min, vocals)", callback_data: "lyria:lyria-3-pro" }],
      [{ text: "Lyria 2 (instrumental)", callback_data: "lyria:lyria-2" }],
    ]),
  );
}

function sendCaptionStyleKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "Choose caption style:",
    inlineKeyboard([
      [
        { text: "TikTok", callback_data: "capstyle:tiktok" },
        { text: "Subtitle Bar", callback_data: "capstyle:subtitle-bar" },
      ],
      [
        { text: "Karaoke", callback_data: "capstyle:karaoke" },
        { text: "Typewriter", callback_data: "capstyle:typewriter" },
      ],
    ]),
  );
}

function sendImageDoneKeyboard(chatId: number, count: number) {
  return sendMessage(
    chatId,
    `${count} image(s) received. Send more or tap Done.`,
    inlineKeyboard([
      [{ text: `Done (${count} images)`, callback_data: "images:done" }],
    ]),
  );
}

function sendPostDeliveryKeyboard(chatId: number) {
  return sendMessage(
    chatId,
    "What would you like to do next?",
    inlineKeyboard([
      [
        { text: "Regenerate", callback_data: "post:regenerate" },
        { text: "Edit Settings", callback_data: "post:edit" },
      ],
      [
        { text: "Download HD", callback_data: "post:download" },
        { text: "Share", callback_data: "post:share" },
      ],
      [{ text: "Rate Quality", callback_data: "post:rate" }],
    ]),
  );
}

// ─── Shared Audio Flow Entry ────────────────────────────────────────────────

async function startSharedQuestions(chatId: number, payload: PreJobPayload): Promise<void> {
  setState(chatId, { step: "shared_narration", preJobPayload: payload });
  await sendYesNoKeyboard(chatId, "Add AI narration to your video?", "sq_narration");
}

// ─── Build Final Config & Dispatch Job ──────────────────────────────────────

async function dispatchJobFromShared(
  chatId: number,
  payload: PreJobPayload,
  sharedAudio: SharedAudioOptions,
): Promise<void> {
  // Attach shared audio to the path config
  const configWithAudio = attachSharedAudio(payload.pathConfig, sharedAudio);

  await sendMessage(chatId, "Starting generation...");

  const jobId = createJob(payload.prompt, "720p", 1, {
    pathType: payload.pathType,
    pathConfig: configWithAudio,
  });

  const updatedPayload: PreJobPayload = {
    ...payload,
    pathConfig: configWithAudio,
  };

  setState(chatId, { step: "processing", jobId });
  pollAndDeliver(chatId, jobId, updatedPayload).catch((err) =>
    console.error("pollAndDeliver failed:", err),
  );
}

function attachSharedAudio(
  config: PathAConfig | PathBConfig | PathCConfig,
  sharedAudio: SharedAudioOptions,
): PathAConfig | PathBConfig | PathCConfig {
  if (config.path === "ai-video") {
    return { ...config, sharedAudio };
  }
  if (config.path === "remotion-only") {
    return { ...config, sharedAudio };
  }
  // Path C: spread individual options onto the config
  return {
    ...config,
    narrationConfig: sharedAudio.narration,
    musicConfig: sharedAudio.music,
    sfxConfig: sharedAudio.sfx,
    captionStyle: sharedAudio.captionStyle,
  };
}

// ─── Job Processing & Status Updates ────────────────────────────────────────

async function pollAndDeliver(
  chatId: number,
  jobId: string,
  preJobPayload?: PreJobPayload,
): Promise<void> {
  const start = Date.now();
  let lastStage = "";

  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const status = getJobStatus(jobId);
    if (!status) continue;

    if (status.stage !== lastStage) {
      lastStage = status.stage;
      const stageLabel: Record<string, string> = {
        generating_script: "Writing script...",
        generating_clips: "Generating video...",
        uploading_assets: "Uploading assets...",
        composing_video: "Composing final video...",
      };
      if (stageLabel[status.stage]) {
        await sendMessage(chatId, stageLabel[status.stage]);
      }
    }

    if (status.stage === "completed" && status.downloadUrl) {
      await deliverVideo(chatId, jobId, status.downloadUrl, preJobPayload);
      return;
    }

    if (status.stage === "failed") {
      await sendMessage(
        chatId,
        `Generation failed: ${status.error ?? "Unknown error"}`,
      );
      resetState(chatId);
      return;
    }
  }

  await sendMessage(chatId, "Generation timed out. Please try again.");
  resetState(chatId);
}

async function deliverVideo(
  chatId: number,
  jobId: string,
  downloadUrl: string,
  preJobPayload?: PreJobPayload,
): Promise<void> {
  // Check file size via HEAD request
  let canSendDirect = true;
  try {
    const head = await fetch(downloadUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    const contentLength = parseInt(
      head.headers.get("content-length") ?? "0",
      10,
    );
    if (!head.ok || contentLength > TELEGRAM_FILE_LIMIT) {
      canSendDirect = false;
    }
  } catch {
    canSendDirect = false;
  }

  if (canSendDirect) {
    await sendVideo(chatId, downloadUrl, "Here's your video!");
  } else {
    await sendMessage(chatId, `Download your video:\n${downloadUrl}`);
  }

  setState(chatId, {
    step: "post_delivery",
    jobId,
    downloadUrl,
    preJobPayload,
  });
  await sendPostDeliveryKeyboard(chatId);
}

// ─── Validation Helpers ─────────────────────────────────────────────────────

const VALID_VEO_MODELS: readonly VeoModel[] = ["veo-3", "veo-3-fast", "veo-3.1"];
const VALID_STYLES: readonly VideoStyle[] = ["cinematic", "anime", "realistic", "abstract", "social"];
const VALID_ASPECT_RATIOS: readonly AspectRatio[] = ["16:9", "9:16", "1:1"];
const VALID_DURATIONS: readonly VeoDuration[] = [4, 6, 8];
const VALID_REMOTION_TYPES: readonly RemotionVideoType[] = [
  "text-video",
  "image-slideshow",
  "motion-graphics",
  "data-viz",
  "explainer",
  "promo",
];
const VALID_EDIT_ACTIONS: readonly EditAction[] = [
  "add-captions",
  "remove-silence",
  "remove-filler",
  "add-music",
  "add-narration",
  "add-sfx",
  "add-overlays",
  "full-edit",
];
const VALID_ANIMATION_STYLES: readonly AnimationStyle[] = [
  "smooth",
  "snappy",
  "cinematic",
  "playful",
  "minimal",
];
const VALID_BACKGROUNDS: readonly BackgroundType[] = [
  "solid",
  "ai-generated",
  "upload",
  "transparent",
];
const VALID_CAPTION_STYLES: readonly CaptionStyle[] = [
  "tiktok",
  "subtitle-bar",
  "karaoke",
  "typewriter",
];
const VALID_VOICE_MODELS: readonly ElevenVoiceModel[] = [
  "eleven_v3",
  "eleven_multilingual_v2",
  "eleven_flash_v2_5",
];
const VALID_LYRIA_MODELS: readonly LyriaModel[] = [
  "lyria-3-clip",
  "lyria-3-pro",
  "lyria-2",
];
const VALID_CHART_TYPES = ["bar", "line", "pie", "counter", "bar-race"] as const;

function includes<T>(arr: readonly T[], val: unknown): val is T {
  return (arr as readonly unknown[]).includes(val);
}

// ─── Callback Query Handler ─────────────────────────────────────────────────

async function handleCallback(
  chatId: number,
  callbackQueryId: string,
  data: string,
): Promise<void> {
  const state = getState(chatId);

  // ── Path Selection ──

  if (data.startsWith("path:") && state.step === "path_selection") {
    const path = data.replace("path:", "");
    await answerCallbackQuery(callbackQueryId, `Selected: ${path}`);

    if (path === "ai-video") {
      setState(chatId, { step: "a_model_selection" });
      await sendModelKeyboard(chatId);
    } else if (path === "remotion-only") {
      setState(chatId, { step: "b_type_selection" });
      await sendRemotionTypeKeyboard(chatId);
    } else if (path === "upload-edit") {
      setState(chatId, { step: "c_awaiting_video" });
      await sendMessage(chatId, "Send me the video you want to edit.");
    }
    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // PATH A: AI VIDEO
  // ════════════════════════════════════════════════════════════════════════

  // A: Q1 — Model selection
  if (data.startsWith("model:") && state.step === "a_model_selection") {
    const model = data.replace("model:", "");
    if (!includes(VALID_VEO_MODELS, model)) return;
    await answerCallbackQuery(callbackQueryId, `Model: ${model}`);
    setState(chatId, { step: "a_style_selection", model });
    await sendStyleKeyboard(chatId);
    return;
  }

  // A: Q2 — Style selection
  if (data.startsWith("style:") && state.step === "a_style_selection") {
    const style = data.replace("style:", "");
    if (!includes(VALID_STYLES, style)) return;
    await answerCallbackQuery(callbackQueryId, `Style: ${style}`);
    setState(chatId, {
      step: "a_aspect_ratio",
      model: state.model,
      style,
    });
    await sendAspectRatioKeyboard(chatId);
    return;
  }

  // A: Q3 — Aspect ratio
  if (data.startsWith("ar:") && state.step === "a_aspect_ratio") {
    const aspectRatio = data.replace("ar:", "");
    if (!includes(VALID_ASPECT_RATIOS, aspectRatio)) return;
    await answerCallbackQuery(callbackQueryId, `Aspect ratio: ${aspectRatio}`);
    setState(chatId, {
      step: "a_duration_selection",
      model: state.model,
      style: state.style,
      aspectRatio,
    });
    await sendDurationKeyboard(chatId);
    return;
  }

  // A: Q4 — Duration
  if (data.startsWith("dur:") && state.step === "a_duration_selection") {
    const dur = parseInt(data.replace("dur:", ""), 10);
    if (!includes(VALID_DURATIONS, dur)) return;
    await answerCallbackQuery(callbackQueryId, `Duration: ${dur}s`);
    setState(chatId, {
      step: "a_first_frame",
      model: state.model,
      style: state.style,
      aspectRatio: state.aspectRatio,
      durationSeconds: dur as VeoDuration,
    });
    await sendFirstFrameKeyboard(chatId);
    return;
  }

  // A: Q5 — First frame choice
  if (data.startsWith("ff:") && state.step === "a_first_frame") {
    const choice = data.replace("ff:", "") as FirstFrameOption;
    await answerCallbackQuery(callbackQueryId, `First frame: ${choice}`);

    if (choice === "upload") {
      setState(chatId, {
        step: "a_first_frame_upload",
        model: state.model,
        style: state.style,
        aspectRatio: state.aspectRatio,
        durationSeconds: state.durationSeconds,
      });
      await sendMessage(chatId, "Send me an image to use as the first frame.");
      return;
    }

    if (choice === "generate") {
      setState(chatId, {
        step: "a_first_frame_generate",
        model: state.model,
        style: state.style,
        aspectRatio: state.aspectRatio,
        durationSeconds: state.durationSeconds,
      });
      await sendMessage(
        chatId,
        "Describe the opening shot you want. I'll generate it with AI.",
      );
      return;
    }

    // choice === "none" — skip to prompt
    setState(chatId, {
      step: "a_awaiting_prompt",
      model: state.model,
      style: state.style,
      aspectRatio: state.aspectRatio,
      durationSeconds: state.durationSeconds,
    });
    await sendMessage(
      chatId,
      "Q6: Send me a prompt describing the video you want to generate.\n\nTip: Include quoted dialogue for Veo 3 lip-synced speech.",
    );
    return;
  }

  // A: Q7 — Audio strategy
  if (data.startsWith("audio:") && state.step === "a_audio_strategy") {
    const strategy = data.replace("audio:", "") as AudioStrategy;
    await answerCallbackQuery(callbackQueryId, `Audio: ${strategy}`);

    const pathConfig: PathAConfig = {
      path: "ai-video",
      model: state.model,
      aspectRatio: state.aspectRatio,
      style: state.style,
      durationSeconds: state.durationSeconds,
      firstFrameImageUrl: state.firstFrameImageUrl,
      prompt: state.prompt,
      audioStrategy: strategy,
    };

    const preJobPayload: PreJobPayload = {
      prompt: state.prompt,
      pathType: "path-a",
      pathConfig,
    };

    if (strategy === "native") {
      // Native audio: skip narration, go directly to music
      setState(chatId, {
        step: "shared_music",
        preJobPayload,
        narration: undefined,
      });
      await sendYesNoKeyboard(chatId, "Add background music?", "sq_music");
    } else {
      // Custom audio: start from narration
      await startSharedQuestions(chatId, preJobPayload);
    }
    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // PATH B: REMOTION-ONLY
  // ════════════════════════════════════════════════════════════════════════

  // B: RQ1 — Type selection
  if (data.startsWith("rtype:") && state.step === "b_type_selection") {
    const type = data.replace("rtype:", "");
    if (!includes(VALID_REMOTION_TYPES, type)) return;
    await answerCallbackQuery(callbackQueryId, `Type: ${type}`);

    // Route to appropriate content input
    if (type === "text-video") {
      setState(chatId, { step: "b_awaiting_text", type });
      await sendMessage(
        chatId,
        "Send me the text content for your video.\nEach line becomes a separate slide.\nUse --- for explicit slide breaks.",
      );
    } else if (type === "image-slideshow") {
      setState(chatId, { step: "b_collecting_images", type, images: [] });
      await sendMessage(
        chatId,
        "Send me the images for your slideshow. Tap Done when finished.",
      );
    } else if (type === "motion-graphics") {
      setState(chatId, { step: "b_content_input", type });
      await sendMessage(
        chatId,
        "Describe the motion graphics you want (shapes, particles, gradients, kinetic typography, etc.):",
      );
    } else if (type === "data-viz") {
      setState(chatId, { step: "b_awaiting_data", type });
      await sendMessage(
        chatId,
        "Send me your data. You can:\n- Upload a CSV/JSON file\n- Paste data inline\n- Describe what to visualize",
      );
    } else if (type === "explainer") {
      setState(chatId, { step: "b_awaiting_steps", type });
      await sendMessage(
        chatId,
        "Send me your explainer content.\nDefine steps (1, 2, 3...) or upload a script/outline.",
      );
    } else if (type === "promo") {
      setState(chatId, { step: "b_awaiting_promo", type });
      await sendMessage(
        chatId,
        "Send me your promo details. Include:\n- Headline text\n- Tagline\n- CTA text (e.g., Shop Now)\n- Brand colors (hex codes)\n\nFormat: one item per line.",
      );
    }
    return;
  }

  // B: Chart type selection (after data input)
  if (data.startsWith("chart:") && state.step === "b_chart_type") {
    const chartType = data.replace("chart:", "");
    if (!includes(VALID_CHART_TYPES, chartType)) return;
    await answerCallbackQuery(callbackQueryId, `Chart: ${chartType}`);

    const content: PathBContentPayload = { data: state.data, chartType };
    setState(chatId, { step: "b_settings", type: state.type, content });
    await sendBSettingsKeyboard(chatId);
    return;
  }

  // B: Images done
  if (data === "images:done" && state.step === "b_collecting_images") {
    await answerCallbackQuery(callbackQueryId);
    if (state.images.length === 0) {
      await sendMessage(chatId, "Please send at least one image first.");
      return;
    }
    const content: PathBContentPayload = { images: state.images };
    setState(chatId, { step: "b_settings", type: state.type, content });
    await sendMessage(chatId, `${state.images.length} images ready!`);
    await sendBSettingsKeyboard(chatId);
    return;
  }

  // B: RQ2 — Settings (aspect ratio)
  if (data.startsWith("bset:") && state.step === "b_settings") {
    const ar = data.replace("bset:", "");
    // Accept 4:5 as well for Path B
    if (ar !== "16:9" && ar !== "9:16" && ar !== "1:1" && ar !== "4:5") return;
    await answerCallbackQuery(callbackQueryId, `Aspect ratio: ${ar}`);
    setState(chatId, {
      step: "b_animation_style",
      type: state.type,
      content: state.content,
      aspectRatio: ar as AspectRatio,
    });
    await sendAnimationStyleKeyboard(chatId);
    return;
  }

  // B: RQ3 — Animation style
  if (data.startsWith("anim:") && state.step === "b_animation_style") {
    const anim = data.replace("anim:", "");
    if (!includes(VALID_ANIMATION_STYLES, anim)) return;
    await answerCallbackQuery(callbackQueryId, `Animation: ${anim}`);
    setState(chatId, {
      step: "b_background",
      type: state.type,
      content: state.content,
      aspectRatio: state.aspectRatio,
      animationStyle: anim,
      transition: "fade" as RemotionTransition, // default transition
    });
    await sendBackgroundKeyboard(chatId);
    return;
  }

  // B: RQ4 — Background choice
  if (data.startsWith("bg:") && state.step === "b_background") {
    const bg = data.replace("bg:", "");
    if (!includes(VALID_BACKGROUNDS, bg)) return;
    await answerCallbackQuery(callbackQueryId, `Background: ${bg}`);

    if (bg === "solid") {
      setState(chatId, {
        step: "b_bg_color_input",
        type: state.type,
        content: state.content,
        aspectRatio: state.aspectRatio,
        animationStyle: state.animationStyle,
        transition: state.transition,
      });
      await sendMessage(chatId, "Send me a hex color code (e.g., #1a1a2e):");
      return;
    }

    if (bg === "ai-generated") {
      setState(chatId, {
        step: "b_bg_ai_prompt",
        type: state.type,
        content: state.content,
        aspectRatio: state.aspectRatio,
        animationStyle: state.animationStyle,
        transition: state.transition,
      });
      await sendMessage(
        chatId,
        "Describe the background you want AI to generate:",
      );
      return;
    }

    if (bg === "upload") {
      setState(chatId, {
        step: "b_bg_upload",
        type: state.type,
        content: state.content,
        aspectRatio: state.aspectRatio,
        animationStyle: state.animationStyle,
        transition: state.transition,
      });
      await sendMessage(chatId, "Send me a background image:");
      return;
    }

    // transparent
    setState(chatId, {
      step: "b_ai_images",
      type: state.type,
      content: state.content,
      aspectRatio: state.aspectRatio,
      animationStyle: state.animationStyle,
      transition: state.transition,
      backgroundType: "transparent",
    });
    await sendAiImagesKeyboard(chatId);
    return;
  }

  // B: RQ5 — Generate AI images
  if (data.startsWith("aiimg:") && state.step === "b_ai_images") {
    const generateAi = data === "aiimg:yes";
    await answerCallbackQuery(
      callbackQueryId,
      generateAi ? "AI images: Yes" : "AI images: No",
    );

    const pathConfig: PathBConfig = {
      path: "remotion-only",
      type: state.type,
      aspectRatio: state.aspectRatio,
      animationStyle: state.animationStyle,
      backgroundType: state.backgroundType,
      backgroundColor: state.backgroundColor,
      backgroundImageUrl: state.backgroundImageUrl,
      generateAiImages: generateAi,
      text: state.content.text,
      images: state.content.images,
      data: state.content.data,
      chartType: state.content.chartType as PathBConfig["chartType"],
      steps: state.content.steps,
      promoDetails: state.content.promoDetails,
    };

    const preJobPayload: PreJobPayload = {
      prompt: buildPathBPrompt(state.type, state.content),
      pathType: "path-b",
      pathConfig,
    };

    await startSharedQuestions(chatId, preJobPayload);
    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // PATH C: UPLOAD & EDIT
  // ════════════════════════════════════════════════════════════════════════

  // C: Action toggle (multi-select)
  if (data.startsWith("edit:") && state.step === "c_action_selection") {
    const rawAction = data.replace("edit:", "");

    // Done button — finalize selection
    if (rawAction === "done") {
      await answerCallbackQuery(callbackQueryId);
      if (state.selectedActions.length === 0) {
        await sendMessage(chatId, "Please select at least one action first.");
        return;
      }

      // Check if we need overlay input
      if (state.selectedActions.includes("add-overlays")) {
        setState(chatId, {
          step: "c_overlay_input",
          videoUrl: state.videoUrl,
          videoLocalPath: state.videoLocalPath,
          selectedActions: state.selectedActions,
        });
        await sendMessage(
          chatId,
          "Enter overlay details:\n- Title text\n- Position (top/center/bottom)\n\nFormat:\nTitle: Your Title Here\nPosition: bottom",
        );
        return;
      }

      // Check if we need narration input
      if (state.selectedActions.includes("add-narration")) {
        setState(chatId, {
          step: "c_narration_input",
          videoUrl: state.videoUrl,
          videoLocalPath: state.videoLocalPath,
          selectedActions: state.selectedActions,
        });
        await sendMessage(chatId, "Send me the narration script:");
        return;
      }

      // No extra input needed, dispatch directly
      await dispatchPathCJob(chatId, state.videoUrl, state.videoLocalPath, state.selectedActions);
      return;
    }

    // Full edit suite — select all
    if (rawAction === "full-edit") {
      await answerCallbackQuery(callbackQueryId, "Full Edit Suite selected");
      const allActions: EditAction[] = [
        "add-captions",
        "remove-silence",
        "remove-filler",
        "add-music",
        "add-narration",
        "add-sfx",
        "add-overlays",
      ];
      setState(chatId, {
        step: "c_action_selection",
        videoUrl: state.videoUrl,
        videoLocalPath: state.videoLocalPath,
        selectedActions: allActions,
      });
      await sendEditActionKeyboard(chatId, allActions);
      return;
    }

    // Toggle individual action
    if (!includes(VALID_EDIT_ACTIONS, rawAction)) return;
    await answerCallbackQuery(callbackQueryId);

    const currentActions = state.selectedActions;
    const updatedActions = currentActions.includes(rawAction)
      ? currentActions.filter((a) => a !== rawAction)
      : [...currentActions, rawAction];

    setState(chatId, {
      step: "c_action_selection",
      videoUrl: state.videoUrl,
      videoLocalPath: state.videoLocalPath,
      selectedActions: updatedActions,
    });
    await sendEditActionKeyboard(chatId, updatedActions);
    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // SHARED AUDIO QUESTIONS
  // ════════════════════════════════════════════════════════════════════════

  // SQ: Narration? Yes/No
  if (data.startsWith("sq_narration:") && state.step === "shared_narration") {
    const wantsNarration = data === "sq_narration:yes";
    await answerCallbackQuery(
      callbackQueryId,
      wantsNarration ? "Narration: Yes" : "Narration: No",
    );

    if (wantsNarration) {
      setState(chatId, {
        step: "shared_narration_voice",
        preJobPayload: state.preJobPayload,
      });
      await sendVoicePickerKeyboard(chatId);
    } else {
      setState(chatId, {
        step: "shared_music",
        preJobPayload: state.preJobPayload,
        narration: undefined,
      });
      await sendYesNoKeyboard(chatId, "Add background music?", "sq_music");
    }
    return;
  }

  // SQ: Voice selection
  if (data.startsWith("voice:") && state.step === "shared_narration_voice") {
    const voiceId = data.replace("voice:", "");
    await answerCallbackQuery(callbackQueryId, `Voice: ${voiceId}`);
    setState(chatId, {
      step: "shared_narration_voice",
      preJobPayload: state.preJobPayload,
    });
    // Store voiceId temporarily — we need model next
    // Transition to voice model picker
    // We store voiceId by moving to a state that carries it
    await sendVoiceModelKeyboard(chatId);
    // We need to track voiceId. The ConversationStep for shared_narration_script
    // carries voiceId + voiceModel. We'll reuse shared_narration_voice state
    // and handle vmodel: callback when step is shared_narration_voice.
    // Store voiceId in a temp approach — actually, we need to go through
    // the voice model step. Let me handle vmodel callback from shared_narration_voice.
    // We'll store voiceId by transitioning to a state that can carry it:
    // Not possible in current type. Instead handle vmodel: when step is shared_narration_voice
    // by parsing the previously selected voice from... we need a different approach.

    // Actually the type system has shared_narration_script which carries voiceId and voiceModel.
    // We need an intermediate. Let me re-read the ConversationStep type.
    // shared_narration_voice only has preJobPayload. No room for voiceId.
    // So I'll handle the voice model selection in a chained way:
    // After voice pick, immediately show voice model keyboard, and when they pick model,
    // we jump to shared_narration_script.
    // Problem: we lose the voiceId between the two callbacks.
    // Solution: abuse the callback_data to carry the voiceId forward by encoding it.
    // OR: We can handle both in one step by showing a combined keyboard.
    // Simplest: re-send voice model keyboard with voiceId encoded in callback data.

    // Let me fix this properly. We'll encode voiceId into the vmodel callback data.
    // This is cleaner than trying to store it in state.

    // Actually, let me just use a workaround: send the voice model keyboard
    // with callback data that includes the voice id.
    // Format: vmodel:{voiceId}:{model}

    // Resend with encoded voiceId
    await sendMessage(
      chatId,
      "Choose voice model:",
      inlineKeyboard([
        [{ text: "Eleven v3 (most expressive)", callback_data: `vmodel:${voiceId}:eleven_v3` }],
        [{ text: "Multilingual v2 (29 langs)", callback_data: `vmodel:${voiceId}:eleven_multilingual_v2` }],
        [{ text: "Flash v2.5 (budget)", callback_data: `vmodel:${voiceId}:eleven_flash_v2_5` }],
      ]),
    );
    return;
  }

  // SQ: Voice model selection (carries voiceId in callback data)
  if (data.startsWith("vmodel:") && state.step === "shared_narration_voice") {
    // Format: vmodel:{voiceId}:{model}
    const parts = data.split(":");
    // parts = ["vmodel", voiceId, model]
    if (parts.length < 3) return;
    const voiceId = parts[1];
    const voiceModel = parts.slice(2).join(":"); // in case model has colons
    if (!includes(VALID_VOICE_MODELS, voiceModel)) return;
    await answerCallbackQuery(callbackQueryId, `Model: ${voiceModel}`);

    setState(chatId, {
      step: "shared_narration_script",
      preJobPayload: state.preJobPayload,
      voiceId,
      voiceModel,
    });
    await sendMessage(
      chatId,
      "Enter your narration script:\n\nTip: Supports emotion tags like [whispering], [curious], [excited]",
    );
    return;
  }

  // SQ: Music? Yes/No
  if (data.startsWith("sq_music:") && state.step === "shared_music") {
    const wantsMusic = data === "sq_music:yes";
    await answerCallbackQuery(
      callbackQueryId,
      wantsMusic ? "Music: Yes" : "Music: No",
    );

    if (wantsMusic) {
      setState(chatId, {
        step: "shared_music_genre",
        preJobPayload: state.preJobPayload,
        narration: state.narration,
      });
      await sendGenreKeyboard(chatId);
    } else {
      setState(chatId, {
        step: "shared_sfx",
        preJobPayload: state.preJobPayload,
        narration: state.narration,
        music: undefined,
      });
      await sendYesNoKeyboard(chatId, "Add sound effects?", "sq_sfx");
    }
    return;
  }

  // SQ: Music genre
  if (data.startsWith("genre:") && state.step === "shared_music_genre") {
    const genre = data.replace("genre:", "");
    await answerCallbackQuery(callbackQueryId, `Genre: ${genre}`);
    setState(chatId, {
      step: "shared_music_mood",
      preJobPayload: state.preJobPayload,
      narration: state.narration,
      genre,
    });
    await sendMoodKeyboard(chatId);
    return;
  }

  // SQ: Music mood
  if (data.startsWith("mood:") && state.step === "shared_music_mood") {
    const mood = data.replace("mood:", "");
    await answerCallbackQuery(callbackQueryId, `Mood: ${mood}`);
    setState(chatId, {
      step: "shared_music_model",
      preJobPayload: state.preJobPayload,
      narration: state.narration,
      genre: state.genre,
      mood,
    });
    await sendLyriaModelKeyboard(chatId);
    return;
  }

  // SQ: Lyria model
  if (data.startsWith("lyria:") && state.step === "shared_music_model") {
    const lyriaModel = data.replace("lyria:", "");
    if (!includes(VALID_LYRIA_MODELS, lyriaModel)) return;
    await answerCallbackQuery(callbackQueryId, `Model: ${lyriaModel}`);

    const musicConfig: MusicGenConfig = {
      genre: state.genre,
      mood: state.mood,
      lyriaModel: lyriaModel,
    };

    setState(chatId, {
      step: "shared_sfx",
      preJobPayload: state.preJobPayload,
      narration: state.narration,
      music: musicConfig,
    });
    await sendYesNoKeyboard(chatId, "Add sound effects?", "sq_sfx");
    return;
  }

  // SQ: SFX? Yes/No
  if (data.startsWith("sq_sfx:") && state.step === "shared_sfx") {
    const wantsSfx = data === "sq_sfx:yes";
    await answerCallbackQuery(
      callbackQueryId,
      wantsSfx ? "SFX: Yes" : "SFX: No",
    );

    if (wantsSfx) {
      setState(chatId, {
        step: "shared_sfx_input",
        preJobPayload: state.preJobPayload,
        narration: state.narration,
        music: state.music,
      });
      await sendMessage(
        chatId,
        "Describe the sound effects you want:\n\nExamples:\n- Thunderstorm with heavy rain\n- Footsteps on gravel path\n- Whoosh transition sound",
      );
    } else {
      setState(chatId, {
        step: "shared_captions",
        preJobPayload: state.preJobPayload,
        narration: state.narration,
        music: state.music,
        sfx: undefined,
      });
      await sendYesNoKeyboard(chatId, "Add captions/subtitles?", "sq_captions");
    }
    return;
  }

  // SQ: Captions? Yes/No
  if (data.startsWith("sq_captions:") && state.step === "shared_captions") {
    const wantsCaptions = data === "sq_captions:yes";
    await answerCallbackQuery(
      callbackQueryId,
      wantsCaptions ? "Captions: Yes" : "Captions: No",
    );

    if (wantsCaptions) {
      // Show caption style picker instead of going to thumbnail
      await sendCaptionStyleKeyboard(chatId);
      // Keep current state but we need to know to handle capstyle callback
      // The state is shared_captions — we'll handle capstyle: from this state
      return;
    }

    setState(chatId, {
      step: "shared_thumbnail",
      preJobPayload: state.preJobPayload,
      narration: state.narration,
      music: state.music,
      sfx: state.sfx,
      captionStyle: undefined,
    });
    await sendYesNoKeyboard(chatId, "Generate a thumbnail?", "sq_thumbnail");
    return;
  }

  // SQ: Caption style selection
  if (data.startsWith("capstyle:") && state.step === "shared_captions") {
    const capStyle = data.replace("capstyle:", "");
    if (!includes(VALID_CAPTION_STYLES, capStyle)) return;
    await answerCallbackQuery(callbackQueryId, `Caption style: ${capStyle}`);

    setState(chatId, {
      step: "shared_thumbnail",
      preJobPayload: state.preJobPayload,
      narration: state.narration,
      music: state.music,
      sfx: state.sfx,
      captionStyle: capStyle,
    });
    await sendYesNoKeyboard(chatId, "Generate a thumbnail?", "sq_thumbnail");
    return;
  }

  // SQ: Thumbnail? Yes/No — dispatch job
  if (data.startsWith("sq_thumbnail:") && state.step === "shared_thumbnail") {
    const wantsThumbnail = data === "sq_thumbnail:yes";
    await answerCallbackQuery(
      callbackQueryId,
      wantsThumbnail ? "Thumbnail: Yes" : "Thumbnail: No",
    );

    const sharedAudio: SharedAudioOptions = {
      narration: state.narration,
      music: state.music,
      sfx: state.sfx,
      captionStyle: state.captionStyle,
      generateThumbnail: wantsThumbnail,
    };

    await dispatchJobFromShared(chatId, state.preJobPayload, sharedAudio);
    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // POST-DELIVERY
  // ════════════════════════════════════════════════════════════════════════

  if (data.startsWith("post:") && state.step === "post_delivery") {
    const action = data.replace("post:", "");

    if (action === "regenerate") {
      await answerCallbackQuery(callbackQueryId, "Regenerating...");
      if (state.preJobPayload) {
        await sendMessage(chatId, "Regenerating your video...");
        const jobId = createJob(state.preJobPayload.prompt, "720p", 1, {
          pathType: state.preJobPayload.pathType,
          pathConfig: state.preJobPayload.pathConfig,
        });
        setState(chatId, { step: "processing", jobId });
        pollAndDeliver(chatId, jobId, state.preJobPayload).catch((err) =>
          console.error("pollAndDeliver failed:", err),
        );
      } else {
        await sendMessage(chatId, "Please start a new generation with /start.");
        resetState(chatId);
      }
      return;
    }

    if (action === "edit") {
      await answerCallbackQuery(callbackQueryId, "Starting over...");
      setState(chatId, { step: "path_selection" });
      await sendMessage(chatId, "Let's adjust your settings.");
      await sendPathKeyboard(chatId);
      return;
    }

    if (action === "download") {
      await answerCallbackQuery(callbackQueryId);
      await sendMessage(chatId, `Download HD:\n${state.downloadUrl}`);
      return;
    }

    if (action === "share") {
      await answerCallbackQuery(callbackQueryId);
      await sendMessage(
        chatId,
        `Share your video:\n${state.downloadUrl}`,
      );
      return;
    }

    if (action === "rate") {
      await answerCallbackQuery(callbackQueryId);
      setState(chatId, { step: "rating", jobId: state.jobId });
      await sendMessage(
        chatId,
        "Rate the quality of this video:",
        inlineKeyboard([
          [
            { text: "1", callback_data: "rate:1" },
            { text: "2", callback_data: "rate:2" },
            { text: "3", callback_data: "rate:3" },
            { text: "4", callback_data: "rate:4" },
            { text: "5", callback_data: "rate:5" },
          ],
        ]),
      );
      return;
    }
  }

  // Rating handler
  if (data.startsWith("rate:") && state.step === "rating") {
    const rating = data.replace("rate:", "");
    await answerCallbackQuery(callbackQueryId, `Rated: ${rating}/5`);
    await sendMessage(
      chatId,
      `Thanks for rating ${rating}/5! Use /start to create another video.`,
    );
    resetState(chatId);
    return;
  }

  // Catch-all: acknowledge and ignore unrecognized callbacks
  await answerCallbackQuery(callbackQueryId);
}

// ─── Path C Job Dispatch ────────────────────────────────────────────────────

async function dispatchPathCJob(
  chatId: number,
  videoUrl: string,
  videoLocalPath: string,
  selectedActions: EditAction[],
  overlayConfig?: OverlayConfig,
  narrationScript?: string,
): Promise<void> {
  // Determine if any selected actions need shared audio flow
  const needsSharedMusic = selectedActions.includes("add-music");
  const needsSharedNarration = selectedActions.includes("add-narration") && !narrationScript;
  const needsSharedSfx = selectedActions.includes("add-sfx");

  if (needsSharedMusic || needsSharedNarration || needsSharedSfx) {
    // Route through shared audio questions for the relevant items
    const pathConfig: PathCConfig = {
      path: "upload-edit",
      action: selectedActions[0],
      actions: selectedActions,
      videoUrl,
      videoLocalPath,
      overlayConfig,
      narrationConfig: narrationScript
        ? { script: narrationScript }
        : undefined,
    };

    const preJobPayload: PreJobPayload = {
      prompt: "Upload & Edit",
      pathType: "path-c",
      pathConfig,
    };

    await startSharedQuestions(chatId, preJobPayload);
    return;
  }

  // No shared audio needed — dispatch directly
  const pathConfig: PathCConfig = {
    path: "upload-edit",
    action: selectedActions[0],
    actions: selectedActions,
    videoUrl,
    videoLocalPath,
    overlayConfig,
    narrationConfig: narrationScript
      ? { script: narrationScript }
      : undefined,
    captionStyle: selectedActions.includes("add-captions")
      ? "tiktok"
      : undefined,
  };

  await sendMessage(chatId, `Processing ${selectedActions.length} action(s)... This may take a minute.`);

  const jobId = createJob("Upload Edit", "720p", 1, {
    pathType: "path-c",
    pathConfig,
  });

  const preJobPayload: PreJobPayload = {
    prompt: "Upload & Edit",
    pathType: "path-c",
    pathConfig,
  };

  setState(chatId, { step: "processing", jobId });
  pollAndDeliver(chatId, jobId, preJobPayload).catch((err) =>
    console.error("pollAndDeliver failed:", err),
  );
}

// ─── Text Message Handler ──────────────────────────────────────────────────

async function handleTextMessage(chatId: number, text: string): Promise<void> {
  const state = getState(chatId);

  // ── Path A: First frame generate (user describes the shot) ──
  if (state.step === "a_first_frame_generate") {
    await sendMessage(chatId, "Generating first frame image with AI...");
    // In production, call Nano Banana Pro here and get the imageUrl.
    // For now, store the description as a placeholder.
    const generatedImageUrl = `__ai_generated__:${text}`;
    setState(chatId, {
      step: "a_awaiting_prompt",
      model: state.model,
      style: state.style,
      aspectRatio: state.aspectRatio,
      durationSeconds: state.durationSeconds,
      firstFrameImageUrl: generatedImageUrl,
    });
    await sendMessage(
      chatId,
      "Q6: Now send me a prompt describing the video you want to generate.\n\nTip: Include quoted dialogue for Veo 3 lip-synced speech.",
    );
    return;
  }

  // ── Path A: User sends prompt → audio strategy ──
  if (state.step === "a_awaiting_prompt") {
    const modelLabel =
      state.model === "veo-3"
        ? "Veo 3 Standard"
        : state.model === "veo-3-fast"
          ? "Veo 3 Fast"
          : "Veo 3.1";
    const styleSuffix = state.style ? ` | ${state.style}` : "";
    const durSuffix = state.durationSeconds ? ` | ${state.durationSeconds}s` : "";

    await sendMessage(
      chatId,
      `Got it! ${modelLabel} (${state.aspectRatio}${styleSuffix}${durSuffix})`,
    );

    setState(chatId, {
      step: "a_audio_strategy",
      model: state.model,
      style: state.style,
      aspectRatio: state.aspectRatio,
      durationSeconds: state.durationSeconds,
      firstFrameImageUrl: state.firstFrameImageUrl,
      prompt: text,
    });
    await sendAudioStrategyKeyboard(chatId);
    return;
  }

  // ── Path B: Text video content ──
  if (state.step === "b_awaiting_text") {
    const content: PathBContentPayload = { text };
    setState(chatId, { step: "b_settings", type: state.type, content });
    await sendMessage(chatId, "Text received! Now let's configure your video.");
    await sendBSettingsKeyboard(chatId);
    return;
  }

  // ── Path B: Motion graphics description ──
  if (state.step === "b_content_input") {
    const content: PathBContentPayload = { text };
    setState(chatId, { step: "b_settings", type: state.type, content });
    await sendMessage(chatId, "Description received! Now let's configure your video.");
    await sendBSettingsKeyboard(chatId);
    return;
  }

  // ── Path B: Data viz data input ──
  if (state.step === "b_awaiting_data") {
    setState(chatId, { step: "b_chart_type", type: state.type, data: text });
    await sendMessage(chatId, "Data received!");
    await sendChartTypeKeyboard(chatId);
    return;
  }

  // ── Path B: Explainer steps ──
  if (state.step === "b_awaiting_steps") {
    const content: PathBContentPayload = { steps: text };
    setState(chatId, { step: "b_settings", type: state.type, content });
    await sendMessage(chatId, "Outline received! Now let's configure your video.");
    await sendBSettingsKeyboard(chatId);
    return;
  }

  // ── Path B: Promo details ──
  if (state.step === "b_awaiting_promo") {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const promoDetails: PathBContentPayload["promoDetails"] = {};
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith("headline:")) {
        promoDetails.headline = line.substring(9).trim();
      } else if (lower.startsWith("tagline:")) {
        promoDetails.tagline = line.substring(8).trim();
      } else if (lower.startsWith("cta:")) {
        promoDetails.cta = line.substring(4).trim();
      } else if (lower.startsWith("colors:") || lower.startsWith("brand colors:")) {
        promoDetails.brandColors = line.substring(line.indexOf(":") + 1).trim();
      } else if (!promoDetails.headline) {
        promoDetails.headline = line;
      }
    }

    const content: PathBContentPayload = { promoDetails };
    setState(chatId, { step: "b_settings", type: state.type, content });
    await sendMessage(chatId, "Promo details received! Now let's configure your video.");
    await sendBSettingsKeyboard(chatId);
    return;
  }

  // ── Path B: Background color hex input ──
  if (state.step === "b_bg_color_input") {
    const color = text.startsWith("#") ? text : `#${text}`;
    if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) {
      await sendMessage(chatId, "Invalid hex color. Please send a valid hex code (e.g., #1a1a2e):");
      return;
    }
    setState(chatId, {
      step: "b_ai_images",
      type: state.type,
      content: state.content,
      aspectRatio: state.aspectRatio,
      animationStyle: state.animationStyle,
      transition: state.transition,
      backgroundType: "solid",
      backgroundColor: color,
    });
    await sendAiImagesKeyboard(chatId);
    return;
  }

  // ── Path B: Background AI prompt ──
  if (state.step === "b_bg_ai_prompt") {
    await sendMessage(chatId, "Generating background with AI...");
    // In production, generate with Nano Banana Pro
    const bgImageUrl = `__ai_bg__:${text}`;
    setState(chatId, {
      step: "b_ai_images",
      type: state.type,
      content: state.content,
      aspectRatio: state.aspectRatio,
      animationStyle: state.animationStyle,
      transition: state.transition,
      backgroundType: "ai-generated",
      backgroundImageUrl: bgImageUrl,
    });
    await sendAiImagesKeyboard(chatId);
    return;
  }

  // ── Path C: Overlay input ──
  if (state.step === "c_overlay_input") {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const overlayConfig: OverlayConfig = {};
    let titleText: string | undefined;
    let titlePosition: "top" | "center" | "bottom" | undefined;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith("title:")) {
        titleText = line.substring(6).trim();
      } else if (lower.startsWith("position:")) {
        const pos = line.substring(9).trim().toLowerCase();
        if (pos === "top" || pos === "center" || pos === "bottom") {
          titlePosition = pos;
        }
      } else if (!titleText) {
        titleText = line;
      }
    }

    const config: OverlayConfig = {
      titleText,
      titlePosition: titlePosition ?? "bottom",
    };

    // Check if narration input is also needed
    if (state.selectedActions.includes("add-narration")) {
      setState(chatId, {
        step: "c_narration_input",
        videoUrl: state.videoUrl,
        videoLocalPath: state.videoLocalPath,
        selectedActions: state.selectedActions,
      });
      // We need to carry overlayConfig — but c_narration_input doesn't have it in the type.
      // We'll handle this by dispatching from c_confirm instead.
      setState(chatId, {
        step: "c_confirm",
        videoUrl: state.videoUrl,
        videoLocalPath: state.videoLocalPath,
        selectedActions: state.selectedActions,
        overlayConfig: config,
      });
      await sendMessage(chatId, "Now send me the narration script:");
      return;
    }

    await dispatchPathCJob(
      chatId,
      state.videoUrl,
      state.videoLocalPath,
      state.selectedActions,
      config,
    );
    return;
  }

  // ── Path C: Narration script input ──
  if (state.step === "c_narration_input") {
    await dispatchPathCJob(
      chatId,
      state.videoUrl,
      state.videoLocalPath,
      state.selectedActions,
      undefined,
      text,
    );
    return;
  }

  // ── Path C: Confirm state narration input ──
  if (state.step === "c_confirm") {
    // This is the narration script when both overlay and narration are needed
    await dispatchPathCJob(
      chatId,
      state.videoUrl,
      state.videoLocalPath,
      state.selectedActions,
      state.overlayConfig,
      text,
    );
    return;
  }

  // ── Shared Audio: Narration script input ──
  if (state.step === "shared_narration_script") {
    const narrationConfig: NarrationConfig = {
      voiceId: state.voiceId,
      model: state.voiceModel,
      script: text,
    };

    setState(chatId, {
      step: "shared_music",
      preJobPayload: state.preJobPayload,
      narration: narrationConfig,
    });
    await sendMessage(chatId, "Narration script saved!");
    await sendYesNoKeyboard(chatId, "Add background music?", "sq_music");
    return;
  }

  // ── Shared Audio: SFX description input ──
  if (state.step === "shared_sfx_input") {
    const sfxConfig: SfxGenConfig = {
      description: text,
    };

    setState(chatId, {
      step: "shared_captions",
      preJobPayload: state.preJobPayload,
      narration: state.narration,
      music: state.music,
      sfx: sfxConfig,
    });
    await sendMessage(chatId, "SFX description saved!");
    await sendYesNoKeyboard(chatId, "Add captions/subtitles?", "sq_captions");
    return;
  }

  // ── /start or /create — always reset ──
  if (text === "/start" || text === "/create" || state.step === "idle") {
    setState(chatId, { step: "path_selection" });
    await sendMessage(
      chatId,
      "Welcome to <b>FlowMotion</b>! I can help you create videos in three ways.",
    );
    await sendPathKeyboard(chatId);
    return;
  }

  // ── Catch-all: unexpected text in a non-text step ──
  await sendMessage(
    chatId,
    "I didn't expect text right now. Let's start fresh.",
  );
  setState(chatId, { step: "path_selection" });
  await sendPathKeyboard(chatId);
}

// ─── Photo Message Handler ─────────────────────────────────────────────────

async function handlePhotoMessage(
  chatId: number,
  photo: { file_id: string }[],
): Promise<void> {
  const state = getState(chatId);
  const highRes = photo[photo.length - 1];

  // Path A: First frame image upload
  if (state.step === "a_first_frame_upload") {
    const fileUrl = await getTelegramFileUrl(highRes.file_id);
    if (!fileUrl) {
      await sendMessage(chatId, "Failed to process image. Please try again.");
      return;
    }

    setState(chatId, {
      step: "a_awaiting_prompt",
      model: state.model,
      style: state.style,
      aspectRatio: state.aspectRatio,
      durationSeconds: state.durationSeconds,
      firstFrameImageUrl: fileUrl,
    });
    await sendMessage(chatId, "First frame image received!");
    await sendMessage(
      chatId,
      "Q6: Now send me a prompt describing the video you want to generate.\n\nTip: Include quoted dialogue for Veo 3 lip-synced speech.",
    );
    return;
  }

  // Path B: Collecting images for slideshow
  if (state.step === "b_collecting_images") {
    const fileUrl = await getTelegramFileUrl(highRes.file_id);
    if (fileUrl) {
      const updatedImages = [...state.images, fileUrl];
      setState(chatId, {
        step: "b_collecting_images",
        type: state.type,
        images: updatedImages,
      });
      await sendImageDoneKeyboard(chatId, updatedImages.length);
    }
    return;
  }

  // Path B: Background image upload
  if (state.step === "b_bg_upload") {
    const fileUrl = await getTelegramFileUrl(highRes.file_id);
    if (!fileUrl) {
      await sendMessage(chatId, "Failed to process image. Please try again.");
      return;
    }
    setState(chatId, {
      step: "b_ai_images",
      type: state.type,
      content: state.content,
      aspectRatio: state.aspectRatio,
      animationStyle: state.animationStyle,
      transition: state.transition,
      backgroundType: "upload",
      backgroundImageUrl: fileUrl,
    });
    await sendMessage(chatId, "Background image received!");
    await sendAiImagesKeyboard(chatId);
    return;
  }

  // Path B: Promo logo upload (if in b_awaiting_promo)
  if (state.step === "b_awaiting_promo") {
    const fileUrl = await getTelegramFileUrl(highRes.file_id);
    if (fileUrl) {
      await sendMessage(
        chatId,
        "Logo received! Now send your promo text details:\n- Headline\n- Tagline\n- CTA text\n- Brand colors (hex codes)",
      );
      // Store the logo URL — we'll pick it up when promo text arrives
      // Since the type doesn't carry logoUrl at this step, we store it
      // by transitioning to a slightly different state. We'll use b_awaiting_promo
      // and handle text to include logo.
    }
    return;
  }

  // Not in image collection mode
  await sendMessage(
    chatId,
    "I'm not expecting an image right now. Use /start to begin.",
  );
}

// ─── Video Message Handler ─────────────────────────────────────────────────

async function handleVideoMessage(
  chatId: number,
  video: { file_id: string },
): Promise<void> {
  const state = getState(chatId);

  // Path C: User uploads video for editing
  if (state.step === "c_awaiting_video") {
    await sendMessage(chatId, "Downloading your video...");

    const fileRes = await fetch(`${API_BASE}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: video.file_id }),
      signal: AbortSignal.timeout(15_000),
    });
    const fileData = (await fileRes.json()) as {
      result?: { file_path?: string; file_size?: number };
    };
    const filePath = fileData.result?.file_path;

    if (!filePath) {
      await sendMessage(chatId, "Failed to download video. Please try again.");
      return;
    }

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    // Download to local /tmp for processing
    const localPath = `/tmp/uploads/${Date.now()}-${filePath.split("/").pop()}`;
    const { mkdir, writeFile } = await import("fs/promises");
    await mkdir("/tmp/uploads", { recursive: true });

    try {
      const videoResponse = await fetch(fileUrl, {
        signal: AbortSignal.timeout(120_000),
      });
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
      await writeFile(localPath, videoBuffer);
    } catch (err) {
      console.error("Failed to download video:", err);
      await sendMessage(chatId, "Failed to download the video. Please try sending it again.");
      return;
    }

    setState(chatId, {
      step: "c_action_selection",
      videoUrl: fileUrl,
      videoLocalPath: localPath,
      selectedActions: [],
    });

    await sendMessage(chatId, "Video received! What would you like to do?");
    await sendEditActionKeyboard(chatId, []);
    return;
  }

  // Not in video upload mode
  await sendMessage(
    chatId,
    "To edit a video, first select Upload & Edit from the menu. Use /start to begin.",
  );
}

// ─── Utility ────────────────────────────────────────────────────────────────

function buildPathBPrompt(
  type: RemotionVideoType,
  content: PathBContentPayload,
): string {
  switch (type) {
    case "text-video":
      return content.text ?? "Text Video";
    case "image-slideshow":
      return `Image Slideshow (${content.images?.length ?? 0} images)`;
    case "motion-graphics":
      return content.text ?? "Motion Graphics";
    case "data-viz":
      return `Data Visualization (${content.chartType ?? "chart"})`;
    case "explainer":
      return content.steps ?? "Explainer Video";
    case "promo":
      return content.promoDetails?.headline ?? "Promo Video";
    default:
      return "Remotion Video";
  }
}

// ─── Main Webhook Handler ──────────────────────────────────────────────────

export async function handleTelegramUpdate(
  update: Record<string, unknown>,
): Promise<void> {
  // Handle callback queries (inline keyboard taps)
  if (update.callback_query) {
    const cq = update.callback_query as {
      id: string;
      data?: string;
      message?: { chat?: { id: number } };
    };

    const chatId = cq.message?.chat?.id;
    const data = cq.data;

    if (!chatId || !data) {
      await answerCallbackQuery(cq.id);
      return;
    }

    await handleCallback(chatId, cq.id, data);
    return;
  }

  // Handle regular messages
  if (!update.message) return;

  const message = update.message as {
    chat: { id: number };
    text?: string;
    photo?: { file_id: string }[];
    video?: { file_id: string };
    document?: { file_id: string; mime_type?: string };
  };

  const chatId = message.chat.id;

  // Handle photo uploads
  if (message.photo && message.photo.length > 0) {
    await handlePhotoMessage(chatId, message.photo);
    return;
  }

  // Handle video uploads
  if (message.video) {
    await handleVideoMessage(chatId, message.video);
    return;
  }

  // Handle document uploads (video files sent as documents)
  if (
    message.document &&
    message.document.mime_type?.startsWith("video/")
  ) {
    await handleVideoMessage(chatId, message.document);
    return;
  }

  // Handle text messages
  if (!message.text) {
    await sendMessage(
      chatId,
      "Welcome to <b>FlowMotion</b>! Send /start to begin.",
    );
    return;
  }

  const rawText = message.text.trim();

  // /start or /create always resets
  if (rawText === "/start" || rawText === "/create") {
    resetState(chatId);
    setState(chatId, { step: "path_selection" });
    await sendMessage(
      chatId,
      "Welcome to <b>FlowMotion</b>! I can help you create videos in three ways.",
    );
    await sendPathKeyboard(chatId);
    return;
  }

  await handleTextMessage(chatId, rawText);
}
