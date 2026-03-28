import { uploadToSpaces, deleteFromSpaces, spacesEnabled } from "./spaces";

export function generateKey(jobId: string, filename: string): string {
  return `jobs/${jobId}/${filename}`;
}

/**
 * Upload a file. If DO Spaces is configured, upload there.
 * Otherwise, serve from the local filesystem via the /api/download endpoint.
 */
export async function uploadFile(
  localPath: string,
  key: string
): Promise<string> {
  if (spacesEnabled()) {
    return uploadToSpaces(localPath, key);
  }

  // Fallback: serve locally via Next.js API route
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const encodedPath = encodeURIComponent(localPath);
  return `${appUrl}/api/download/local?path=${encodedPath}`;
}

export async function deleteFile(key: string): Promise<void> {
  if (spacesEnabled()) {
    return deleteFromSpaces(key);
  }
  // Local files are cleaned up by OS tmp cleanup
}
