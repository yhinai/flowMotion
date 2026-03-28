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

const TYPE_COLOR: Record<LiveTopic["type"], string> = {
  news: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  crypto: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  weather: "text-amber-400 bg-amber-500/10 border-amber-500/20",
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
    // Refresh every 5 minutes
    const interval = setInterval(fetchTopics, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchTopics]);

  if (!loading && topics.length === 0) return null;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${nexlaConnected ? "bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-white/30"}`} />
          <span className="text-label-md text-white/60">
            Live Topics
          </span>
          <span className="text-[10px] font-mono text-white/25 border border-white/10 rounded px-1.5 py-0.5">
            {nexlaConnected ? "via Nexla" : "live data"}
          </span>
        </div>
        <button
          onClick={fetchTopics}
          disabled={loading || disabled}
          className="text-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
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
            <div key={i} className="skeleton h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {topics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => onSelectTopic(topic.suggestedPrompt)}
              disabled={disabled}
              className="group text-left rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 transition-all duration-150 hover:bg-white/6 hover:border-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 flex-shrink-0 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${TYPE_COLOR[topic.type]}`}>
                  {TYPE_ICON[topic.type]}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/80 group-hover:text-white/95 leading-snug line-clamp-2 transition-colors">
                    {topic.headline}
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/35 truncate">
                    {topic.context}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {lastFetch && !loading && (
        <p className="mt-2 text-[10px] text-white/20 text-right">
          Updated {new Date(lastFetch).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
