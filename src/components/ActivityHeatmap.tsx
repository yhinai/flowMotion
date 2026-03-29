"use client";

import { useEffect, useState } from "react";
import * as HeatGraph from "heat-graph";
import type { ActivityDataPoint } from "@/app/api/activity/route";

// Purple-tinted color scale matching FlowMotion's design system
const COLORS = [
  "rgba(255,255,255,0.04)",  // 0 — empty
  "rgba(92,31,222,0.25)",    // 1
  "rgba(92,31,222,0.45)",    // 2-3
  "rgba(92,31,222,0.70)",    // 4-6
  "rgba(205,189,255,0.90)",  // 7+
];

export default function ActivityHeatmap() {
  const [data, setData] = useState<HeatGraph.DataPoint[]>([]);
  const [totalVideos, setTotalVideos] = useState(0);
  const [activeDays, setActiveDays] = useState(0);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((points: ActivityDataPoint[]) => {
        const mapped: HeatGraph.DataPoint[] = points.map((p) => ({
          date: new Date(p.date),
          count: p.count,
        }));
        setData(mapped);
        setTotalVideos(points.reduce((s, p) => s + p.count, 0));
        setActiveDays(points.filter((p) => p.count > 0).length);
      })
      .catch(() => {});
  }, []);

  if (data.length === 0) return null;

  return (
    <div className="w-full rounded-2xl border border-white/8 bg-white/3 px-6 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/70">Generation Activity</span>
          <span className="text-[10px] font-mono text-white/25 border border-white/10 rounded px-1.5 py-0.5">
            assistant-ui / heat-graph
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/40">
          <span>
            <span className="text-white/70 font-medium">{totalVideos}</span> videos
          </span>
          <span>
            <span className="text-white/70 font-medium">{activeDays}</span> active days
          </span>
        </div>
      </div>

      {/* Graph */}
      <HeatGraph.Root data={data} weekStart="monday" colorScale={COLORS}>
        <div className="overflow-x-auto">
          <HeatGraph.Grid className="gap-[3px]">
            {() => (
              <HeatGraph.Cell className="aspect-square w-[10px] rounded-[2px] transition-opacity hover:opacity-80" />
            )}
          </HeatGraph.Grid>
        </div>
        <HeatGraph.Tooltip>
          {({ cell }) => (
            <div className="bg-black/90 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 shadow-lg">
              {cell.count > 0 ? (
                <>
                  <span className="font-medium text-white">{cell.count}</span>{" "}
                  video{cell.count !== 1 ? "s" : ""} on{" "}
                  {cell.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </>
              ) : (
                <span className="text-white/40">
                  No videos on {cell.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          )}
        </HeatGraph.Tooltip>
      </HeatGraph.Root>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-3">
        <span className="text-[10px] text-white/30">Less</span>
        {COLORS.map((color, i) => (
          <div
            key={i}
            className="w-[10px] h-[10px] rounded-[2px]"
            style={{ background: color, border: "1px solid rgba(255,255,255,0.06)" }}
          />
        ))}
        <span className="text-[10px] text-white/30">More</span>
      </div>
    </div>
  );
}
