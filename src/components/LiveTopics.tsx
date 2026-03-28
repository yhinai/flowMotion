"use client";

import { useState, useEffect, useCallback } from "react";
import type { LiveTopic } from "@/app/api/live-topics/route";

interface LiveTopicsProps {
  onSelectTopic: (prompt: string) => void;
  disabled?: boolean;
}

const TYPE_COLOR: Record<LiveTopic["type"], string> = {
  news: "#3b82f6",
  crypto: "#10b981",
  weather: "#f59e0b",
};

export default function LiveTopics({ onSelectTopic, disabled }: LiveTopicsProps) {
  const [topics, setTopics] = useState<LiveTopic[]>([]);
  const [nexlaConnected, setNexlaConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTopics = useCallback(async () => {
    try {
      const res = await fetch("/api/live-topics");
      if (!res.ok) return;
      const data = await res.json();
      setTopics(data.topics ?? []);
      setNexlaConnected(data.nexlaConnected ?? false);
    } catch { /* non-critical */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchTopics();
    const interval = setInterval(fetchTopics, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchTopics]);

  if (!loading && topics.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: nexlaConnected ? "var(--success)" : "var(--text-tertiary)" }}
        />
        <span className="text-label">Live Topics</span>
        <button onClick={fetchTopics} disabled={loading} className="btn-ghost p-1 disabled:opacity-30" title="Refresh">
          <svg className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[0, 1].map((i) => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {topics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => onSelectTopic(topic.suggestedPrompt)}
              disabled={disabled}
              className="card-flat text-left px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: TYPE_COLOR[topic.type] }}
                />
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-medium leading-snug line-clamp-1 group-hover:text-[var(--text-primary)]" style={{ color: "var(--text-secondary)" }}>
                    {topic.headline}
                  </p>
                  <p className="text-[0.6875rem] truncate" style={{ color: "var(--text-tertiary)" }}>{topic.context}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
