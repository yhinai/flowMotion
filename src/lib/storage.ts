import { uploadToSpaces, deleteFromSpaces } from "./spaces";

export function generateKey(jobId: string, filename: string): string {
  return `jobs/${jobId}/${filename}`;
}

export async function uploadFile(
  localPath: string,
  key: string
): Promise<string> {
  return uploadToSpaces(localPath, key);
}

export async function deleteFile(key: string): Promise<void> {
  return deleteFromSpaces(key);
}
