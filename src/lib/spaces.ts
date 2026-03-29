import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { readFile } from "fs/promises";
import path from "path";

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

let client: S3Client | null = null;

function isConfigured(): boolean {
  return !!(
    process.env.DO_SPACES_KEY &&
    process.env.DO_SPACES_SECRET &&
    process.env.DO_SPACES_BUCKET &&
    process.env.DO_SPACES_REGION
  );
}

function getClient(): S3Client {
  if (!client) {
    const region = process.env.DO_SPACES_REGION!;
    client = new S3Client({
      endpoint: `https://${region}.digitaloceanspaces.com`,
      region: "us-east-1", // DO Spaces requires this value
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DO_SPACES_KEY!,
        secretAccessKey: process.env.DO_SPACES_SECRET!,
      },
    });
  }
  return client;
}

function getBucket(): string {
  return process.env.DO_SPACES_BUCKET!;
}

function getRegion(): string {
  return process.env.DO_SPACES_REGION!;
}

export function spacesEnabled(): boolean {
  return isConfigured();
}

/**
 * Upload a local file to DigitalOcean Spaces and return its public CDN URL.
 */
export async function uploadToSpaces(
  localPath: string,
  key: string
): Promise<string> {
  const ext = path.extname(localPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  const body = await readFile(localPath);

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: "public-read",
    })
  );

  // Return CDN URL (faster delivery than direct endpoint)
  return `https://${getBucket()}.${getRegion()}.cdn.digitaloceanspaces.com/${key}`;
}

/**
 * Delete an object from DigitalOcean Spaces.
 */
export async function deleteFromSpaces(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
  );
}

/**
 * Lightweight health-check: returns the configured bucket and region
 * without making any network calls. Useful for verifying env vars are set.
 */
export function testSpacesConnection(): {
  configured: boolean;
  bucket: string | undefined;
  region: string | undefined;
  endpoint: string | undefined;
} {
  const bucket = process.env.DO_SPACES_BUCKET;
  const region = process.env.DO_SPACES_REGION;
  return {
    configured: isConfigured(),
    bucket,
    region,
    endpoint: region ? `https://${region}.digitaloceanspaces.com` : undefined,
  };
}
