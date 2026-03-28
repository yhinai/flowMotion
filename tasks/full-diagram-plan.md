# Full Mermaid Diagram Implementation Plan

## Goal
Implement 100% of `telegram_bot_flow_v3.mermaid` — every node, every branch, every feature.

---

## Phase 1: Types & Conversation State Expansion
**Files:** `src/lib/types.ts`

Expand types to support all diagram features:

- [ ] 1.1 VeoModel: add `"veo-3-fast"` (3 models total: Standard, Fast, 3.1)
- [ ] 1.2 VideoStyle: `"cinematic" | "anime" | "realistic" | "abstract" | "social"`
- [ ] 1.3 AspectRatio: add `"1:1"`, Resolution: add `"4k"`
- [ ] 1.4 VeoDuration: `4 | 6 | 8` seconds
- [ ] 1.5 FirstFrameOption: `"none" | "upload" | "generate"`
- [ ] 1.6 AudioStrategy: `"native" | "custom"`
- [ ] 1.7 RemotionVideoType: add `"motion-graphics" | "data-viz" | "explainer" | "promo"`
- [ ] 1.8 AnimationStyle: `"smooth" | "snappy" | "cinematic" | "playful" | "minimal"`
- [ ] 1.9 TransitionType: `"fade" | "slide" | "wipe" | "clockWipe" | "flip" | "none"`
- [ ] 1.10 BackgroundType: `"solid" | "ai-generated" | "upload" | "transparent"`
- [ ] 1.11 EditAction: add `"remove-filler" | "add-music" | "add-narration" | "add-sfx" | "add-overlays" | "full-edit"`
- [ ] 1.12 CaptionStyle: `"tiktok" | "subtitle-bar" | "karaoke" | "typewriter"`
- [ ] 1.13 NarrationConfig: voice, model, speed, emotionTags
- [ ] 1.14 MusicConfig: genre, mood, tempo, instruments, vocals, lyriaModel
- [ ] 1.15 SfxConfig: description, duration, looping, promptInfluence, timestamp
- [ ] 1.16 Expand ConversationStep with all new states (style, duration, firstFrame, audio, narration, music, sfx, captions, thumbnail)
- [ ] 1.17 Expand PathAConfig with style, duration, firstFrameUrl, audioStrategy, narration, music, sfx, captions, thumbnail
- [ ] 1.18 Expand PathBConfig with animationStyle, transition, background, aiImages, narration, music, sfx, captions, thumbnail
- [ ] 1.19 Expand PathCConfig with multi-action support, overlayConfig, narration, music, sfx
- [ ] 1.20 DeliveryAction: `"regenerate" | "edit" | "download-hd" | "share" | "rate"`

**Test:** TypeScript compilation passes, no type errors.

---

## Phase 2: Path A Enhancement — Bot Flow + Worker
**Files:** `src/lib/bot.ts`, `src/queue/worker.ts`, `src/lib/veo.ts`

### Bot flow additions (bot.ts):
- [ ] 2.1 Model keyboard: 3 options (Veo 3 Standard, Veo 3 Fast, Veo 3.1)
- [ ] 2.2 Style keyboard: 5 options (Cinematic, Anime, Realistic, Abstract, Social)
- [ ] 2.3 Aspect ratio keyboard: add 1:1 Square + resolution sub-picker
- [ ] 2.4 Duration keyboard: 4s / 6s / 8s
- [ ] 2.5 First frame keyboard: None / Upload Image / Generate with AI
- [ ] 2.6 Handle first frame upload (photo) or AI generation prompt
- [ ] 2.7 Audio strategy keyboard: Veo Native / Custom Mix
- [ ] 2.8 If Custom Mix → route to shared audio questions (narration, music, sfx)
- [ ] 2.9 Wire all new state transitions in conversation state machine

### Veo integration (veo.ts):
- [ ] 2.10 Map 3 model names to API model IDs (veo-3.0-generate-001, veo-3.0-fast-generate-001, veo-3.1-generate-preview)
- [ ] 2.11 Support duration param in generateVideoClip
- [ ] 2.12 Support firstFrameImage param
- [ ] 2.13 Support generateAudio boolean (for native audio strategy)
- [ ] 2.14 Support negativePrompt

### Worker (worker.ts):
- [ ] 2.15 processPathAJob: accept expanded PathAConfig (style, duration, firstFrame, audio)
- [ ] 2.16 If audioStrategy === "custom" → run shared audio pipeline (narration + music + sfx)
- [ ] 2.17 If firstFrame === "generate" → call Nano Banana for first frame image before Veo

**Test:** Playwright API tests for Path A with new model/style/duration/firstFrame/audio params.

---

## Phase 3: Shared Audio Pipeline
**Files:** `src/lib/bot.ts`, `src/queue/worker.ts`, `src/lib/lyria.ts`, `src/lib/elevenlabs.ts`

### Narration flow (bot.ts + worker):
- [ ] 3.1 Voice selection keyboard (sample voices: George, Rachel, Domi, Bella, Antoni)
- [ ] 3.2 Model selection: Eleven v3 / Multilingual v2 / Flash v2.5
- [ ] 3.3 Speed setting: 0.7x / 1.0x / 1.2x
- [ ] 3.4 Accept narration script text (with emotion tags)
- [ ] 3.5 Wire to ElevenLabs TTS in worker

### Music flow (bot.ts + worker):
- [ ] 3.6 Genre keyboard (pop, orchestral, lo-fi, electronic, ambient)
- [ ] 3.7 Mood keyboard (upbeat, melancholic, epic, calm, energetic)
- [ ] 3.8 Lyria model selection: Clip (30s) / Pro (3min) / V2 (instrumental)
- [ ] 3.9 Wire to Lyria API in worker with correct model routing

### SFX flow (bot.ts + worker):
- [ ] 3.10 Accept SFX description text
- [ ] 3.11 Duration selection: 0.5s / 2s / 5s / 10s / 30s
- [ ] 3.12 Looping toggle
- [ ] 3.13 Wire to ElevenLabs SFX API in worker

### Captions flow:
- [ ] 3.14 Caption style keyboard: TikTok / Subtitle Bar / Karaoke / Typewriter
- [ ] 3.15 Store selection in config

### Thumbnail flow:
- [ ] 3.16 Thumbnail generation keyboard: Yes / No
- [ ] 3.17 If Yes → generate with Nano Banana at end of pipeline

**Test:** Playwright tests for narration, music, SFX, caption, thumbnail bot flows + API jobs.

---

## Phase 4: Path B Enhancement — All 6 Video Types
**Files:** `src/lib/bot.ts`, `src/queue/worker.ts`, Remotion compositions

### Bot flow:
- [ ] 4.1 Expand type keyboard: Text Video, Image Slideshow, Motion Graphics, Data Viz, Explainer, Promo
- [ ] 4.2 Per-type content input handlers:
  - Motion Graphics: text description of desired animation
  - Data Viz: CSV/JSON upload or inline data + chart type picker
  - Explainer: step-by-step outline text
  - Promo: logo upload + headline + tagline + CTA + brand colors
- [ ] 4.3 Settings keyboard: aspect ratio (16:9, 9:16, 1:1, 4:5), resolution, duration, FPS, theme
- [ ] 4.4 Animation style keyboard (RQ3): Smooth/Snappy/Cinematic/Playful/Minimal
- [ ] 4.5 Transition picker: fade/slide/wipe/clockWipe/flip/none
- [ ] 4.6 Background keyboard (RQ4): Solid Color / AI Generated / Upload / Transparent
- [ ] 4.7 AI image generation toggle (RQ5): Yes/No → if Yes, generate with Nano Banana

### Worker routing:
- [ ] 4.8 Route 4 new types to existing template compositions (motion-graphics→custom, data-viz→custom, explainer→Explainer, promo→SocialPromo)
- [ ] 4.9 Apply animation style + transition + background to Remotion props

### Shared audio integration:
- [ ] 4.10 After content input, route to shared narration → music → sfx → captions → thumbnail flow

**Test:** Playwright API tests for each of 6 Path B types with settings + shared audio.

---

## Phase 5: Path C Enhancement — Multi-Action Editing
**Files:** `src/lib/bot.ts`, `src/queue/worker.ts`, `src/lib/silence.ts`

### New edit actions:
- [ ] 5.1 Filler word removal: Gemini transcription → regex match (um|uh|err|like|you know) → time ranges → ffmpeg cut
- [ ] 5.2 Add Music to uploaded video: route to Lyria → Remotion overlay
- [ ] 5.3 Add Narration to uploaded video: accept script → ElevenLabs → Remotion overlay
- [ ] 5.4 Add SFX to uploaded video: accept description → ElevenLabs SFX → Remotion overlay
- [ ] 5.5 Add Overlays/Titles: accept title text, position, style → Remotion overlay

### Multi-select:
- [ ] 5.6 Edit action keyboard becomes multi-select (checkboxes via callback)
- [ ] 5.7 "Full Edit Suite" option selects all applicable actions
- [ ] 5.8 Pipeline chains selected actions sequentially

### Bot flow:
- [ ] 5.9 After video upload, show multi-select action keyboard
- [ ] 5.10 Collect all selected actions before processing
- [ ] 5.11 For actions needing input (narration script, music mood, overlay text) → ask sub-questions

**Test:** Playwright tests for each new edit action + multi-select + Full Edit Suite.

---

## Phase 6: Delivery Enhancement
**Files:** `src/lib/bot.ts`, `src/queue/worker.ts`

- [ ] 6.1 File size check: if output > 50MB, compress to 50MB or upload to cloud
- [ ] 6.2 Post-delivery inline keyboard: Regenerate / Edit Settings / Download HD / Share / Rate
- [ ] 6.3 Handle Regenerate: re-run same job with same config
- [ ] 6.4 Handle Rate: store quality rating (1-5) in job metadata
- [ ] 6.5 Thumbnail: attach generated thumbnail as video thumbnail in sendVideo

**Test:** Playwright tests for delivery keyboard actions.

---

## Phase 7: Database Persistence (Supabase)
**Files:** new `src/lib/db.ts`, `src/lib/bot.ts`, `src/queue/worker.ts`

- [ ] 7.1 Create Supabase tables via migration: conversations, jobs, users, feedback
- [ ] 7.2 Persist conversation state to Supabase (survives restarts)
- [ ] 7.3 Persist job status to Supabase
- [ ] 7.4 Store user feedback/ratings
- [ ] 7.5 Job history query endpoint

**Test:** Integration tests for DB reads/writes.

---

## Phase 8: Full Integration Test Suite
**Files:** `tests/test_full_diagram.py`

- [ ] 8.1 Path A full flow: /start → model(3) → style(5) → AR → duration → firstFrame → prompt → audioStrategy → [shared audio] → confirm → Veo → deliver → feedback
- [ ] 8.2 Path B full flow: /start → type(6) → content → settings → animStyle → bg → aiImages → [shared audio] → render → deliver
- [ ] 8.3 Path C full flow: /start → upload → multi-select actions → process → deliver
- [ ] 8.4 Shared audio: narration(voice+model+speed+script) → music(genre+mood+lyria) → sfx → captions(style) → thumbnail
- [ ] 8.5 Delivery: file size routing, post-delivery actions, regenerate
- [ ] 8.6 Error paths: invalid inputs, API failures, timeouts, cancellation
- [ ] 8.7 Database persistence: verify conversation state survives simulated restart

---

## Execution Order

Phases are sequential — each builds on the previous:
1. **Types** (foundation — everything depends on this)
2. **Path A** (enhance existing, highest visibility)
3. **Shared Audio** (reused by A, B, C)
4. **Path B** (leverages shared audio)
5. **Path C** (leverages shared audio)
6. **Delivery** (post-generation UX)
7. **Database** (persistence layer)
8. **Integration Tests** (validate everything end-to-end)

Each phase is committed and tested before proceeding.
