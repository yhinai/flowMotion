import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { z } from "zod";
import { TextVideoSchema } from "./schemas";

export type TextVideoProps = z.infer<typeof TextVideoSchema>;

const GRADIENT_PAIRS = [
  ["#0f0c29", "#302b63", "#24243e"],
  ["#1a1a2e", "#16213e", "#0f3460"],
  ["#0d1b2a", "#1b2838", "#2d4059"],
  ["#1b1b3a", "#2a1b3d", "#44318d"],
  ["#0a192f", "#112240", "#1d3557"],
];

const TextSlide: React.FC<{
  text: string;
  slideIndex: number;
  slideDurationFrames: number;
}> = ({ text, slideIndex, slideDurationFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = text.split(/\s+/).filter(Boolean);
  const gradientIndex = slideIndex % GRADIENT_PAIRS.length;
  const [c1, c2, c3] = GRADIENT_PAIRS[gradientIndex];

  // Fade in the whole slide
  const slideOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Fade out at the end
  const fadeOut = interpolate(
    frame,
    [slideDurationFrames - 20, slideDurationFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: slideOpacity * fadeOut,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "12px 16px",
          maxWidth: "80%",
          padding: "40px",
        }}
      >
        {words.map((word, i) => {
          const delay = i * 3; // stagger each word by 3 frames
          const scale = spring({
            frame: frame - delay,
            fps,
            config: { stiffness: 200, damping: 18 },
          });

          const wordOpacity = interpolate(
            frame - delay,
            [0, 8],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          return (
            <span
              key={`${slideIndex}-${i}`}
              style={{
                fontFamily: "Manrope, SF Pro Display, system-ui, sans-serif",
                fontSize: words.length <= 3 ? "96px" : words.length <= 6 ? "72px" : "56px",
                fontWeight: 700,
                color: "#ffffff",
                opacity: wordOpacity,
                transform: `scale(${scale})`,
                display: "inline-block",
                textShadow: "0 4px 30px rgba(0,0,0,0.3)",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>

      {/* Slide counter */}
      <div
        style={{
          position: "absolute",
          bottom: "60px",
          right: "80px",
          fontFamily: "Manrope, system-ui, sans-serif",
          fontSize: "18px",
          color: "rgba(255,255,255,0.3)",
          fontWeight: 500,
        }}
      >
        {slideIndex + 1}
      </div>
    </AbsoluteFill>
  );
};

export const TextVideo: React.FC<TextVideoProps> = ({
  lines,
  durationPerSlide,
}) => {
  const { fps } = useVideoConfig();
  const slideDurationFrames = Math.round(durationPerSlide * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f0c29" }}>
      {lines.map((line, i) => (
        <Sequence
          key={i}
          from={i * slideDurationFrames}
          durationInFrames={slideDurationFrames}
        >
          <TextSlide
            text={line}
            slideIndex={i}
            slideDurationFrames={slideDurationFrames}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
