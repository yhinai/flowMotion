import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { z } from "zod";
import { StubCompositionSchema } from "./schemas";

export type DataVisualizationProps = z.infer<typeof StubCompositionSchema>;

const BARS = [
  { label: "Q1", value: 0.6, color: "#3b82f6" },
  { label: "Q2", value: 0.8, color: "#8b5cf6" },
  { label: "Q3", value: 0.45, color: "#ec4899" },
  { label: "Q4", value: 0.95, color: "#10b981" },
];

export const DataVisualization: React.FC<DataVisualizationProps> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0f172a",
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <div
        style={{
          opacity: titleOpacity,
          color: "#ffffff",
          fontSize: 56,
          fontWeight: 700,
          fontFamily: "sans-serif",
          marginBottom: 16,
          textAlign: "center",
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            opacity: titleOpacity,
            color: "#94a3b8",
            fontSize: 28,
            fontFamily: "sans-serif",
            marginBottom: 48,
            textAlign: "center",
          }}
        >
          {subtitle}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 40,
          height: 400,
        }}
      >
        {BARS.map((bar, i) => {
          const barHeight = interpolate(
            frame,
            [10 + i * 8, 30 + i * 8],
            [0, bar.value * 400],
            { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
          );

          return (
            <div
              key={bar.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 80,
                  height: barHeight,
                  backgroundColor: bar.color,
                  borderRadius: "8px 8px 0 0",
                }}
              />
              <div
                style={{
                  color: "#cbd5e1",
                  fontSize: 24,
                  fontFamily: "sans-serif",
                  marginTop: 12,
                }}
              >
                {bar.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
