/**
 * GET /api/activity
 *
 * Returns daily video generation counts for the past 365 days.
 * Reads from DigitalOcean Spaces file listing (jobs/ prefix).
 * Falls back to demo data when Spaces is not configured.
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export interface ActivityDataPoint {
  date: string; // "YYYY-MM-DD"
  count: number;
}

function getDemoData(): ActivityDataPoint[] {
  const data: ActivityDataPoint[] = [];
  const now = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const recency = 1 - i / 364;
    const base = Math.random() < 0.15 + recency * 0.4 ? 1 : 0;
    data.push({ date: dateStr, count: base * (1 + Math.floor(Math.random() * 4 * recency)) });
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
  if (!isConfigured()) {
    return Response.json(getDemoData());
  }

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
    let continuationToken: string | undefined;

    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "jobs/",
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        })
      );

      for (const obj of res.Contents ?? []) {
        if (!obj.LastModified) continue;
        const dateStr = obj.LastModified.toISOString().split("T")[0];
        // Only count mp4 files as completed videos
        if (obj.Key?.endsWith(".mp4")) {
          countsByDate[dateStr] = (countsByDate[dateStr] ?? 0) + 1;
        }
      }

      continuationToken = res.NextContinuationToken;
    } while (continuationToken);

    const now = new Date();
    const result: ActivityDataPoint[] = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      result.push({ date: dateStr, count: countsByDate[dateStr] ?? 0 });
    }

    return Response.json(result);
  } catch {
    return Response.json(getDemoData());
  }
}
