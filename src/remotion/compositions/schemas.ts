import { z } from "zod";

export const TextVideoSchema = z.object({
  lines: z.array(z.string()).min(1).describe("Text lines, each becomes a slide"),
  durationPerSlide: z.number().min(1).max(30).describe("Duration per slide in seconds"),
});

export const ImageSlideshowSchema = z.object({
  images: z.array(z.string()).describe("Image URLs for the slideshow"),
  durationPerSlide: z.number().min(1).max(30).describe("Duration per slide in seconds"),
});

export const CaptionedVideoSchema = z.object({
  videoSrc: z.string().describe("Source video file path or URL"),
  captions: z.array(z.object({
    text: z.string(),
    startMs: z.number(),
    endMs: z.number(),
  })).describe("Timed caption segments"),
});
