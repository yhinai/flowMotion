"use client";

import { useState, useRef, useEffect } from "react";
import type { CompositionStyle, EditHistoryEntry, EditResponse } from "@/lib/types";
import { DEFAULT_STYLE } from "@/lib/types";

interface EditPanelProps {
  currentStyle: CompositionStyle;
  onStyleChange: (style: CompositionStyle, explanation: string) => void;
}

export default function EditPanel({ currentStyle, onStyleChange }: EditPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const handleSubmit = async () => {
    if (!instruction.trim() || isLoading) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, currentStyle }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data: EditResponse = await res.json();
      const entry: EditHistoryEntry = {
        instruction,
        style: data.style,
        explanation: data.explanation,
        timestamp: new Date().toISOString(),
      };
      setHistory((prev) => [...prev, entry]);
      onStyleChange(data.style, data.explanation);
      setInstruction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    const previousStyle = newHistory.length > 0 ? newHistory[newHistory.length - 1].style : DEFAULT_STYLE;
    onStyleChange(previousStyle, "Reverted to previous style");
  };

  const handleReset = () => {
    setHistory([]);
    onStyleChange(DEFAULT_STYLE, "Reset to default style");
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="neu-raised flex h-full flex-col animate-fade-in" style={{ borderRadius: "var(--radius-xl)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(163, 177, 198, 0.2)" }}>
        <h2 className="text-headline-md" style={{ fontSize: "1.15rem" }}>Style Editor</h2>
        <div className="flex gap-1.5">
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="neu-button px-2.5 py-1 text-xs disabled:opacity-25 disabled:cursor-not-allowed"
          >
            Undo
          </button>
          <button onClick={handleReset} className="neu-button px-2.5 py-1 text-xs">
            Reset
          </button>
        </div>
      </div>

      {/* History */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {history.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-5">
            <p className="text-center text-sm" style={{ color: "var(--outline)" }}>
              Describe how you&apos;d like to edit the video style
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Make title bigger", "Dark overlay", "Hide subtitles", "Serif font"].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInstruction(suggestion)}
                  className="neu-raised-sm px-3 py-1.5 text-xs transition-all duration-200"
                  style={{ color: "var(--primary)", borderRadius: "var(--radius-pill)" }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {history.map((entry, i) => (
          <div key={i} className="animate-fade-in space-y-2" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="flex justify-end">
              <div className="neu-raised-sm max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm" style={{ color: "var(--primary-fixed)" }}>
                {entry.instruction}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="neu-inset-sm max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm" style={{ color: "var(--on-surface-variant)" }}>
                {entry.explanation}
                <span className="block mt-1 text-[0.625rem]" style={{ color: "var(--outline)" }}>
                  {formatTime(entry.timestamp)}
                </span>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-1.5 px-1 py-2">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        <div ref={historyEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-2 text-xs neu-inset-sm rounded-lg px-3 py-2" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(163, 177, 198, 0.2)" }}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Make the title bigger and blue..."
            disabled={isLoading}
            className="neu-inset-sm flex-1 text-sm px-3.5 py-2 outline-none disabled:opacity-40"
            style={{ color: "var(--on-surface)", borderRadius: "var(--radius-md)" }}
          />
          <button
            onClick={handleSubmit}
            disabled={!instruction.trim() || isLoading}
            aria-label={isLoading ? "Sending edit instruction" : "Send edit instruction"}
            className="neu-button flex h-9 w-9 flex-shrink-0 items-center justify-center disabled:opacity-25 disabled:cursor-not-allowed"
            style={{
              borderRadius: "var(--radius-md)",
              background: instruction.trim()
                ? "linear-gradient(145deg, #7340F0, #5520D0)"
                : "linear-gradient(145deg, #EDF1F7, #D9DDE5)",
              color: instruction.trim() ? "white" : "var(--outline)",
            }}
          >
            {isLoading ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h12m-5-5l5 5-5 5" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
