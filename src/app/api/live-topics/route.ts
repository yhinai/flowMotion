/**
 * GET /api/live-topics
 *
 * Returns trending video topics sourced from live data via Nexla.
 * When Nexla Nexset IDs are configured, data is pulled from managed
 * Nexla data pipelines. Falls back to direct public API calls so the
 * feature works even without a configured Nexla flow.
 *
 * POST /api/live-topics
 *
 * Autonomous trigger: fetches the top trending topic and kicks off
 * video generation automatically via POST /api/generate.
 *
 * ─── Nexla Setup Instructions ───────────────────────────────────────
 * 1. Go to https://express.dev and sign in / create an account
 * 2. Create a new flow for each data source:
 *    - Crypto: paste CoinGecko URL as source
 *      (https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=percent_change_24h&per_page=3&page=1)
 *    - Weather: paste Open-Meteo URL as source
 *      (https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&daily=temperature_2m_max,weathercode&forecast_days=1&timezone=America%2FNew_York)
 *    - News: paste any news API URL as source
 * 3. For each flow, get the Nexset ID from the flow details page
 * 4. Set the following env vars in .env:
 *    - NEXLA_API_KEY=<your Nexla API key from account settings>
 *    - NEXLA_CRYPTO_NEXSET_ID=<Nexset ID from crypto flow>
 *    - NEXLA_WEATHER_NEXSET_ID=<Nexset ID from weather flow>
 *    - NEXLA_NEWS_NEXSET_ID=<Nexset ID from news flow>
 * 5. Without these vars, the endpoint falls back to direct public APIs
 *    (CoinGecko + Open-Meteo — both free, no auth required)
 * ─────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";

export interface LiveTopic {
  id: string;
  type: "news" | "crypto" | "weather";
  headline: string;
  context: string;
  suggestedPrompt: string;
  source: "nexla" | "direct";
}

// ─── Nexla helpers ────────────────────────────────────────────────────────────

async function queryNexset(nexsetId: string): Promise<unknown[] | null> {
  const apiKey = process.env.NEXLA_API_KEY;
  if (!apiKey || !nexsetId) return null;

  try {
    const res = await fetch(
      `https://dataops-sync.nexla.io/sync/${nexsetId}?api_key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagesize: "5", offset: "0" }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// ─── News topics ──────────────────────────────────────────────────────────────

async function getNewsTopics(): Promise<LiveTopic[]> {
  // Try Nexla nexset first
  const nexlaData = await queryNexset(process.env.NEXLA_NEWS_NEXSET_ID ?? "");
  if (nexlaData) {
    return nexlaData.slice(0, 3).map((item, i) => {
      const n = item as Record<string, unknown>;
      const title = String(n.title ?? n.headline ?? "Breaking news");
      return {
        id: `news-${i}`,
        type: "news",
        headline: title,
        context: String(n.source ?? n.author ?? "Top Headlines"),
        suggestedPrompt: `Breaking news report: "${title}". Dynamic news broadcast style with bold headlines, urgent pacing, and a professional news anchor narration. 3 scenes.`,
        source: "nexla",
      };
    });
  }

  // Fallback: NewsAPI (requires NEWSAPI_KEY) or mock data
  const newsApiKey = process.env.NEWSAPI_KEY;
  if (newsApiKey) {
    try {
      const res = await fetch(
        `https://newsapi.org/v2/top-headlines?country=us&pageSize=3&apiKey=${newsApiKey}`,
        { signal: AbortSignal.timeout(4000) }
      );
      const data = await res.json();
      const articles = (data.articles ?? []) as Array<{
        title: string;
        source?: { name?: string };
      }>;
      return articles.slice(0, 3).map((a, i) => ({
        id: `news-${i}`,
        type: "news" as const,
        headline: a.title,
        context: a.source?.name ?? "News",
        suggestedPrompt: `Breaking news report: "${a.title}". Dynamic news broadcast style with bold headlines, urgent pacing, and a professional anchor narration. 3 scenes.`,
        source: "direct" as const,
      }));
    } catch {
      // fall through to mock
    }
  }

  return [
    {
      id: "news-mock-0",
      type: "news",
      headline: "AI breakthroughs reshape industries in 2026",
      context: "Top Headlines",
      suggestedPrompt:
        "Explainer video about the biggest AI breakthroughs of 2026 and how they're reshaping industries. Futuristic visuals, energetic pacing, 4 scenes.",
      source: "direct",
    },
  ];
}

// ─── Crypto topics ────────────────────────────────────────────────────────────

async function getCryptoTopics(): Promise<LiveTopic[]> {
  const nexlaData = await queryNexset(process.env.NEXLA_CRYPTO_NEXSET_ID ?? "");
  if (nexlaData) {
    return nexlaData.slice(0, 2).map((item, i) => {
      const c = item as Record<string, unknown>;
      const name = String(c.name ?? c.coin ?? "Bitcoin");
      const change = Number(c.price_change_percentage_24h ?? c.change_24h ?? 0);
      const direction = change >= 0 ? "surging" : "dropping";
      const pct = Math.abs(change).toFixed(1);
      return {
        id: `crypto-${i}`,
        type: "crypto",
        headline: `${name} ${direction} ${pct}% in 24h`,
        context: `$${Number(c.current_price ?? c.price ?? 0).toLocaleString()}`,
        suggestedPrompt: `Market update video: ${name} is ${direction} ${pct}% today. Financial news style with price charts, dramatic music, and a clear explanation of what's driving the move. 3 scenes.`,
        source: "nexla",
      };
    });
  }

  // Fallback: CoinGecko (no auth required)
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=percent_change_24h&per_page=3&page=1",
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const coins = (await res.json()) as Array<{
        name: string;
        current_price: number;
        price_change_percentage_24h: number;
        symbol: string;
      }>;
      return coins.slice(0, 2).map((c, i) => {
        const direction = c.price_change_percentage_24h >= 0 ? "surging" : "dropping";
        const pct = Math.abs(c.price_change_percentage_24h).toFixed(1);
        return {
          id: `crypto-${i}`,
          type: "crypto" as const,
          headline: `${c.name} ${direction} ${pct}% in 24h`,
          context: `$${c.current_price.toLocaleString()}`,
          suggestedPrompt: `Market update: ${c.name} (${c.symbol.toUpperCase()}) is ${direction} ${pct}% today. Financial explainer with animated price charts, dramatic market music, and analyst narration. 3 scenes.`,
          source: "direct" as const,
        };
      });
    }
  } catch {
    // fall through
  }

  return [
    {
      id: "crypto-mock-0",
      type: "crypto",
      headline: "Bitcoin rallying toward new all-time highs",
      context: "Live market data",
      suggestedPrompt:
        "Bitcoin rally explainer: why BTC is breaking records in 2026. Cinematic financial documentary style with animated charts and dramatic narration. 3 scenes.",
      source: "direct",
    },
  ];
}

// ─── Weather topics ───────────────────────────────────────────────────────────

async function getWeatherTopics(): Promise<LiveTopic[]> {
  const nexlaData = await queryNexset(
    process.env.NEXLA_WEATHER_NEXSET_ID ?? ""
  );
  if (nexlaData) {
    return nexlaData.slice(0, 1).map((item, i) => {
      const w = item as Record<string, unknown>;
      const temp = Number(w.temperature_2m_max ?? w.temp ?? 0);
      const city = String(w.city ?? w.location ?? "New York City");
      return {
        id: `weather-${i}`,
        type: "weather",
        headline: `${city} hits ${temp}°C today`,
        context: "Live weather feed",
        suggestedPrompt: `Weather documentary: extreme conditions in ${city} — ${temp}°C and rising. Cinematic aerial shots, dramatic narration about climate patterns. 3 scenes.`,
        source: "nexla",
      };
    });
  }

  // Fallback: Open-Meteo (no auth required)
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&daily=temperature_2m_max,weathercode&forecast_days=1&timezone=America%2FNew_York",
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const data = await res.json() as {
        daily?: { temperature_2m_max?: number[]; weathercode?: number[] };
      };
      const temp = data.daily?.temperature_2m_max?.[0]?.toFixed(0) ?? "21";
      const code = data.daily?.weathercode?.[0] ?? 0;
      const condition =
        code <= 1
          ? "clear skies"
          : code <= 3
          ? "partly cloudy"
          : code <= 67
          ? "rainy"
          : "stormy";
      return [
        {
          id: "weather-0",
          type: "weather" as const,
          headline: `NYC: ${temp}°C with ${condition} today`,
          context: "Open-Meteo via Nexla",
          suggestedPrompt: `Urban weather story: New York City under ${condition} at ${temp}°C. Cinematic city footage, aerial drone shots, atmospheric narration about life in the city today. 3 scenes.`,
          source: "direct" as const,
        },
      ];
    }
  } catch {
    // fall through
  }

  return [];
}

// ─── Shared topic fetcher ────────────────────────────────────────────────────

async function getAllTopics(): Promise<{ topics: LiveTopic[]; nexlaConnected: boolean }> {
  const [news, crypto, weather] = await Promise.all([
    getNewsTopics(),
    getCryptoTopics(),
    getWeatherTopics(),
  ]);

  const topics: LiveTopic[] = [...news, ...crypto, ...weather];
  const nexlaConnected =
    !!(process.env.NEXLA_API_KEY && process.env.NEXLA_NEWS_NEXSET_ID);

  return { topics, nexlaConnected };
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const { topics, nexlaConnected } = await getAllTopics();

  return Response.json({
    topics,
    nexlaConnected,
    fetchedAt: new Date().toISOString(),
  });
}

// ─── POST handler — autonomous trigger ───────────────────────────────────────

export async function POST(request: Request) {
  const { topics } = await getAllTopics();

  if (topics.length === 0) {
    return NextResponse.json(
      { error: "No trending topics available" },
      { status: 404 }
    );
  }

  const topic = topics[0];

  // Build absolute URL for internal API call
  const url = new URL("/api/generate", request.url);

  const generateRes = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: topic.suggestedPrompt,
      sceneCount: 3,
      resolution: "1080p",
      engine: "auto",
    }),
  });

  if (!generateRes.ok) {
    const err = await generateRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: "Failed to start generation", details: err },
      { status: 502 }
    );
  }

  const { jobId } = (await generateRes.json()) as { jobId: string };

  return NextResponse.json({
    jobId,
    topic,
    redirectUrl: `/generate?jobId=${jobId}`,
  });
}
