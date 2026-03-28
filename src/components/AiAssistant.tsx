"use client";

import { AssistantRuntimeProvider, useLocalRuntime, ThreadPrimitive, ComposerPrimitive, MessagePrimitive, MessagePartPrimitive, type ChatModelAdapter } from "@assistant-ui/react";
import { useRef } from "react";

const FlowMotionAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content.filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text").map(c => c.text).join("") })) }),
      signal: abortSignal });
    if (!response.ok || !response.body) throw new Error(`Chat failed (${response.status})`);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let acc = "";
    while (true) { const { done, value } = await reader.read(); if (done) break; acc += decoder.decode(value, { stream: true }); yield { content: [{ type: "text" as const, text: acc }] }; }
  },
};

function ChatThread() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      <ThreadPrimitive.Viewport ref={ref} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        <ThreadPrimitive.Empty>
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4 py-8">
            <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: "var(--bg-subtle)", color: "var(--text-subtle)" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
            </div>
            <div>
              <p className="text-heading-sm">AI Director</p>
              <p className="text-body-sm mt-1">Refine prompts, pick templates, suggest styles.</p>
            </div>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
        <ThreadPrimitive.ScrollToBottom className="hidden" />
      </ThreadPrimitive.Viewport>

      <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <ComposerPrimitive.Root className="p-3">
          <div className="flex items-end gap-2">
            <ComposerPrimitive.Input placeholder="Ask the AI director..." className="input flex-1 resize-none min-h-[36px] max-h-[100px]" style={{ padding: "0.375rem 0.625rem" }} autoFocus={false} />
            <ComposerPrimitive.Send className="btn-primary p-2 flex-shrink-0 disabled:opacity-25">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
            </ComposerPrimitive.Send>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  );
}

function ChatMessage() {
  return (
    <MessagePrimitive.Root className="flex data-[role=user]:justify-end data-[role=assistant]:justify-start">
      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm data-[role=user]:bg-[var(--bg-subtle)] data-[role=user]:text-[var(--text-emphasis)] data-[role=assistant]:bg-[var(--bg-muted)] data-[role=assistant]:text-[var(--text)]">
        <MessagePartPrimitive.Text />
      </div>
    </MessagePrimitive.Root>
  );
}

export default function AiAssistant() {
  const runtime = useLocalRuntime(FlowMotionAdapter);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="card flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--success)" }} />
          <span className="text-heading-sm text-sm">AI Director</span>
        </div>
        <div className="flex-1 min-h-0"><ChatThread /></div>
      </div>
    </AssistantRuntimeProvider>
  );
}
