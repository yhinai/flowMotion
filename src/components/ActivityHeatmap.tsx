"use client";

import { useEffect, useState } from "react";
import type { ActivityDataPoint } from "@/app/api/activity/route";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getColor(count: number): string {
  if (count === 0) return "rgba(255,255,255,0.04)";
  if (count === 1) return "rgba(92,31,222,0.35)";
  if (count <= 3) return "rgba(92,31,222,0.60)";
  if (count <= 6) return "rgba(92,31,222,0.85)";
  return "rgba(205,189,255,0.95)";
}

export default function ActivityHeatmap() {
  const [data, setData] = useState<ActivityDataPoint[]>([]);
  const [totalVideos, setTotalVideos] = useState(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((points: ActivityDataPoint[]) => {
        setData(points);
        setTotalVideos(points.reduce((s, p) => s + p.count, 0));
      })
      .catch(() => {});

    // Refresh every 30s so new generations appear live during demo
    const interval = setInterval(() => {
      fetch("/api/activity")
        .then((r) => r.json())
        .then((points: ActivityDataPoint[]) => {
          setData(points);
          setTotalVideos(points.reduce((s, p) => s + p.count, 0));
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (data.length === 0) return null;

  // Group into 30 days × 24 hours grid
  const days: ActivityDataPoint[][] = [];
  for (let i = 0; i < 30; i++) {
    days.push(data.slice(i * 24, (i + 1) * 24));
  }

  const dayLabels = days.map((d) => {
    if (!d[0]) return "";
    const date = new Date(d[0].datetime + ":00:00Z");
    return DAYS[date.getUTCDay()];
  });

  const activeHours = data.filter((p) => p.count > 0).length;

  return (
    <div className="w-full rounded-2xl border border-white/8 bg-white/3 px-6 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/70">Generation Activity</span>
          <span className="text-[10px] font-mono text-white/25 border border-white/10 rounded px-1.5 py-0.5">
            assistant-ui / heat-graph
          </span>
          <span className="text-[10px] text-white/25">last 30 days · by hour</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/40">
          <span><span className="text-white/70 font-medium">{totalVideos}</span> videos</span>
          <span><span className="text-white/70 font-medium">{activeHours}</span> active hours</span>
        </div>
      </div>

      {/* Grid: 7 days (rows) × 24 hours (columns) */}
      <div className="relative" onMouseLeave={() => setTooltip(null)}>
        {/* Hour labels (0, 6, 12, 18) */}
        <div className="flex mb-1 pl-8">
          {[0, 6, 12, 18].map((h) => (
            <div
              key={h}
              className="text-[9px] text-white/20 flex-none"
              style={{ marginLeft: h === 0 ? 0 : `calc(${6 / 24 * 100}% - 6px)`, width: "12px" }}
            >
              {h === 0 ? "12am" : h === 12 ? "12pm" : `${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`}
            </div>
          ))}
        </div>

        {days.map((dayHours, di) => (
          <div key={di} className="flex items-center gap-1 mb-[3px]">
            {/* Day label */}
            <div className="text-[9px] text-white/25 w-7 flex-none text-right pr-1">
              {dayLabels[di]}
            </div>
            {/* Hour cells */}
            <div className="flex gap-[2px] flex-1">
              {dayHours.map((point, hi) => {
                const date = new Date(point.datetime + ":00:00Z");
                const hourLabel = date.getUTCHours();
                const ampm = hourLabel >= 12 ? "pm" : "am";
                const h12 = hourLabel % 12 || 12;
                const dateLabel = date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

                return (
                  <div
                    key={hi}
                    className="flex-1 aspect-square rounded-[2px] cursor-default transition-opacity hover:opacity-70"
                    style={{ background: getColor(point.count) }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const parentRect = e.currentTarget.closest(".relative")!.getBoundingClientRect();
                      setTooltip({
                        x: rect.left - parentRect.left + rect.width / 2,
                        y: rect.top - parentRect.top - 8,
                        text: point.count > 0
                          ? `${point.count} video${point.count !== 1 ? "s" : ""} · ${dateLabel} ${h12}${ampm}`
                          : `No videos · ${dateLabel} ${h12}${ampm}`,
                      });
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-10 pointer-events-none bg-black/90 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 shadow-lg whitespace-nowrap -translate-x-1/2 -translate-y-full"
            style={{ left: tooltip.x + 32, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-3">
        <span className="text-[10px] text-white/30">Less</span>
        {[0, 1, 3, 5, 7].map((v) => (
          <div
            key={v}
            className="w-[10px] h-[10px] rounded-[2px]"
            style={{ background: getColor(v), border: "1px solid rgba(255,255,255,0.06)" }}
          />
        ))}
        <span className="text-[10px] text-white/30">More</span>
      </div>
    </div>
  );
}
