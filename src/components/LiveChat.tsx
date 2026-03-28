"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: Date;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

interface LiveChatProps {
  onToolCall?: (
    name: string,
    args: Record<string, unknown>
  ) => void;
}

export default function LiveChat({ onToolCall }: LiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (sessionId) {
        fetch(`/api/live?sessionId=${sessionId}`, { method: "DELETE" }).catch(
          () => {}
        );
      }
    };
  }, [sessionId]);

  const addMessage = useCallback(
    (role: ChatMessage["role"], content: string, extra?: Partial<ChatMessage>) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role,
          content,
          timestamp: new Date(),
          ...extra,
        },
      ]);
    },
    []
  );

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);

    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);

    const es = new EventSource(`/api/live?sessionId=${newSessionId}`);
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setIsConnected(true);
      setIsConnecting(false);
      addMessage("assistant", "Connected! How can I help you edit your video?");
    });

    es.addEventListener("text", (event) => {
      const data = JSON.parse(event.data);
      addMessage("assistant", data.text);
    });

    es.addEventListener("tool_call", (event) => {
      const data = JSON.parse(event.data);
      addMessage("tool", `Applied: ${formatToolCall(data.name, data.args)}`, {
        toolName: data.name,
        toolArgs: data.args,
      });
      onToolCall?.(data.name, data.args);
    });

    es.addEventListener("error", (event) => {
      if (event instanceof MessageEvent) {
        const data = JSON.parse(event.data);
        addMessage("assistant", `Error: ${data.message}`);
      }
      setIsConnecting(false);
    });

    es.addEventListener("close", () => {
      setIsConnected(false);
      setIsConnecting(false);
      addMessage("assistant", "Session ended.");
    });

    es.onerror = () => {
      setIsConnected(false);
      setIsConnecting(false);
    };
  }, [isConnecting, isConnected, addMessage, onToolCall]);

  const disconnect = useCallback(async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (sessionId) {
      await fetch(`/api/live?sessionId=${sessionId}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    setIsConnected(false);
    setSessionId(null);
  }, [sessionId]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !sessionId || !isConnected) return;

    const text = input.trim();
    setInput("");
    addMessage("user", text);

    await fetch("/api/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, type: "text", text }),
    }).catch(() => {
      addMessage("assistant", "Failed to send message. Please try again.");
    });
  }, [input, sessionId, isConnected, addMessage]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          if (sessionId && base64) {
            addMessage("user", "[Voice message]");
            await fetch("/api/live", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId,
                type: "audio",
                audioData: base64,
                mimeType: "audio/webm",
              }),
            }).catch(() => {
              addMessage(
                "assistant",
                "Failed to send audio. Please try again."
              );
            });
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
    } catch {
      addMessage(
        "assistant",
        "Microphone access denied. Please enable microphone permissions."
      );
    }
  }, [isRecording, sessionId, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className="glass-card flex flex-col h-full overflow-hidden"
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid rgba(73, 68, 86, 0.15)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="h-2 w-2 rounded-full transition-colors"
            style={{
              background: isConnected ? "var(--success)" : "var(--outline)",
              boxShadow: isConnected
                ? "0 0 6px rgba(125, 220, 142, 0.5)"
                : "none",
            }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: "var(--on-surface-variant)" }}
          >
            Live Editor
          </span>
        </div>
        <button
          onClick={isConnected ? disconnect : connect}
          disabled={isConnecting}
          className="rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 disabled:opacity-50"
          style={{
            background: isConnected
              ? "rgba(255, 180, 171, 0.1)"
              : "rgba(125, 220, 142, 0.1)",
            color: isConnected ? "var(--error)" : "var(--success)",
            border: `1px solid ${
              isConnected
                ? "rgba(255, 180, 171, 0.2)"
                : "rgba(125, 220, 142, 0.2)"
            }`,
          }}
        >
          {isConnecting
            ? "Connecting..."
            : isConnected
            ? "Disconnect"
            : "Connect"}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && !isConnected && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm" style={{ color: "var(--outline)" }}>
              Connect to start a live editing session
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className="max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm"
              style={{
                background:
                  msg.role === "user"
                    ? "rgba(92, 31, 222, 0.15)"
                    : msg.role === "tool"
                    ? "rgba(125, 220, 142, 0.08)"
                    : "var(--surface-container)",
                color:
                  msg.role === "user"
                    ? "var(--primary-fixed)"
                    : msg.role === "tool"
                    ? "var(--success)"
                    : "var(--on-surface-variant)",
                border: `1px solid ${
                  msg.role === "user"
                    ? "rgba(205, 189, 255, 0.15)"
                    : msg.role === "tool"
                    ? "rgba(125, 220, 142, 0.15)"
                    : "rgba(73, 68, 86, 0.1)"
                }`,
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className="p-3"
        style={{ borderTop: "1px solid rgba(73, 68, 86, 0.15)" }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={toggleRecording}
            disabled={!isConnected}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: isRecording
                ? "rgba(255, 180, 171, 0.15)"
                : "var(--surface-container)",
              color: isRecording ? "var(--error)" : "var(--outline)",
              border: `1px solid ${
                isRecording
                  ? "rgba(255, 180, 171, 0.3)"
                  : "rgba(73, 68, 86, 0.15)"
              }`,
              animation: isRecording ? "pulse-glow 2s ease-in-out infinite" : "none",
            }}
            title={isRecording ? "Stop recording" : "Talk to AI"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isConnected
                ? "Type a message..."
                : "Connect to start chatting"
            }
            disabled={!isConnected}
            className="flex-1 text-sm px-3.5 py-2 rounded-xl outline-none transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: "var(--surface-container-low)",
              color: "var(--on-surface)",
              border: "1px solid rgba(73, 68, 86, 0.15)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(205, 189, 255, 0.3)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(73, 68, 86, 0.15)";
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!isConnected || !input.trim()}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: input.trim()
                ? "linear-gradient(135deg, var(--primary-container), var(--primary))"
                : "var(--surface-container)",
              color: input.trim() ? "white" : "var(--outline)",
              border: input.trim()
                ? "none"
                : "1px solid rgba(73, 68, 86, 0.15)",
            }}
            title="Send message"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function formatToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "updateScene":
      return `Updated scene ${(args.sceneIndex as number) + 1}`;
    case "changeStyle": {
      const prop = args.property as string;
      const val = args.value;
      return `Changed ${prop} to ${JSON.stringify(val)}`;
    }
    case "addAsset":
      return `Added ${args.type} asset`;
    case "switchTemplate":
      return `Switched to ${args.templateId} template`;
    case "regenerateMusic":
      return `Regenerating music: "${args.prompt}"`;
    case "toggleVeoFinale":
      return `Veo finale ${args.enabled ? "enabled" : "disabled"}`;
    default:
      return `${name}(${JSON.stringify(args)})`;
  }
}
