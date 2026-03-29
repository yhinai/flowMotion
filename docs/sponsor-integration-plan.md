# Sponsor Integration Plan

## Overview

Three sponsor tools to integrate into FlowMotion:

| Sponsor | Tool | Priority |
|---------|------|----------|
| DigitalOcean | App Platform deployment + `.do/app.yaml` | High — production hosting |
| assistant-ui | Chat UI primitives for the generation interface | High — core UX |
| assistant-ui | `heat-graph` activity heatmap | Medium — dashboard feature |

---

## 1. DigitalOcean App Platform

**Repo:** https://github.com/digitalocean-labs/do-app-platform-skills

### What it provides
Structured deployment skills and YAML configuration patterns for running apps on DigitalOcean App Platform — including Next.js, PostgreSQL, CI/CD, networking, and production troubleshooting guides. These integrate directly with AI assistants (Claude, Cursor) as a skills source.

### Current status
`.do/app.yaml` already exists in the repo (added in the charlie merge). It needs to be completed and validated against the App Platform skills guidance.

### Integration steps

1. **Complete `.do/app.yaml`**
   - Add environment variable references for all `.env` keys (as secrets, not hardcoded values)
   - Configure the Next.js service with correct build command (`npm run build`) and run command (`npm start`)
   - Add a managed PostgreSQL database component if job metadata moves off Supabase
   - Set health check endpoint (`/api/status/health` or similar)

2. **Add App Platform deploy button to README**
   ```markdown
   [![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/yhinai/flowMotion)
   ```

3. **CI/CD via GitHub Actions**
   - Auto-deploy `main` branch to App Platform on push
   - Use `digitalocean/app_action` GitHub Action

4. **Storage**
   - DO Spaces is already wired in `src/lib/spaces.ts` as the primary storage backend
   - Ensure `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_BUCKET`, `DO_SPACES_REGION` are set as App Platform secrets

### Demo talking point
> "FlowMotion deploys as a single-click App Platform app — the `.do/app.yaml` captures every service, secret, and storage bucket so anyone can spin up their own instance."

---

## 2. assistant-ui — Chat Interface

**Repo:** https://github.com/assistant-ui/assistant-ui
**Docs:** https://www.assistant-ui.com

### What it provides
Production-grade composable React primitives for AI chat UIs — streaming, markdown rendering, tool call display, voice input, attachments. Works with Vercel AI SDK and Anthropic/Gemini backends.

### Integration target
Replace or wrap the existing `AiAssistant.tsx` component with assistant-ui primitives to get streaming, proper message threading, tool call display, and accessible UX out of the box.

### Integration steps

1. **Install**
   ```bash
   npm install @assistant-ui/react @assistant-ui/react-ai-sdk
   ```

2. **Wire to existing `/api/chat` route**
   - The existing route at `src/app/api/chat/route.ts` already handles Gemini streaming
   - Add Vercel AI SDK adapter if not already using it, or use `useExternalStoreRuntime` for custom backends

3. **Replace `AiAssistant.tsx`**
   ```tsx
   // src/components/AiAssistant.tsx
   import { Thread } from "@assistant-ui/react";
   import { useChatRuntime } from "@assistant-ui/react-ai-sdk";

   export function AiAssistant() {
     const runtime = useChatRuntime({ api: "/api/chat" });
     return <Thread runtime={runtime} />;
   }
   ```

4. **Add tool call rendering**
   - Display video generation progress as a tool call card inside the chat thread
   - When the model triggers `generate_video`, show a `<VideoGenerationCard jobId={...} />` inline

5. **Style with existing design system**
   - assistant-ui is headless — apply existing Tailwind classes via `className` props
   - Use `makeMarkdownText` utility for styled markdown rendering in responses

### Demo talking point
> "The chat interface is built on assistant-ui — giving us streaming, tool call display, and voice input without writing any of that infrastructure ourselves."

---

## 3. assistant-ui — Heat Graph

**Docs:** https://www.assistant-ui.com/docs/utilities/heat-graph

### What it provides
A headless GitHub-style activity heatmap component (Radix-style primitives, Tailwind-compatible, built-in tooltips).

### Integration target
Add a "Generation Activity" heatmap to the dashboard showing when videos were generated — useful for the demo to show platform usage at a glance.

### Integration steps

1. **Install**
   ```bash
   npm install @assistant-ui/heat-graph
   ```

2. **Add activity API endpoint**
   ```ts
   // src/app/api/activity/route.ts
   // Returns { date: string, count: number }[] for the last 365 days
   // Pull from Supabase jobs table grouped by created_at date
   ```

3. **Add heatmap to dashboard**
   ```tsx
   // src/components/ActivityHeatmap.tsx
   "use client";
   import { HeatGraph } from "@assistant-ui/heat-graph";

   export function ActivityHeatmap({ data }: { data: { date: string; count: number }[] }) {
     return (
       <HeatGraph.Root data={data} maxValue={10}>
         <HeatGraph.MonthLabels />
         <HeatGraph.Grid>
           {({ date, value }) => (
             <HeatGraph.Cell date={date} value={value}>
               <HeatGraph.Tooltip>{value} videos on {date}</HeatGraph.Tooltip>
             </HeatGraph.Cell>
           )}
         </HeatGraph.Grid>
       </HeatGraph.Root>
     );
   }
   ```

4. **Place on main dashboard** below the live topics section

### Demo talking point
> "The activity heatmap uses assistant-ui's heat-graph — you can see exactly when the autonomous pipeline fired and generated videos."

---

## Implementation Order

1. **DigitalOcean** — finalize `.do/app.yaml` and deploy to App Platform (needed before demo)
2. **assistant-ui chat** — replace `AiAssistant.tsx` (high visibility, core interaction)
3. **heat-graph** — add activity heatmap to dashboard (polish, good demo visual)
