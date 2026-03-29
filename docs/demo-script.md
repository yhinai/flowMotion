# FlowMotion -- 3-Minute Demo Script

> Target: Devpost submission video. Keep energy high, cuts fast, no dead air.

---

## 0:00 -- 0:20 | Hook

**[Screen: FlowMotion landing page, then quick montage of prompt -> generation -> final video]**

> "What if you could type one sentence and get back a fully produced video -- scripted, filmed, narrated, and rendered -- without touching an editor? That's FlowMotion. It's an autonomous AI video pipeline that turns a text prompt into a finished MP4 in minutes. Let me show you."

---

## 0:20 -- 0:50 | Live Topics + Auto-Generate (Nexla)

**[Screen: Dashboard with Live Topics panel visible, cards showing crypto/weather/news]**

> "FlowMotion doesn't even need your prompt. It pulls live data -- crypto prices from CoinGecko, weather from Open-Meteo, breaking news -- all flowing through Nexla data pipelines into the app in real time."

**[Hover over a crypto topic card showing "Bitcoin surging 1.4% in 24h"]**

> "Each trending topic becomes a ready-to-shoot video prompt. But watch this --"

**[Click the "Auto-Generate" button]**

> "One click on Auto-Generate and the top topic goes straight into the pipeline. No prompt writing, no configuration. Nexla feeds the data, FlowMotion makes the video. Fully autonomous."

**[Show redirect to /generate page, job kicks off]**

---

## 0:50 -- 1:20 | AI Director Chat (assistant-ui)

**[Screen: While generation runs in the background, switch to the AI Director panel]**

> "While that's rendering, let me show you the other side of FlowMotion -- the AI Director, powered by assistant-ui."

**[Show empty state with 4 starter prompt chips]**

> "Starter suggestions get you going instantly. Click one --"

**[Click "Write me a cinematic product launch prompt" -- AI streams back a detailed response]**

> "The AI writes cinematic prompts, picks the right template, tunes your pacing and visual style. It's a real creative collaborator -- streaming responses, threaded conversation, composer controls. All built on assistant-ui's primitives."

**[Copy the AI's suggested prompt, paste it into the main prompt input]**

> "Take the prompt, paste it, generate. That simple."

---

## 1:20 -- 1:50 | Video Completes + Delivery

**[Screen: Generation page -- progress bar completes. Video player shows the finished result.]**

> "And we're done. Here's our video -- Gemini wrote the script, Veo 3 generated each scene, ElevenLabs narrated it, Remotion composed everything with text overlays and transitions."

**[Click play -- show a few seconds of the rendered video]**

> "Download the MP4 directly --"

**[Click download button]**

> "-- or get it delivered straight to Telegram. The bot gives you the same full pipeline through a chat conversation: pick your model, style, aspect ratio, and it handles everything."

**[Quick flash of Telegram bot conversation showing model selection and video delivery]**

---

## 1:50 -- 2:30 | Architecture + Sponsor Callouts

**[Screen: Architecture diagram (docs/flowmotion_architecture_v4.mermaid) or clean split-screen with sponsor logos]**

> "Here's what powers FlowMotion under the hood."

> "**Nexla** is our live data backbone. We created Nexla flows that pull from public APIs, transform the data into Nexsets, and feed trending topics directly into the app. No manual data wrangling -- just connect a source and the topics update in real time."

**[Highlight Nexla in the architecture diagram]**

> "**assistant-ui** powers the AI Director. Thread primitives, streaming message parts, composer controls -- we had a production-quality conversational UI running in hours, not weeks. The starter prompts, the streaming responses, the message history -- all assistant-ui."

**[Highlight assistant-ui in the diagram]**

> "**DigitalOcean Spaces** stores every rendered video and intermediate asset. S3-compatible object storage with built-in CDN -- videos are fast to access from anywhere in the world."

**[Highlight DO Spaces in the diagram]**

> "And **Augment Code** accelerated our development throughout the entire hackathon -- helping us ship a full-stack autonomous video pipeline in record time."

---

## 2:30 -- 3:00 | Close + Call to Action

**[Screen: FlowMotion landing page with the Live Topics panel and AI Director visible]**

> "FlowMotion. Type a prompt, click a trending topic, or let the system decide for you. Either way, you get a fully produced video in minutes."

> "Three paths to create: AI Video with Veo 3, Remotion-only composition, or upload-and-edit. One platform, zero manual editing."

**[Screen: Browser showing the live app URL]**

> "Try it live right now."

**[End card: FlowMotion logo, live demo URL, GitHub repo link, team name]**

---

## Production Notes

- Record at 1080p, 30fps with a clean browser window (no bookmarks bar, minimal tabs)
- Voiceover: energetic but clear -- rehearse to hit timing marks naturally
- If a live API call is slow during recording, have a pre-cached response ready as backup
- For the Auto-Generate flow: trigger it early so the video finishes by the 1:20 mark
- Architecture diagram: export the mermaid file as a clean PNG/SVG before recording
- Total runtime target: 2:50-3:00 (leave buffer before the hard 3:00 cutoff)
