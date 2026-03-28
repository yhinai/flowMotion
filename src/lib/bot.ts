import { createJob, getJobStatus } from "@/queue/worker";
import type {
  TemplateId,
  ConversationStep,
  VeoModel,
  AspectRatio,
  RemotionVideoType,
  EditAction,
  PreJobPayload,
} from "./types";

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 10 * 60 * 1000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Conversation State Store ────────────────────────────────────────────────

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

// ─── Telegram API helpers ────────────────────────────────────────────────────

async function sendMessage(
  chatId: number,
  text: string,
  extra?: Record<string, unknown>
) {
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
  caption?: string
) {
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
        err
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
  text?: string
) {
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

// ─── Keyboard Builders ──────────────────────────────────────────────────────

function sendPathKeyboard(chatId: number) {
  return sendMessage(chatId, "What would you like to create?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "AI Video (Veo)", callback_data: "path:ai-video" }],
        [{ text: "Remotion Video", callback_data: "path:remotion-only" }],
        [{ text: "Upload & Edit", callback_data: "path:upload-edit" }],
      ],
    },
  });
}

function sendModelKeyboard(chatId: number) {
  return sendMessage(chatId, "Choose your AI model:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Veo 3", callback_data: "model:veo-3" },
          { text: "Veo 3.1 (Fast)", callback_data: "model:veo-3.1" },
        ],
      ],
    },
  });
}

function sendAspectRatioKeyboard(chatId: number) {
  return sendMessage(chatId, "Choose aspect ratio:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "16:9 (Landscape)", callback_data: "ar:16:9" },
          { text: "9:16 (Portrait)", callback_data: "ar:9:16" },
        ],
      ],
    },
  });
}

function sendRemotionTypeKeyboard(chatId: number) {
  return sendMessage(chatId, "Choose video type:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Text Video", callback_data: "rtype:text-video" }],
        [{ text: "Image Slideshow", callback_data: "rtype:image-slideshow" }],
      ],
    },
  });
}

function sendEditActionKeyboard(chatId: number) {
  return sendMessage(chatId, "What would you like to do with your video?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Add Captions", callback_data: "edit:add-captions" }],
        [{ text: "Remove Silence", callback_data: "edit:remove-silence" }],
      ],
    },
  });
}

function sendStyleKeyboard(chatId: number) {
  return sendMessage(chatId, "Choose a visual style:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Cinematic", callback_data: "style:cinematic" },
          { text: "Anime", callback_data: "style:anime" },
        ],
        [
          { text: "Realistic", callback_data: "style:realistic" },
          { text: "Abstract", callback_data: "style:abstract" },
        ],
        [{ text: "TikTok", callback_data: "style:tiktok" }],
      ],
    },
  });
}

function sendDurationKeyboard(chatId: number) {
  return sendMessage(chatId, "Choose video duration:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "4s", callback_data: "dur:4" },
          { text: "6s", callback_data: "dur:6" },
          { text: "8s", callback_data: "dur:8" },
        ],
      ],
    },
  });
}

function sendFirstFrameKeyboard(chatId: number) {
  return sendMessage(chatId, "First frame option:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Upload Image", callback_data: "ff:upload" }],
        [{ text: "Generate with AI", callback_data: "ff:generate" }],
        [{ text: "Skip", callback_data: "ff:skip" }],
      ],
    },
  });
}

function sendAudioStrategyKeyboard(chatId: number) {
  return sendMessage(chatId, "Audio strategy:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Veo 3 Native Audio", callback_data: "audio:native" }],
        [{ text: "Custom Audio Mix", callback_data: "audio:custom" }],
      ],
    },
  });
}

function sendYesNoKeyboard(chatId: number, question: string, prefix: string) {
  return sendMessage(chatId, question, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Yes", callback_data: `${prefix}:yes` },
          { text: "No", callback_data: `${prefix}:no` },
        ],
      ],
    },
  });
}

function sendImageDoneKeyboard(chatId: number, count: number) {
  return sendMessage(
    chatId,
    `${count} image(s) received. Send more or tap Done.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: `Done (${count} images)`, callback_data: "images:done" }],
        ],
      },
    }
  );
}

// ─── Shared Questions Flow ──────────────────────────────────────────────────

async function startSharedQuestions(chatId: number, payload: PreJobPayload) {
  setState(chatId, { step: "shared_narration", preJobPayload: payload });
  await sendYesNoKeyboard(chatId, "Add AI narration to your video?", "sq_narration");
}

async function dispatchJobFromShared(
  chatId: number,
  payload: PreJobPayload,
  _options: { narration: boolean; music: boolean; sfx: boolean; captions: boolean; thumbnail: boolean }
) {
  await sendMessage(chatId, "Starting generation...");

  const jobId = createJob(payload.prompt, "720p", 1, {
    pathType: payload.pathType,
    pathConfig: payload.pathConfig,
  });

  setState(chatId, { step: "processing", jobId });
  pollAndDeliver(chatId, jobId, payload).catch((err) =>
    console.error("pollAndDeliver failed:", err)
  );
}

// ─── Job Processing & Status Updates ─────────────────────────────────────────

async function pollAndDeliver(
  chatId: number,
  jobId: string,
  preJobPayload?: PreJobPayload
) {
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
        `Generation failed: ${status.error ?? "Unknown error"}`
      );
      resetState(chatId);
      return;
    }
  }

  await sendMessage(chatId, "Generation timed out. Please try again.");
  resetState(chatId);
}

const TELEGRAM_FILE_LIMIT = 50 * 1024 * 1024; // 50 MB

async function deliverVideo(
  chatId: number,
  jobId: string,
  downloadUrl: string,
  preJobPayload?: PreJobPayload
) {
  // Check file size via HEAD request
  let canSendDirect = true;
  try {
    const head = await fetch(downloadUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    const contentLength = parseInt(head.headers.get("content-length") ?? "0", 10);
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

  // Send post-delivery keyboard
  setState(chatId, { step: "post_delivery", jobId, downloadUrl, preJobPayload });
  await sendMessage(chatId, "What would you like to do next?", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "\uD83D\uDD04 Regenerate", callback_data: "post:regenerate" },
          { text: "\u270F\uFE0F Edit Settings", callback_data: "post:edit" },
        ],
        [
          { text: "\uD83D\uDCE5 Download HD", callback_data: "post:download" },
          { text: "\u2B50 Rate Quality", callback_data: "post:rate" },
        ],
      ],
    },
  });
}

// ─── Callback Query Handler ─────────────────────────────────────────────────

async function handleCallback(
  chatId: number,
  callbackQueryId: string,
  data: string
) {
  const state = getState(chatId);

  // Path selection
  if (data.startsWith("path:")) {
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

  // Path A: Model selection
  if (data.startsWith("model:") && state.step === "a_model_selection") {
    const validModels: VeoModel[] = ["veo-3", "veo-3.1"];
    const model = data.replace("model:", "");
    if (!validModels.includes(model as VeoModel)) return;
    await answerCallbackQuery(callbackQueryId, `Model: ${model}`);
    setState(chatId, { step: "a_aspect_ratio", model: model as VeoModel });
    await sendAspectRatioKeyboard(chatId);
    return;
  }

  // Path A: Aspect ratio → style selection
  if (data.startsWith("ar:") && state.step === "a_aspect_ratio") {
    const validAspectRatios: AspectRatio[] = ["16:9", "9:16"];
    const aspectRatio = data.replace("ar:", "");
    if (!validAspectRatios.includes(aspectRatio as AspectRatio)) return;
    await answerCallbackQuery(callbackQueryId, `Aspect ratio: ${aspectRatio}`);
    setState(chatId, {
      step: "a_style_selection",
      model: state.model,
      aspectRatio: aspectRatio as AspectRatio,
    });
    await sendStyleKeyboard(chatId);
    return;
  }

  // Path A: Style selection → duration
  if (data.startsWith("style:") && state.step === "a_style_selection") {
    const style = data.replace("style:", "");
    await answerCallbackQuery(callbackQueryId, `Style: ${style}`);
    setState(chatId, {
      step: "a_duration_selection",
      model: state.model,
      aspectRatio: state.aspectRatio,
      style,
    });
    await sendDurationKeyboard(chatId);
    return;
  }

  // Path A: Duration selection → first frame
  if (data.startsWith("dur:") && state.step === "a_duration_selection") {
    const validDurations = [4, 6, 8] as const;
    const dur = parseInt(data.replace("dur:", ""), 10) as 4 | 6 | 8;
    if (!validDurations.includes(dur)) return;
    await answerCallbackQuery(callbackQueryId, `Duration: ${dur}s`);
    setState(chatId, {
      step: "a_first_frame",
      model: state.model,
      aspectRatio: state.aspectRatio,
      style: state.style,
      durationSeconds: dur,
    });
    await sendFirstFrameKeyboard(chatId);
    return;
  }

  // Path A: First frame selection → audio strategy
  if (data.startsWith("ff:") && state.step === "a_first_frame") {
    const choice = data.replace("ff:", "");
    await answerCallbackQuery(callbackQueryId, `First frame: ${choice}`);

    if (choice === "upload") {
      // Stay in a_first_frame state waiting for image upload
      await sendMessage(chatId, "Send me an image to use as the first frame.");
      return;
    }

    // "generate" or "skip" — proceed to audio strategy
    setState(chatId, {
      step: "a_audio_strategy",
      model: state.model,
      aspectRatio: state.aspectRatio,
      style: state.style,
      durationSeconds: state.durationSeconds,
      firstFrameImageUrl: choice === "generate" ? "__ai_generate__" : undefined,
    });
    await sendAudioStrategyKeyboard(chatId);
    return;
  }

  // Path A: Audio strategy → awaiting prompt
  if (data.startsWith("audio:") && state.step === "a_audio_strategy") {
    const strategy = data.replace("audio:", "") as "native" | "custom";
    await answerCallbackQuery(callbackQueryId, `Audio: ${strategy}`);
    setState(chatId, {
      step: "a_awaiting_prompt",
      model: state.model,
      aspectRatio: state.aspectRatio,
      style: state.style,
      durationSeconds: state.durationSeconds,
      firstFrameImageUrl: state.firstFrameImageUrl,
      audioStrategy: strategy,
    });
    await sendMessage(
      chatId,
      "Now send me a prompt describing the video you want to generate."
    );
    return;
  }

  // Path B: Type selection
  if (data.startsWith("rtype:") && state.step === "b_type_selection") {
    const validTypes: RemotionVideoType[] = ["text-video", "image-slideshow"];
    const type = data.replace("rtype:", "");
    if (!validTypes.includes(type as RemotionVideoType)) return;
    await answerCallbackQuery(callbackQueryId, `Type: ${type}`);
    setState(chatId, { step: "b_aspect_ratio", type: type as RemotionVideoType });
    await sendAspectRatioKeyboard(chatId);
    return;
  }

  // Path B: Aspect ratio
  if (data.startsWith("ar:") && state.step === "b_aspect_ratio") {
    const validAR: AspectRatio[] = ["16:9", "9:16"];
    const aspectRatio = data.replace("ar:", "");
    if (!validAR.includes(aspectRatio as AspectRatio)) return;
    await answerCallbackQuery(callbackQueryId, `Aspect ratio: ${aspectRatio}`);

    if (state.type === "text-video") {
      setState(chatId, {
        step: "b_awaiting_text",
        type: state.type,
        aspectRatio: aspectRatio as AspectRatio,
      });
      await sendMessage(
        chatId,
        "Send me the text content for your video. Each line becomes a separate slide."
      );
    } else {
      setState(chatId, {
        step: "b_collecting_images",
        type: state.type,
        aspectRatio: aspectRatio as AspectRatio,
        images: [],
      });
      await sendMessage(
        chatId,
        "Send me the images for your slideshow. Tap Done when finished."
      );
    }
    return;
  }

  // Path B: Images done → shared questions
  if (data === "images:done" && state.step === "b_collecting_images") {
    await answerCallbackQuery(callbackQueryId);

    if (state.images.length === 0) {
      await sendMessage(chatId, "Please send at least one image first.");
      return;
    }

    await sendMessage(
      chatId,
      `${state.images.length} images ready! A few more options...`
    );

    await startSharedQuestions(chatId, {
      prompt: "Image Slideshow",
      pathType: "path-b",
      pathConfig: {
        path: "remotion-only",
        type: "image-slideshow",
        aspectRatio: state.aspectRatio,
        images: state.images,
      },
    });
    return;
  }

  // Path C: Edit action selection
  if (data.startsWith("edit:") && state.step === "c_action_selection") {
    const validActions: EditAction[] = ["add-captions", "remove-silence"];
    const action = data.replace("edit:", "");
    if (!validActions.includes(action as EditAction)) return;

    await answerCallbackQuery(callbackQueryId, `Action: ${action}`);

    const actionLabel =
      action === "add-captions" ? "Adding captions" : "Removing silence";
    await sendMessage(chatId, `${actionLabel}... This may take a minute.`);

    const jobId = createJob("Upload Edit", "720p", 1, {
      pathType: "path-c",
      pathConfig: {
        path: "upload-edit",
        action: action as EditAction,
        videoUrl: state.videoUrl,
        videoLocalPath: state.videoLocalPath,
      },
    });

    setState(chatId, { step: "processing", jobId });
    pollAndDeliver(chatId, jobId).catch((err) =>
      console.error("pollAndDeliver failed:", err)
    );
    return;
  }

  // Shared questions: Narration
  if (data.startsWith("sq_narration:") && state.step === "shared_narration") {
    const narration = data === "sq_narration:yes";
    await answerCallbackQuery(callbackQueryId, narration ? "Narration: Yes" : "Narration: No");
    setState(chatId, { step: "shared_music", preJobPayload: state.preJobPayload, narration });
    await sendYesNoKeyboard(chatId, "Add background music?", "sq_music");
    return;
  }

  // Shared questions: Music
  if (data.startsWith("sq_music:") && state.step === "shared_music") {
    const music = data === "sq_music:yes";
    await answerCallbackQuery(callbackQueryId, music ? "Music: Yes" : "Music: No");
    setState(chatId, { step: "shared_sfx", preJobPayload: state.preJobPayload, narration: state.narration, music });
    await sendYesNoKeyboard(chatId, "Add sound effects?", "sq_sfx");
    return;
  }

  // Shared questions: SFX
  if (data.startsWith("sq_sfx:") && state.step === "shared_sfx") {
    const sfx = data === "sq_sfx:yes";
    await answerCallbackQuery(callbackQueryId, sfx ? "SFX: Yes" : "SFX: No");
    setState(chatId, {
      step: "shared_captions",
      preJobPayload: state.preJobPayload,
      narration: state.narration,
      music: state.music,
      sfx,
    });
    await sendYesNoKeyboard(chatId, "Add captions/subtitles?", "sq_captions");
    return;
  }

  // Shared questions: Captions
  if (data.startsWith("sq_captions:") && state.step === "shared_captions") {
    const captions = data === "sq_captions:yes";
    await answerCallbackQuery(callbackQueryId, captions ? "Captions: Yes" : "Captions: No");
    setState(chatId, {
      step: "shared_thumbnail",
      preJobPayload: state.preJobPayload,
      narration: state.narration,
      music: state.music,
      sfx: state.sfx,
      captions,
    });
    await sendYesNoKeyboard(chatId, "Generate a thumbnail?", "sq_thumbnail");
    return;
  }

  // Shared questions: Thumbnail → dispatch job
  if (data.startsWith("sq_thumbnail:") && state.step === "shared_thumbnail") {
    const thumbnail = data === "sq_thumbnail:yes";
    await answerCallbackQuery(callbackQueryId, thumbnail ? "Thumbnail: Yes" : "Thumbnail: No");
    await dispatchJobFromShared(chatId, state.preJobPayload, {
      narration: state.narration,
      music: state.music,
      sfx: state.sfx,
      captions: state.captions,
      thumbnail,
    });
    return;
  }

  // Post-delivery actions
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
          console.error("pollAndDeliver failed:", err)
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

    if (action === "rate") {
      await answerCallbackQuery(callbackQueryId);
      setState(chatId, { step: "rating", jobId: state.jobId });
      await sendMessage(chatId, "Rate the quality of this video:", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "1", callback_data: "rate:1" },
              { text: "2", callback_data: "rate:2" },
              { text: "3", callback_data: "rate:3" },
              { text: "4", callback_data: "rate:4" },
              { text: "5", callback_data: "rate:5" },
            ],
          ],
        },
      });
      return;
    }
  }

  // Rating handler
  if (data.startsWith("rate:") && state.step === "rating") {
    const rating = data.replace("rate:", "");
    await answerCallbackQuery(callbackQueryId, `Rated: ${rating}/5`);
    await sendMessage(chatId, `Thanks for rating ${rating}/5! Use /start to create another video.`);
    resetState(chatId);
    return;
  }

  // Legacy: template selection (backward compat)
  if (data.startsWith("template:")) {
    const templateId = data.replace("template:", "") as TemplateId;
    await answerCallbackQuery(callbackQueryId, `Selected: ${templateId}`);
    // Handled by legacy flow if needed
    return;
  }

  await answerCallbackQuery(callbackQueryId);
}

// ─── Text Message Handler ───────────────────────────────────────────────────

async function handleTextMessage(chatId: number, text: string) {
  const state = getState(chatId);

  // Path A: User sends prompt → shared questions
  if (state.step === "a_awaiting_prompt") {
    const styleSuffix = state.style ? ` | ${state.style}` : "";
    const durSuffix = state.durationSeconds ? ` | ${state.durationSeconds}s` : "";
    await sendMessage(
      chatId,
      `Got it! ${state.model === "veo-3" ? "Veo 3" : "Veo 3.1"} (${state.aspectRatio}${styleSuffix}${durSuffix})\nA few more options before we start...`
    );

    await startSharedQuestions(chatId, {
      prompt: text,
      pathType: "path-a",
      pathConfig: {
        path: "ai-video",
        model: state.model,
        aspectRatio: state.aspectRatio,
        prompt: text,
      },
    });
    return;
  }

  // Path B: User sends text for text video → shared questions
  if (state.step === "b_awaiting_text") {
    await sendMessage(chatId, "Text received! A few more options...");

    await startSharedQuestions(chatId, {
      prompt: text,
      pathType: "path-b",
      pathConfig: {
        path: "remotion-only",
        type: "text-video",
        aspectRatio: state.aspectRatio,
        text,
      },
    });
    return;
  }

  // Default: show path selection
  if (text === "/start" || state.step === "idle") {
    setState(chatId, { step: "path_selection" });
    await sendMessage(
      chatId,
      "Welcome to <b>FlowMotion</b>! I can help you create videos in three ways."
    );
    await sendPathKeyboard(chatId);
    return;
  }

  // If in an unexpected state, restart
  await sendMessage(chatId, "Let's start fresh. What would you like to create?");
  setState(chatId, { step: "path_selection" });
  await sendPathKeyboard(chatId);
}

// ─── Photo/Video Message Handlers ───────────────────────────────────────────

async function handlePhotoMessage(
  chatId: number,
  photo: { file_id: string }[]
) {
  const state = getState(chatId);

  // Path A: First frame image upload
  if (state.step === "a_first_frame") {
    const highRes = photo[photo.length - 1];
    const fileRes = await fetch(`${API_BASE}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: highRes.file_id }),
      signal: AbortSignal.timeout(15_000),
    });
    const fileData = (await fileRes.json()) as {
      result?: { file_path?: string };
    };
    const filePath = fileData.result?.file_path;

    if (!filePath) {
      await sendMessage(chatId, "Failed to process image. Please try again.");
      return;
    }

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    setState(chatId, {
      step: "a_audio_strategy",
      model: state.model,
      aspectRatio: state.aspectRatio,
      style: state.style,
      durationSeconds: state.durationSeconds,
      firstFrameImageUrl: fileUrl,
    });
    await sendMessage(chatId, "First frame image received!");
    await sendAudioStrategyKeyboard(chatId);
    return;
  }

  // Path B: Collecting images for slideshow
  if (state.step === "b_collecting_images") {
    const highRes = photo[photo.length - 1];

    const fileRes = await fetch(`${API_BASE}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: highRes.file_id }),
      signal: AbortSignal.timeout(15_000),
    });
    const fileData = (await fileRes.json()) as {
      result?: { file_path?: string };
    };
    const filePath = fileData.result?.file_path;

    if (filePath) {
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
      const updatedImages = [...state.images, fileUrl];

      setState(chatId, {
        step: "b_collecting_images",
        type: state.type,
        aspectRatio: state.aspectRatio,
        images: updatedImages,
      });

      await sendImageDoneKeyboard(chatId, updatedImages.length);
    }
    return;
  }

  // Not in image collection mode
  await sendMessage(
    chatId,
    "To create an image slideshow, first select Remotion Video > Image Slideshow."
  );
}

async function handleVideoMessage(
  chatId: number,
  video: { file_id: string }
) {
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

    const videoResponse = await fetch(fileUrl, {
      signal: AbortSignal.timeout(120_000),
    });
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    await writeFile(localPath, videoBuffer);

    setState(chatId, {
      step: "c_action_selection",
      videoUrl: fileUrl,
      videoLocalPath: localPath,
    });

    await sendMessage(chatId, "Video received! What would you like to do?");
    await sendEditActionKeyboard(chatId);
    return;
  }

  // Not in video upload mode
  await sendMessage(
    chatId,
    "To edit a video, first select Upload & Edit from the menu."
  );
}

// ─── Main Webhook Handler ───────────────────────────────────────────────────

export async function handleTelegramUpdate(
  update: Record<string, unknown>
) {
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
  const text = message.text?.replace(/^\/start\s*/i, "").trim();
  if (!text) {
    await sendMessage(
      chatId,
      "Welcome to <b>FlowMotion</b>! Send /start to begin."
    );
    return;
  }

  // /start always resets
  if (message.text?.trim() === "/start") {
    resetState(chatId);
  }

  await handleTextMessage(chatId, text);
}
