"use client";

import { useState, useEffect, useCallback } from "react";
import type { LiveTopic } from "@/app/api/live-topics/route";

interface LiveTopicsProps {
  onSelectTopic: (prompt: string) => void;
  disabled?: boolean;
}

const TYPE_ICON: Record<LiveTopic["type"], React.ReactNode> = {
  news: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h6m-6-4h6" />
    </svg>
  ),
  crypto: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  weather: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  ),
};

const TYPE_COLOR: Record<LiveTopic["type"], { text: string; bg: string }> = {
  news: { text: "var(--secondary)", bg: "rgba(156, 202, 255, 0.08)" },
  crypto: { text: "var(--success)", bg: "rgba(125, 220, 142, 0.08)" },
  weather: { text: "#ffcc66", bg: "rgba(255, 204, 102, 0.08)" },
};

export default function LiveTopics({ onSelectTopic, disabled }: LiveTopicsProps) {
  const [topics, setTopics] = useState<LiveTopic[]>([]);
  const [nexlaConnected, setNexlaConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    try {
      const res = await fetch("/api/live-topics");
      if (!res.ok) return;
      const data = await res.json();
      setTopics(data.topics ?? []);
      setNexlaConnected(data.nexlaConnected ?? false);
      setLastFetch(data.fetchedAt ?? null);
    } catch {
      // silently ignore — this panel is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
    const interval = setInterval(fetchTopics, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchTopics]);

  if (!loading && topics.length === 0) return null;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: nexlaConnected ? "var(--success)" : "var(--outline)",
              boxShadow: nexlaConnected ? "0 0 6px rgba(125, 220, 142, 0.5)" : "none",
            }}
          />
          <span className="text-label-md" style={{ color: "var(--outline)" }}>
            Live Topics
          </span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 neu-inset-sm"
            style={{ color: "var(--outline)", borderRadius: "var(--radius-sm)", fontSize: "0.6rem" }}
          >
            {nexlaConnected ? "via Nexla" : "live data"}
          </span>
        </div>
        <button
          onClick={fetchTopics}
          disabled={loading || disabled}
          className="transition-colors disabled:opacity-30"
          style={{ color: "var(--outline)" }}
          title="Refresh topics"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Topics grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14 w-full" style={{ borderRadius: "var(--radius-lg)" }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {topics.map((topic) => {
            const colors = TYPE_COLOR[topic.type];
            return (
              <button
                key={topic.id}
                onClick={() => onSelectTopic(topic.suggestedPrompt)}
                disabled={disabled}
                className="neu-raised-sm group text-left px-3 py-2.5 transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed"
                style={{ borderRadius: "var(--radius-lg)" }}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 flex-shrink-0 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ color: colors.text, background: colors.bg }}
                  >
                    {TYPE_ICON[topic.type]}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-xs font-medium leading-snug line-clamp-2 transition-colors"
                      style={{ color: "var(--on-surface-variant)" }}
                    >
                      {topic.headline}
                    </p>
                    <p className="mt-0.5 text-[10px] truncate" style={{ color: "var(--outline)" }}>
                      {topic.context}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {lastFetch && !loading && (
        <p className="mt-2 text-[10px] text-right" style={{ color: "var(--outline)" }}>
          Updated {new Date(lastFetch).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
