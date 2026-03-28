import { spawn } from "child_process";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import type { SilenceInterval } from "./types";

const NOISE_THRESHOLD_DB = -40;
const MIN_SILENCE_DURATION = 0.75; // seconds
const PADDING_SECONDS = 0.05; // buffer around speech segments

/**
 * Detect silence intervals in a video file using ffmpeg silencedetect.
 */
export async function detectSilence(
  videoPath: string
): Promise<SilenceInterval[]> {
  return new Promise((resolve, reject) => {
    const silenceIntervals: SilenceInterval[] = [];
    let currentStart: number | null = null;
    let stderrBuffer = "";

    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-dn",
      "-vn",
      "-ss",
      "0.00",
      "-i",
      videoPath,
      "-af",
      `silencedetect=n=${NOISE_THRESHOLD_DB}dB:d=${MIN_SILENCE_DURATION}`,
      "-f",
      "null",
      "/dev/null",
    ]);

    ffmpeg.stderr.setEncoding("utf8");
    ffmpeg.stderr.on("data", (data: string) => {
      stderrBuffer += data;

      // Process complete lines
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.includes("[silencedetect @")) continue;

        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        const endMatch = line.match(
          /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/
        );

        if (startMatch) {
          currentStart = parseFloat(startMatch[1]);
        } else if (endMatch && currentStart !== null) {
          silenceIntervals.push({
            startSec: currentStart,
            endSec: parseFloat(endMatch[1]),
          });
          currentStart = null;
        }
      }
    });

    ffmpeg.on("close", (code) => {
      // Process remaining buffer
      if (stderrBuffer.includes("silence_start:")) {
        const startMatch = stderrBuffer.match(/silence_start:\s*([\d.]+)/);
        if (startMatch) {
          currentStart = parseFloat(startMatch[1]);
        }
      }
      if (stderrBuffer.includes("silence_end:") && currentStart !== null) {
        const endMatch = stderrBuffer.match(
          /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/
        );
        if (endMatch) {
          silenceIntervals.push({
            startSec: currentStart,
            endSec: parseFloat(endMatch[1]),
          });
        }
      }

      if (code !== 0 && silenceIntervals.length === 0) {
        reject(new Error(`ffmpeg silencedetect exited with code ${code}`));
      } else {
        resolve(silenceIntervals);
      }
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`ffmpeg not found or failed to start: ${err.message}`));
    });
  });
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

    ffprobe.on("close", () => {
      const duration = parseFloat(output.trim());
      if (isNaN(duration)) {
        reject(new Error("Could not determine video duration"));
      } else {
        resolve(duration);
      }
    });

    ffprobe.on("error", (err) => {
      reject(new Error(`ffprobe not found or failed: ${err.message}`));
    });
  });
}

interface SpeakingSegment {
  readonly start: number;
  readonly end: number;
}

/**
 * Derive speaking segments (inverse of silence intervals).
 */
function getSpeakingSegments(
  silenceIntervals: SilenceInterval[],
  totalDuration: number
): readonly SpeakingSegment[] {
  const segments: SpeakingSegment[] = [];
  let lastEnd = 0;

  for (const silence of silenceIntervals) {
    if (silence.startSec > lastEnd + PADDING_SECONDS) {
      segments.push({
        start: Math.max(0, lastEnd - PADDING_SECONDS),
        end: Math.min(totalDuration, silence.startSec + PADDING_SECONDS),
      });
    }
    lastEnd = silence.endSec;
  }

  // Final segment after last silence
  if (lastEnd < totalDuration) {
    segments.push({
      start: Math.max(0, lastEnd - PADDING_SECONDS),
      end: totalDuration,
    });
  }

  return segments;
}

/**
 * Remove silence from a video using ffmpeg concat filter.
 * Fast approach: split into speaking segments, concatenate without re-encoding.
 */
export async function removeSilence(
  inputPath: string,
  silenceIntervals: SilenceInterval[],
  outputPath: string
): Promise<string> {
  if (silenceIntervals.length === 0) {
    // No silence detected — copy file as-is
    const { copyFile } = await import("fs/promises");
    await copyFile(inputPath, outputPath);
    return outputPath;
  }

  const totalDuration = await getVideoDuration(inputPath);
  const segments = getSpeakingSegments(silenceIntervals, totalDuration);

  if (segments.length === 0) {
    throw new Error("No speaking segments found — video appears to be entirely silent");
  }

  // Create temp directory for segment clips
  const tmpDir = `/tmp/silence-removal-${Date.now()}`;
  await mkdir(tmpDir, { recursive: true });

  // Split video into speaking segments
  const clipPaths: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const clipPath = path.join(tmpDir, `clip-${i.toString().padStart(4, "0")}.mp4`);
    clipPaths.push(clipPath);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-ss",
        segment.start.toFixed(3),
        "-to",
        segment.end.toFixed(3),
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        clipPath,
      ]);

      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg split failed for segment ${i} with code ${code}`));
      });

      ffmpeg.on("error", reject);
    });
  }

  // Write concat file
  const concatFilePath = path.join(tmpDir, "concat.txt");
  const concatContent = clipPaths
    .map((p) => `file '${p}'`)
    .join("\n");
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

  return outputPath;
}
