import { NextResponse } from "next/server";
import { readFile, access } from "fs/promises";
import path from "path";

/**
 * Serve a local file from /tmp/ when DO Spaces is not configured.
 * Only allows files under /tmp/ for security.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  // Security: only serve files from /tmp/
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith("/tmp/")) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    await access(resolved);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webm": "video/webm",
  };

  const body = await readFile(resolved);
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentTypes[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${path.basename(resolved)}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
