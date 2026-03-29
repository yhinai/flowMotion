import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { z } from "zod";
import { StubCompositionSchema } from "./schemas";

export type PromoVideoProps = z.infer<typeof StubCompositionSchema>;

export const PromoVideo: React.FC<PromoVideoProps> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineScale = spring({
    frame,
    fps,
    config: { damping: 10, mass: 0.6, stiffness: 100 },
  });

  const ctaOpacity = interpolate(frame, [45, 60], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const ctaY = interpolate(frame, [45, 60], [30, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #1e293b 0%, #0f172a 50%, #1e1b4b 100%)",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${headlineScale})`,
          color: "#ffffff",
          fontSize: 72,
          fontWeight: 800,
          fontFamily: "sans-serif",
          textAlign: "center",
          padding: "0 80px",
          lineHeight: 1.2,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            marginTop: 40,
            padding: "18px 48px",
            backgroundColor: "#6366f1",
            borderRadius: 12,
            color: "#ffffff",
            fontSize: 32,
            fontWeight: 600,
            fontFamily: "sans-serif",
          }}
        >
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
