import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Sequence,
} from "remotion";
import { z } from "zod";
import { StubCompositionSchema } from "./schemas";

export type ExplainerVideoProps = z.infer<typeof StubCompositionSchema>;

const STEPS = ["Define the problem", "Explore solutions", "Implement & iterate"];

export const ExplainerVideo: React.FC<ExplainerVideoProps> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stepDuration = 3 * fps; // 3 seconds per step

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a1a2e",
        padding: 80,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: titleOpacity,
          color: "#ffffff",
          fontSize: 64,
          fontWeight: 700,
          fontFamily: "sans-serif",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            opacity: titleOpacity,
            color: "#a78bfa",
            fontSize: 30,
            fontFamily: "sans-serif",
            marginBottom: 48,
          }}
        >
          {subtitle}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {STEPS.map((step, i) => (
          <Sequence key={step} from={30 + i * stepDuration} durationInFrames={stepDuration}>
            <StepRow index={i} text={step} fps={fps} />
          </Sequence>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const StepRow: React.FC<{ index: number; text: string; fps: number }> = ({
  index,
  text,
  fps,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  const translateX = interpolate(frame, [0, 15], [40, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${translateX}px)`,
        display: "flex",
        alignItems: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          backgroundColor: "#7c3aed",
          color: "#ffffff",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 24,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        {index + 1}
      </div>
      <div
        style={{
          color: "#e2e8f0",
          fontSize: 36,
          fontFamily: "sans-serif",
        }}
      >
        {text}
      </div>
    </div>
  );
};
