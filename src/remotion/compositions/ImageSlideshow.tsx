import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { z } from "zod";
import { ImageSlideshowSchema } from "./schemas";

export type ImageSlideshowProps = z.infer<typeof ImageSlideshowSchema>;

const TRANSITION_FRAMES = 20; // ~0.67s crossfade

const Slide: React.FC<{
  src: string;
  slideIndex: number;
  slideDurationFrames: number;
  totalSlides: number;
}> = ({ src, slideIndex, slideDurationFrames, totalSlides }) => {
  const frame = useCurrentFrame();

  // Fade in
  const fadeIn = interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Fade out (except last slide)
  const isLastSlide = slideIndex === totalSlides - 1;
  const fadeOut = isLastSlide
    ? 1
    : interpolate(
        frame,
        [slideDurationFrames - TRANSITION_FRAMES, slideDurationFrames],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );

  // Subtle Ken Burns zoom (1.0 → 1.08 over the slide duration)
  const scale = interpolate(frame, [0, slideDurationFrames], [1.0, 1.08], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        opacity: fadeIn * fadeOut,
      }}
    >
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scale})`,
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      </AbsoluteFill>

      {/* Slide counter */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          right: "60px",
          fontFamily: "Manrope, system-ui, sans-serif",
          fontSize: "16px",
          color: "rgba(255,255,255,0.4)",
          fontWeight: 500,
          backgroundColor: "rgba(0,0,0,0.3)",
          padding: "6px 14px",
          borderRadius: "20px",
        }}
      >
        {slideIndex + 1} / {totalSlides}
      </div>
    </AbsoluteFill>
  );
};

export const ImageSlideshow: React.FC<ImageSlideshowProps> = ({
  images,
  durationPerSlide,
  musicUrl,
}) => {
  const { fps } = useVideoConfig();
  const slideDurationFrames = Math.round(durationPerSlide * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {musicUrl && <Audio src={musicUrl} volume={0.3} />}
      {images.map((src, i) => (
        <Sequence
          key={i}
          from={i * slideDurationFrames}
          durationInFrames={slideDurationFrames}
        >
          <Slide
            src={src}
            slideIndex={i}
            slideDurationFrames={slideDurationFrames}
            totalSlides={images.length}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
