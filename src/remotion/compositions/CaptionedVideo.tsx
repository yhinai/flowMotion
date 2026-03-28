import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { z } from "zod";
import { CaptionedVideoSchema } from "./schemas";

export type CaptionedVideoProps = z.infer<typeof CaptionedVideoSchema>;

const CaptionOverlay: React.FC<{
  captions: CaptionedVideoProps["captions"];
}> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;

  // Find the active caption
  const activeCaption = captions.find(
    (c) => currentTimeMs >= c.startMs && currentTimeMs < c.endMs
  );

  if (!activeCaption) return null;

  // Fade in/out for smooth appearance
  const fadeIn = interpolate(
    currentTimeMs,
    [activeCaption.startMs, activeCaption.startMs + 200],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  const fadeOut = interpolate(
    currentTimeMs,
    [activeCaption.endMs - 200, activeCaption.endMs],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: "10%",
        left: "5%",
        right: "5%",
        display: "flex",
        justifyContent: "center",
        opacity: fadeIn * fadeOut,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          borderRadius: "12px",
          padding: "16px 28px",
          maxWidth: "90%",
        }}
      >
        <span
          style={{
            fontFamily: "Manrope, SF Pro Display, system-ui, sans-serif",
            fontSize: "42px",
            fontWeight: 600,
            color: "#ffffff",
            lineHeight: 1.3,
            textAlign: "center",
            display: "block",
            textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          {activeCaption.text}
        </span>
      </div>
    </div>
  );
};

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({
  videoSrc,
  captions,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <OffthreadVideo src={videoSrc} />
      <CaptionOverlay captions={captions} />
    </AbsoluteFill>
  );
};
