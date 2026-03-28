"use client";

import { useState, useEffect, useCallback } from "react";
import type { LiveTopic } from "@/app/api/live-topics/route";

interface LiveTopicsProps { onSelectTopic: (p: string) => void; disabled?: boolean; }
const TYPE_COLOR: Record<LiveTopic["type"], string> = { news: "var(--info)", crypto: "var(--success)", weather: "var(--warning)" };

export default function LiveTopics({ onSelectTopic, disabled }: LiveTopicsProps) {
  const [topics, setTopics] = useState<LiveTopic[]>([]);
  const [nexlaConnected, setNexlaConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const fetchTopics = useCallback(async () => {
    try { const res = await fetch("/api/live-topics"); if (!res.ok) return; const d = await res.json(); setTopics(d.topics ?? []); setNexlaConnected(d.nexlaConnected ?? false); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { setMounted(true); fetchTopics(); const i = setInterval(fetchTopics, 5*60*1000); return () => clearInterval(i); }, [fetchTopics]);
  if (!mounted) return null;
  if (!loading && topics.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: nexlaConnected ? "var(--success)" : "var(--text-muted)" }} />
        <span className="text-label">Live Topics</span>
        <button onClick={fetchTopics} disabled={loading} className="btn-ghost p-1 disabled:opacity-30" title="Refresh">
          <svg className={`w-3 h-3 ${loading?"animate-spin":""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 gap-2">{[0,1].map(i=><div key={i} className="skeleton h-12 w-full rounded-md" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {topics.map((t) => (
            <button key={t.id} onClick={() => onSelectTopic(t.suggestedPrompt)} disabled={disabled}
              className="card-flat text-left px-3 py-2 disabled:opacity-30 group">
              <div className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: TYPE_COLOR[t.type] }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug line-clamp-1" style={{ color: "var(--text)" }}>{t.headline}</p>
                  <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{t.context}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
