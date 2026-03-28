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

  useEffect(() => { historyEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history]);

  const handleSubmit = async () => {
    if (!instruction.trim() || isLoading) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction, currentStyle }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Request failed (${res.status})`); }
      const data: EditResponse = await res.json();
      setHistory((prev) => [...prev, { instruction, style: data.style, explanation: data.explanation, timestamp: new Date().toISOString() }]);
      onStyleChange(data.style, data.explanation);
      setInstruction("");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); } finally { setIsLoading(false); }
  };

  return (
    <div className="card flex h-full flex-col overflow-hidden animate-fade-in">
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-light)" }}>
        <h2 className="text-heading-sm">Style Editor</h2>
        <div className="flex gap-1">
          <button onClick={() => { if (history.length === 0) return; const h = history.slice(0, -1); setHistory(h); onStyleChange(h.length > 0 ? h[h.length - 1].style : DEFAULT_STYLE, "Reverted"); }} disabled={history.length === 0} className="btn-ghost text-[0.75rem] disabled:opacity-30">Undo</button>
          <button onClick={() => { setHistory([]); onStyleChange(DEFAULT_STYLE, "Reset"); }} className="btn-ghost text-[0.75rem]">Reset</button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {history.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-caption text-center">Describe how to edit the video style</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {["Make title bigger", "Dark overlay", "Serif font"].map((s) => (
                <button key={s} onClick={() => setInstruction(s)} className="badge badge-primary cursor-pointer text-[0.6875rem]">{s}</button>
              ))}
            </div>
          </div>
        )}
        {history.map((entry, i) => (
          <div key={i} className="space-y-2 animate-fade-in">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-[0.8125rem]" style={{ background: "var(--primary-lighter)", color: "var(--primary)" }}>{entry.instruction}</div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-[0.8125rem]" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>{entry.explanation}</div>
            </div>
          </div>
        ))}
        {isLoading && <div className="flex gap-1 px-1 py-2"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></div>}
        <div ref={historyEndRef} />
      </div>

      {error && <div className="mx-4 mb-2 text-[0.75rem] rounded-md px-3 py-1.5" style={{ background: "var(--error-light)", color: "var(--error)" }}>{error}</div>}

      <div className="p-3" style={{ borderTop: "1px solid var(--border-light)" }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Make the title bigger..."
            disabled={isLoading}
            className="input flex-1 disabled:opacity-50"
            style={{ padding: "0.5rem 0.75rem", fontSize: "0.8125rem" }}
          />
          <button onClick={handleSubmit} disabled={!instruction.trim() || isLoading} className="btn-primary disabled:opacity-30" style={{ padding: "0.5rem 0.75rem" }}>
            {isLoading ? <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12h12m-5-5l5 5-5 5" /></svg>}
          </button>
        </div>
      </div>
    </div>
  );
}
