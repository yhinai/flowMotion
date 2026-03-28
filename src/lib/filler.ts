import { spawn } from "child_process";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { transcribeVideo } from "./transcribe";
import type { CaptionSegment } from "./types";

/** Filler words to detect in transcribed speech */
const FILLER_WORDS: ReadonlySet<string> = new Set([
  "um",
  "uh",
  "err",
  "like",
  "you know",
  "basically",
  "actually",
  "literally",
  "right",
  "so",
]);

const PADDING_MS = 50; // small buffer around non-filler segments

/** A segment representing a filler word with timestamps */
export interface FillerSegment {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

interface SpeakingSegment {
  readonly startSec: number;
  readonly endSec: number;
}

/**
 * Check whether a caption segment contains a filler word.
 * Compares the lowercased, trimmed text against the filler set.
 * Also checks if the entire segment is a single filler phrase.
 */
function isFillerSegment(segment: CaptionSegment): boolean {
  const normalized = segment.text.toLowerCase().trim();

  // Exact match against filler set
  if (FILLER_WORDS.has(normalized)) {
    return true;
  }

  // Check if the text is only filler words (e.g., "um like")
  const words = normalized.split(/\s+/);
  if (words.length <= 3 && words.every((word) => FILLER_WORDS.has(word))) {
    return true;
  }

  return false;
}

/**
 * Detect filler words in a video by transcribing its audio and filtering
 * for segments that contain filler words.
 */
export async function detectFillerWords(
  videoPath: string
): Promise<FillerSegment[]> {
  const captions = await transcribeVideo(videoPath);

  if (captions.length === 0) {
    return [];
  }

  const fillerSegments: FillerSegment[] = captions
    .filter(isFillerSegment)
    .map((segment) => ({
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
    }));

  return fillerSegments;
}

/**
 * Get the total duration of a video in seconds using ffprobe.
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);

    let output = "";
    ffprobe.stdout.setEncoding("utf8");
    ffprobe.stdout.on("data", (data: string) => {
      output += data;
    });

    ffprobe.on("close", (code) => {
      const duration = parseFloat(output.trim());
      if (code !== 0 || isNaN(duration)) {
        reject(
          new Error(
            `ffprobe exited with code ${code}: could not determine video duration`
          )
        );
      } else {
        resolve(duration);
      }
    });

    ffprobe.on("error", (err) => {
      reject(new Error(`ffprobe not found or failed: ${err.message}`));
    });
  });
}

/**
 * Compute non-filler segments (the inverse of filler segments) across
 * the total video duration. These are the segments to keep.
 */
function getNonFillerSegments(
  fillerSegments: readonly FillerSegment[],
  totalDurationMs: number
): readonly SpeakingSegment[] {
  if (fillerSegments.length === 0) {
    return [{ startSec: 0, endSec: totalDurationMs / 1000 }];
  }

  // Sort filler segments by start time
  const sorted = [...fillerSegments].sort((a, b) => a.startMs - b.startMs);
  const segments: SpeakingSegment[] = [];
  let lastEndMs = 0;

  for (const filler of sorted) {
    if (filler.startMs > lastEndMs + PADDING_MS) {
      segments.push({
        startSec: Math.max(0, (lastEndMs - PADDING_MS)) / 1000,
        endSec: Math.min(totalDurationMs, filler.startMs + PADDING_MS) / 1000,
      });
    }
    lastEndMs = Math.max(lastEndMs, filler.endMs);
  }

  // Final segment after the last filler word
  if (lastEndMs < totalDurationMs) {
    segments.push({
      startSec: Math.max(0, (lastEndMs - PADDING_MS)) / 1000,
      endSec: totalDurationMs / 1000,
    });
  }

  return segments;
}

/**
 * Remove filler words from a video.
 * Uses transcription to detect fillers, computes non-filler segments,
 * then uses ffmpeg to extract and concatenate those segments.
 * Same approach as silence.ts removeSilence.
 */
export async function removeFillerWords(
  videoPath: string,
  outputPath: string
): Promise<void> {
  const fillerSegments = await detectFillerWords(videoPath);

  if (fillerSegments.length === 0) {
    // No filler words detected — copy file as-is
    const { copyFile } = await import("fs/promises");
    await copyFile(videoPath, outputPath);
    return;
  }

  const totalDuration = await getVideoDuration(videoPath);
  const totalDurationMs = totalDuration * 1000;
  const keepSegments = getNonFillerSegments(fillerSegments, totalDurationMs);

  if (keepSegments.length === 0) {
    throw new Error(
      "No non-filler segments found — video appears to be entirely filler words"
    );
  }

  // Create temp directory for segment clips
  const tmpDir = `/tmp/filler-removal-${Date.now()}`;
  await mkdir(tmpDir, { recursive: true });

  // Split video into non-filler segments (parallel for speed)
  const clipPaths = keepSegments.map((_, i) =>
    path.join(tmpDir, `clip-${i.toString().padStart(4, "0")}.mp4`)
  );

  await Promise.all(
    keepSegments.map(
      (segment, i) =>
        new Promise<void>((resolve, reject) => {
          const ffmpeg = spawn("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            videoPath,
            "-ss",
            segment.startSec.toFixed(3),
            "-to",
            segment.endSec.toFixed(3),
            "-c",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            clipPaths[i],
          ]);

          ffmpeg.on("close", (code) => {
            if (code === 0) resolve();
            else
              reject(
                new Error(
                  `ffmpeg split failed for segment ${i} with code ${code}`
                )
              );
          });

          ffmpeg.on("error", reject);
        })
    )
  );

  // Write concat file
  const concatFilePath = path.join(tmpDir, "concat.txt");
  const concatContent = clipPaths.map((p) => `file '${p}'`).join("\n");
  await writeFile(concatFilePath, concatContent, "utf8");

  // Concatenate clips
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatFilePath,
      "-c",
      "copy",
      outputPath,
    ]);

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg concat failed with code ${code}`));
    });

    ffmpeg.on("error", reject);
  });

  // Cleanup temp files
  for (const clipPath of clipPaths) {
    await unlink(clipPath).catch(() => {});
  }
  await unlink(concatFilePath).catch(() => {});
}
