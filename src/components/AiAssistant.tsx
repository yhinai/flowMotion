"use client";

import { AssistantRuntimeProvider, useLocalRuntime, type ChatModelAdapter } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";

const FlowMotionAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content
            .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
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

export default function AiAssistant() {
  const runtime = useLocalRuntime(FlowMotionAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-full rounded-2xl border border-white/10 overflow-hidden">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}
