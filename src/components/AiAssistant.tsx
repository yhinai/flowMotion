"use client";

import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  MessagePartPrimitive,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { useRef, useEffect } from "react";

const FlowMotionAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content
            .filter(
              (c): c is Extract<typeof c, { type: "text" }> => c.type === "text"
            )
            .map((c) => c.text)
            .join(""),
        })),
      }),
      signal: abortSignal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Chat request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      yield { content: [{ type: "text" as const, text: accumulated }] };
    }
  },
};

function ChatThread() {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      {/* Messages viewport */}
      <ThreadPrimitive.Viewport
        ref={viewportRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 scrollbar-thin scrollbar-thumb-white/10"
      >
        <ThreadPrimitive.Empty>
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4 py-8">
            <div className="w-10 h-10 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white/70">AI Director</p>
              <p className="text-xs text-white/40 mt-1">Ask me to refine your prompt, pick a template, or suggest a visual style.</p>
            </div>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            Message: ChatMessage,
          }}
        />

        <ThreadPrimitive.ScrollToBottom className="hidden" />
      </ThreadPrimitive.Viewport>

      {/* Composer */}
      <ComposerPrimitive.Root className="p-3 border-t border-white/10">
        <div className="flex items-end gap-2">
          <ComposerPrimitive.Input
            placeholder="Ask the AI director…"
            className="flex-1 bg-white/5 text-white placeholder-white/30 text-sm px-3 py-2 rounded-xl border border-white/10 outline-none focus:border-white/25 resize-none min-h-[38px] max-h-[120px]"
            autoFocus={false}
          />
          <ComposerPrimitive.Send className="p-2 rounded-full bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10 border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

function ChatMessage() {
  return (
    <MessagePrimitive.Root className="flex data-[role=user]:justify-end data-[role=assistant]:justify-start">
      <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm data-[role=user]:bg-[var(--primary)]/20 data-[role=user]:text-[#cdbdff] data-[role=user]:border data-[role=user]:border-[var(--primary)]/20 data-[role=assistant]:bg-white/5 data-[role=assistant]:text-white/90 data-[role=assistant]:border data-[role=assistant]:border-white/5">
        <MessagePartPrimitive.Text />
      </div>
    </MessagePrimitive.Root>
  );
}

export default function AiAssistant() {
  const runtime = useLocalRuntime(FlowMotionAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-full rounded-2xl border border-white/10 overflow-hidden bg-black/30 backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
          <span className="text-sm font-medium text-white/80">AI Director</span>
          <span className="ml-auto text-[10px] text-white/30 font-mono">assistant-ui</span>
        </div>

        {/* Thread */}
        <div className="flex-1 min-h-0">
          <ChatThread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
