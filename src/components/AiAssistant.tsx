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
import { useRef } from "react";

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
      <ThreadPrimitive.Viewport
        ref={viewportRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
      >
        <ThreadPrimitive.Empty>
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4 py-8">
            <div
              className="neu-pressed w-10 h-10 flex items-center justify-center"
              style={{ borderRadius: "var(--radius-md)" }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--primary)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--on-surface-variant)" }}>AI Director</p>
              <p className="text-xs mt-1" style={{ color: "var(--outline)" }}>
                Ask me to refine your prompt, pick a template, or suggest a visual style.
              </p>
            </div>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{ Message: ChatMessage }}
        />

        <ThreadPrimitive.ScrollToBottom className="hidden" />
      </ThreadPrimitive.Viewport>

      {/* Composer */}
      <div style={{ borderTop: "1px solid rgba(163, 177, 198, 0.2)" }}>
        <ComposerPrimitive.Root className="p-3">
          <div className="flex items-end gap-2">
            <ComposerPrimitive.Input
              placeholder="Ask the AI director..."
              className="neu-inset-sm flex-1 text-sm px-3.5 py-2 outline-none resize-none min-h-[38px] max-h-[120px]"
              style={{
                color: "var(--on-surface)",
                borderRadius: "var(--radius-md)",
              }}
              autoFocus={false}
            />
            <ComposerPrimitive.Send
              className="neu-button p-2 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderRadius: "var(--radius-md)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
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
      <div
        className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm data-[role=user]:neu-raised-sm data-[role=assistant]:neu-inset-sm"
        style={{ borderRadius: "var(--radius-lg)" }}
      >
        <MessagePartPrimitive.Text />
      </div>
    </MessagePrimitive.Root>
  );
}

export default function AiAssistant() {
  const runtime = useLocalRuntime(FlowMotionAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        className="neu-raised flex flex-col h-full overflow-hidden"
        style={{ borderRadius: "var(--radius-xl)" }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(163, 177, 198, 0.2)" }}
        >
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: "var(--success)", boxShadow: "0 0 6px rgba(125, 220, 142, 0.5)" }}
          />
          <span className="text-sm font-medium" style={{ color: "var(--on-surface-variant)" }}>
            AI Director
          </span>
          <span className="ml-auto text-[10px] font-mono" style={{ color: "var(--outline)" }}>
            assistant-ui
          </span>
        </div>

        {/* Thread */}
        <div className="flex-1 min-h-0">
          <ChatThread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
