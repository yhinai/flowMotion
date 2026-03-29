import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import path from "path";
import { spacesEnabled, uploadToSpaces, deleteFromSpaces } from "./spaces";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webm": "video/webm",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

let supabase: SupabaseClient | null = null;

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(
      getEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
      getEnvVar("SUPABASE_SERVICE_ROLE_KEY")
    );
  }
  return supabase;
}

function getBucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "video-assets";
}

export function getPublicUrl(key: string): string {
  const { data } = getSupabaseClient()
    .storage.from(getBucketName())
    .getPublicUrl(key);
  return data.publicUrl;
}

export function generateKey(jobId: string, filename: string): string {
  return `jobs/${jobId}/${filename}`;
}

export async function uploadFile(
  localPath: string,
  key: string
): Promise<string> {
  const { stat } = await import("fs/promises");
  const fileSize = await stat(localPath).then(s => (s.size / 1024 / 1024).toFixed(1)).catch(() => "?");
  console.log(`[Storage] Uploading ${localPath} (${fileSize}MB) → key=${key}`);

  // Prefer DigitalOcean Spaces when configured — faster CDN delivery
  if (spacesEnabled()) {
    console.log("[Storage] Using DigitalOcean Spaces");
    const url = await uploadToSpaces(localPath, key);
    console.log(`[Storage] Upload SUCCESS → ${url.slice(0, 100)}`);
    return url;
  }

  console.log(`[Storage] Using Supabase bucket=${getBucketName()}`);
  const ext = path.extname(localPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  const fileBuffer = await readFile(localPath);

  const { error } = await getSupabaseClient()
    .storage.from(getBucketName())
    .upload(key, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error(`[Storage] Supabase upload FAILED: ${error.message}`);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const url = getPublicUrl(key);
  console.log(`[Storage] Upload SUCCESS → ${url.slice(0, 100)}`);
  return url;
}

export async function deleteFile(key: string): Promise<void> {
  if (spacesEnabled()) {
    return deleteFromSpaces(key);
  }

  const { error } = await getSupabaseClient()
    .storage.from(getBucketName())
    .remove([key]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}
