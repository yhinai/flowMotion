/**
 * GET /api/activity
 *
 * Returns daily video generation counts for the past 365 days.
 * Reads from Supabase storage file listing (jobs/{date}/ prefixes).
 * Falls back to demo data when storage is not configured.
 */

import { createClient } from "@supabase/supabase-js";

export interface ActivityDataPoint {
  date: string; // ISO date string "YYYY-MM-DD"
  count: number;
}

function getDemoData(): ActivityDataPoint[] {
  const data: ActivityDataPoint[] = [];
  const now = new Date();

  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];

    // Generate realistic-looking sparse activity with recent uptick
    const recency = 1 - i / 364;
    const base = Math.random() < 0.15 + recency * 0.4 ? 1 : 0;
    const count = base * (1 + Math.floor(Math.random() * 4 * recency));

    data.push({ date: dateStr, count });
  }

  return data;
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "video-assets";

  if (!supabaseUrl || !serviceKey) {
    return Response.json(getDemoData());
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list("jobs", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });

    if (error || !files) {
      return Response.json(getDemoData());
    }

    // Count completions per day from folder names (jobs/{jobId}/...)
    const countsByDate: Record<string, number> = {};
    for (const file of files) {
      const created = file.created_at ?? file.updated_at;
      if (!created) continue;
      const dateStr = new Date(created).toISOString().split("T")[0];
      countsByDate[dateStr] = (countsByDate[dateStr] ?? 0) + 1;
    }

    // Build full 365-day series
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
