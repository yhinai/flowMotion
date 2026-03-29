import type { MotionPreset } from "./types";

export const referenceTokens = {
  background: "#f4ede4",
  ink: "#15120f",
  mutedInk: "rgba(21, 18, 15, 0.82)",
  fontFamily: '"Manrope","SF Pro Display","Helvetica Neue",sans-serif',
  radii: {
    image: 32,
  },
  typography: {
    display: 120,
    editorial: 64,
    micro: 32,
  },
  spacing: {
    outerX: 280,
    outerY: 200,
  },
} as const;

export const quietMotionPreset: MotionPreset = {
  enterDurationFrames: 24,
  exitDurationFrames: 18,
  fadeInFrames: 20,
  fadeOutFrames: 16,
  driftX: 0,
  driftY: 0,
  scaleFrom: 1,
  scaleTo: 1.02,
  blur: 0,
};
