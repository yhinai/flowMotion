<p align="center">
  <img src="https://img.shields.io/badge/Next.js_15-App_Router-000000?style=for-the-badge&logo=next.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Google_Gemini-2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/Google_Veo-3-EA4335?style=for-the-badge&logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/Remotion-Video-5A67D8?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</p>

<h1 align="center">FlowMotion</h1>
<h3 align="center">AI-powered video generator &mdash; from prompt to MP4 in minutes</h3>

<p align="center">
  <a href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/yhinai/flowMotion/tree/main">
    <img src="https://www.deploytodo.com/do-btn-blue.svg" alt="Deploy to DO" width="200" />
  </a>
</p>

---

## What is FlowMotion?

FlowMotion is an autonomous AI video production pipeline. Describe a video in plain language and the system writes the script, generates cinematic clips, adds narration, and renders a final MP4 — all without manual editing.

Three paths to create video:

| Path | Description |
|------|-------------|
| **AI Video (Veo 3)** | Full autonomous pipeline: Gemini writes the script, Veo generates clips, ElevenLabs narrates, Remotion renders |
| **Remotion-Only** | Bring your own clips — Remotion composes them with text overlays and transitions |
| **Upload & Edit** | Upload existing video and use the AI Director chat to request edits |

---

## Sponsor Integrations

We refused to do basic integrations. Every sponsor tool was pushed to handle unpopular or highly creative features within our autonomous video production pipeline:

### 🌊 DigitalOcean — Complete Cloud Infrastructure
Instead of basic hosting, we rely heavily on DigitalOcean for both compute and storage. FlowMotion is deployed via **DigitalOcean App Platform** (`.do/app.yaml`) to handle the CPU-intensive Remotion server-side rendering (`renderMedia`). All intermediate and final video assets are securely stored and served via **DigitalOcean Spaces** (S3-compatible object storage with a built-in CDN), ensuring lightning-fast playback for end users.

### 💬 assistant-ui — The AI Director Chat & Heatmap
Not just a static chat interface. We used `@assistant-ui/react` to build an interactive AI Director. It understands the context of the video being generated, allowing users to interrupt the generation pipeline and tweak prompts for specific scenes mid-flight. We also integrated the `heat-graph` component to visually display the user's video generation activity over time.

### 📊 Nexla — Autonomous Trend Ingestion
Instead of waiting for user prompts, FlowMotion uses Nexla's live data pipelines to feed real-time trending topics (news, crypto market movements, local weather). We built autonomous "cron-style" agents that watch Nexla Nexsets and automatically trigger video generation when specific thresholds are met, resulting in a zero-click "Data-to-Video" pipeline.

### 💻 Augment Code — AI-Assisted Development
Building a complex pipeline integrating multiple asynchronous generative APIs (Veo, ElevenLabs, Gemini) and a programmatic video renderer (Remotion) was a massive architectural challenge. We used Augment Code's AI-assisted development tooling throughout the build to quickly scaffold API routes, manage complex TypeScript types across the pipeline, and debug Remotion server-side rendering issues.

---

## Architecture

See [`docs/flowmotion_architecture_v4.mermaid`](docs/flowmotion_architecture_v4.mermaid) for the full system diagram.

**Core flow:** User prompt &rarr; Gemini script &rarr; Veo clips + ElevenLabs narration &rarr; Remotion composition &rarr; MP4 output

---

## Quick Start

```bash
git clone https://github.com/yhinai/flowMotion.git
cd flowMotion
cp .env.example .env
# Fill in your API keys (see table below)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the app.

---

## Environment Variables

| Variable | Purpose | Where to get it |
|----------|---------|-----------------|
| `GEMINI_API_KEY` | Gemini + Veo video generation | [Google AI Studio](https://aistudio.google.com/apikey) |
| `ELEVENLABS_API_KEY` | TTS narration and sound effects | [ElevenLabs Settings](https://elevenlabs.io/app/settings/api-keys) |
| `GOOGLE_CLOUD_PROJECT_ID` | Vertex AI / Lyria music generation | [GCP Console](https://console.cloud.google.com) |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI region (default: `us-central1`) | Same as above |
| `DO_SPACES_KEY` | DigitalOcean Spaces access key | [DO API Settings](https://cloud.digitalocean.com/account/api/spaces) |
| `DO_SPACES_SECRET` | DigitalOcean Spaces secret key | Same as above |
| `DO_SPACES_BUCKET` | Spaces bucket name (default: `flowmotion-videos`) | [DO Spaces](https://cloud.digitalocean.com/spaces) |
| `DO_SPACES_REGION` | Spaces region (default: `nyc3`) | Same as above |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (fallback storage) | [Supabase Dashboard](https://supabase.com/dashboard) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Same as above |
| `NEXLA_API_KEY` | Nexla live data pipeline access | [Nexla](https://dataops.nexla.io) |
| `NEXLA_NEWS_NEXSET_ID` | Nexla news flow ID | Same as above |
| `NEXLA_CRYPTO_NEXSET_ID` | Nexla crypto flow ID | Same as above |
| `NEXLA_WEATHER_NEXSET_ID` | Nexla weather flow ID | Same as above |
| `TELEGRAM_BOT_TOKEN` | Telegram bot interface (optional) | [@BotFather](https://t.me/BotFather) |
| `REDIS_URL` | Redis for BullMQ job queue (optional) | Your Redis instance |
| `ENABLE_BULLMQ` | Enable persistent job queue (`true`/`false`) | Set to `true` to enable |
| `NEXT_PUBLIC_APP_URL` | Public app URL | Your deployment URL |

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 15 (App Router) |
| Script Generation | Google Gemini 2.5 Flash |
| Video Generation | Google Veo 3 |
| Narration | ElevenLabs |
| Music | Google Lyria 2 |
| Video Composition | Remotion |
| Chat UI | assistant-ui |
| Live Data | Nexla |
| Storage | DigitalOcean Spaces / Supabase (fallback) |
| Bot Interface | Telegram |

---

## Deploy to DigitalOcean

An App Platform spec is included at `.do/app.yaml`. Import the repo via the [DigitalOcean App Platform](https://cloud.digitalocean.com/apps) and fill in the environment variables.

---

## License

MIT

<p align="center">
  <strong>FlowMotion</strong> &mdash; Built at the Zero to Agent Hackathon, San Francisco, March 2026.
</p>
