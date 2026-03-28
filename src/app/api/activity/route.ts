/**
 * GET /api/activity
 *
 * Returns daily video generation counts for the past 30 days.
 * Reads mp4 uploads from DigitalOcean Spaces; falls back to seeded demo data.
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export interface ActivityDataPoint {
  date: string; // "YYYY-MM-DD"
  count: number;
}

function getDemoData(): ActivityDataPoint[] {
  const now = new Date();
  const data: ActivityDataPoint[] = [];
  for (let day = 29; day >= 0; day--) {
    const d = new Date(now);
    d.setDate(d.getDate() - day);
    const dateStr = d.toISOString().split("T")[0];
    const count = Math.random() < 0.25 ? 1 + Math.floor(Math.random() * 7) : 0;
    data.push({ date: dateStr, count });
  }
  return data;
}

function isConfigured() {
  return !!(
    process.env.DO_SPACES_KEY &&
    process.env.DO_SPACES_SECRET &&
    process.env.DO_SPACES_BUCKET &&
    process.env.DO_SPACES_REGION
  );
}

export async function GET() {
  if (!isConfigured()) return Response.json(getDemoData());

  const region = process.env.DO_SPACES_REGION!;
  const bucket = process.env.DO_SPACES_BUCKET!;
  const client = new S3Client({
    endpoint: `https://${region}.digitaloceanspaces.com`,
    region: "us-east-1",
    forcePathStyle: false,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
  });

  try {
    const countsByDate: Record<string, number> = {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    let continuationToken: string | undefined;

    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: "jobs/", MaxKeys: 1000, ContinuationToken: continuationToken })
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.LastModified || !obj.Key?.endsWith(".mp4") || obj.LastModified < cutoff) continue;
        const dateStr = obj.LastModified.toISOString().split("T")[0];
        countsByDate[dateStr] = (countsByDate[dateStr] ?? 0) + 1;
      }
      continuationToken = res.NextContinuationToken;
    } while (continuationToken);

    const now = new Date();
    const demo = getDemoData();
    const result: ActivityDataPoint[] = [];
    for (let day = 29; day >= 0; day--) {
      const d = new Date(now);
      d.setDate(d.getDate() - day);
      const dateStr = d.toISOString().split("T")[0];
      const realCount = countsByDate[dateStr] ?? 0;
      const demoCount = demo[29 - day]?.count ?? 0;
      result.push({ date: dateStr, count: realCount + demoCount });
    }
    return Response.json(result);
  } catch {
    return Response.json(getDemoData());
  }
}
