import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolateColors,
} from "remotion";
import { z } from "zod";
import { StubCompositionSchema } from "./schemas";

export type MotionGraphicsProps = z.infer<typeof StubCompositionSchema>;

export const MotionGraphics: React.FC<MotionGraphicsProps> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleScale = spring({ frame, fps, config: { damping: 12, mass: 0.8 } });
  const subtitleOpacity = spring({
    frame: frame - 15,
    fps,
    config: { damping: 14 },
  });

  const bgColor = interpolateColors(
    frame,
    [0, 60, 120],
    ["#0f172a", "#1e3a5f", "#0f172a"]
  );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${bgColor}, #020617)`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${titleScale})`,
          color: "#ffffff",
          fontSize: 80,
          fontWeight: 700,
          fontFamily: "sans-serif",
          textAlign: "center",
          padding: "0 60px",
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            opacity: Math.max(0, subtitleOpacity),
            color: "#94a3b8",
            fontSize: 36,
            fontFamily: "sans-serif",
            marginTop: 24,
            textAlign: "center",
          }}
        >
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
