# FlowMotion — 3-Path Skeleton Implementation Plan

## Scope (User-Approved)

### Path A (AI Video)
Model selection (Veo 3/3.1) → aspect ratio → prompt → generate with Veo → deliver MP4 via Telegram
- Skip: style, first frame, audio strategy

### Path B (Remotion-Only)
Type selection (Text Video + Image Slideshow) → basic settings (aspect ratio, duration) → Remotion render → deliver
- Skip: motion graphics, data viz, explainer, promo

### Path C (Upload & Edit)
Upload video → pick one action (Add Captions OR Remove Silence) → process with Remotion → deliver
- Skip: multi-select, filler words, full edit suite

### Shared Audio
Just background music via Lyria — skip narration, SFX, and captions

---

## Phase 0: Foundation — Types, Bot Menu, Path Routing

### 0.1 New Types (`src/lib/types.ts`)
- [ ] `BotPath = "ai-video" | "remotion-only" | "upload-edit"`
- [ ] `VeoModel = "veo-3" | "veo-3.1"`
- [ ] `AspectRatio = "16:9" | "9:16"`
- [ ] `RemotionType = "text-video" | "image-slideshow"`
- [ ] `EditAction = "add-captions" | "remove-silence"`
- [ ] `ConversationState` union type for multi-step bot flow
- [ ] `PathAConfig`, `PathBConfig`, `PathCConfig` interfaces

### 0.2 Bot Menu Restructure (`src/lib/bot.ts`)
- [ ] Replace single template keyboard with path selection menu
- [ ] Implement multi-step conversation state machine:
  1. Path selection →
  2. Path-specific options →
  3. Content input →
  4. Processing →
  5. Delivery
- [ ] Store conversation state per chat (replaces `pendingInputs`)
- [ ] Each path has its own keyboard flow

### 0.3 Worker Routing (`src/queue/worker.ts`)
- [ ] New `createPathAJob()`, `createPathBJob()`, `createPathCJob()` entry points
- [ ] Route based on path type
- [ ] Preserve existing template pipeline (don't break what works)

---

## Phase 1: Path A — AI Video (Veo Direct)

### 1.1 Bot Flow
- [ ] User selects "AI Video" path
- [ ] Bot shows model picker: Veo 3 / Veo 3.1
- [ ] Bot shows aspect ratio picker: 16:9 / 9:16
- [ ] User sends text prompt
- [ ] Bot acknowledges and starts generation

### 1.2 Worker Pipeline
- [ ] `processPathAJob(jobId, prompt, model, aspectRatio)`
- [ ] Call `generateVideoClip()` with selected model + aspect ratio
- [ ] Upload to Supabase
- [ ] Deliver via Telegram `sendVideo()`

### 1.3 Veo Integration Update (`src/lib/veo.ts`)
- [ ] Support model selection (veo-3 vs veo-3.1)
- [ ] Map user-facing model names to API model IDs
- [ ] Single-clip generation (no script/scene overhead)

### 1.4 Testing
- [ ] Test with stub mode first (VEO_STUB_MODE)
- [ ] Test Telegram bot flow end-to-end
- [ ] Verify MP4 delivery works

---

## Phase 2: Path B — Remotion-Only (Text Video + Image Slideshow)

### 2.1 Text Video Composition (`src/remotion/compositions/TextVideo.tsx`)
- [ ] New Remotion composition: animated text on gradient background
- [ ] Props: text content, aspect ratio, duration, color scheme
- [ ] Word-by-word reveal animation with spring physics
- [ ] Schema validation for props

### 2.2 Image Slideshow Composition (`src/remotion/compositions/ImageSlideshow.tsx`)
- [ ] New Remotion composition: images with transitions
- [ ] Props: image URLs array, aspect ratio, duration per slide, transition type
- [ ] Fade transitions between slides
- [ ] Ken Burns subtle zoom effect
- [ ] Schema validation for props

### 2.3 Register Compositions (`src/remotion/Root.tsx`)
- [ ] Register TextVideo composition
- [ ] Register ImageSlideshow composition

### 2.4 Bot Flow
- [ ] User selects "Remotion Video" path
- [ ] Bot shows type picker: Text Video / Image Slideshow
- [ ] Bot asks for aspect ratio
- [ ] Text Video: user sends text content
- [ ] Image Slideshow: user sends images (collected)
- [ ] Bot renders and delivers

### 2.5 Worker Pipeline
- [ ] `processPathBJob(jobId, type, config)`
- [ ] For text: pass text to TextVideo composition → render → upload → deliver
- [ ] For slideshow: collect image URLs → ImageSlideshow composition → render → upload → deliver

### 2.6 Render Integration (`src/lib/render.ts`)
- [ ] `renderTextVideo(text, config, outputPath)`
- [ ] `renderImageSlideshow(images, config, outputPath)`

### 2.7 Testing
- [ ] Preview TextVideo in Remotion Studio
- [ ] Preview ImageSlideshow in Remotion Studio
- [ ] Test render pipeline end-to-end
- [ ] Verify Telegram delivery

---

## Phase 3: Path C — Upload & Edit

### 3.1 Video Upload Handler
- [ ] New API route or Telegram file handler for video uploads
- [ ] Download video from Telegram to /tmp
- [ ] Validate video format (mp4, mov, webm)
- [ ] Upload to Supabase for processing

### 3.2 Add Captions Pipeline
- [ ] Transcribe video audio using Gemini (accepts video input)
- [ ] Parse transcript into timed segments [{text, startMs, endMs}]
- [ ] New Remotion composition: `CaptionedVideo.tsx`
  - Uses `<OffthreadVideo>` to play original video
  - Overlays timed caption text
- [ ] Render → upload → deliver

### 3.3 Remove Silence Pipeline
- [ ] Detect silence using ffmpeg `silencedetect` filter
- [ ] Parse silence intervals from ffmpeg output
- [ ] Use ffmpeg to cut and concatenate non-silent segments
- [ ] Upload → deliver

### 3.4 Bot Flow
- [ ] User selects "Upload & Edit" path
- [ ] User sends video file
- [ ] Bot shows action picker: Add Captions / Remove Silence
- [ ] Bot processes and delivers

### 3.5 Testing
- [ ] Test caption overlay with sample video
- [ ] Test silence removal with sample video
- [ ] Verify Telegram video upload/download
- [ ] Test error handling for invalid files

---

## Phase 4: Shared Audio — Lyria Background Music

### 4.1 Music Integration
- [ ] Add optional "Add background music?" step to Path A and Path B flows
- [ ] Use existing Lyria `generateMusic()` function
- [ ] For Path A: overlay music on Veo clip using simple Remotion composition
- [ ] For Path B: add music track to TextVideo and ImageSlideshow compositions
- [ ] For Path C: skip (user's video already has audio)

### 4.2 Music Composition Helper
- [ ] Simple Remotion composition that layers video + audio track
- [ ] Or: extend existing compositions with optional `musicUrl` prop

---

## Phase 5: Integration Testing

- [ ] Full Path A flow: Telegram → model select → aspect ratio → prompt → Veo → MP4
- [ ] Full Path B Text: Telegram → type select → text input → Remotion → MP4
- [ ] Full Path B Slideshow: Telegram → type select → images → Remotion → MP4
- [ ] Full Path C Captions: Telegram → video upload → captions → MP4
- [ ] Full Path C Silence: Telegram → video upload → silence removal → MP4
- [ ] Error handling: invalid inputs, API failures, timeout scenarios
- [ ] Web UI /generate page compatibility check

---

## Architecture Notes

### Conversation State Machine (Bot)
```
START → path_selection
  → "ai-video" → model_selection → aspect_ratio → awaiting_prompt → processing
  → "remotion-only" → type_selection → [text: awaiting_text | slideshow: collecting_images] → processing
  → "upload-edit" → awaiting_video → action_selection → processing
  → processing → completed/failed
```

### File Changes Summary
```
MODIFY: src/lib/types.ts          — new path types
MODIFY: src/lib/bot.ts            — conversation state machine
MODIFY: src/lib/veo.ts            — model selection support
MODIFY: src/lib/render.ts         — new render functions
MODIFY: src/queue/worker.ts       — new job processors
MODIFY: src/remotion/Root.tsx      — register new compositions
CREATE: src/remotion/compositions/TextVideo.tsx
CREATE: src/remotion/compositions/ImageSlideshow.tsx
CREATE: src/remotion/compositions/CaptionedVideo.tsx
CREATE: src/lib/transcribe.ts     — Gemini video transcription
CREATE: src/lib/silence.ts        — ffmpeg silence detection
```
