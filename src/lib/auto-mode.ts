import type { AutoInputType, ExtractedContent } from "./types";
import { parseGitHubUrl, fetchGitHubMetadata } from "./github";
import { extractYouTubeId } from "./youtube";
import { analyzeYouTubeVideo } from "./gemini";

// ─── Input Detection ───────────────────────────────────────────────────────

const GITHUB_RE = /github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+/;
const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch|shorts|live)|youtu\.be\/|youtube\.com\/embed\/)/;
const URL_RE = /^https?:\/\//i;

/**
 * Detect what kind of input the user provided.
 * Order matters: check specific URL patterns before generic URL.
 */
export function detectInputType(input: string): AutoInputType {
  const trimmed = input.trim();

  let result: AutoInputType;
  if (GITHUB_RE.test(trimmed)) result = "github";
  else if (YOUTUBE_RE.test(trimmed)) result = "youtube";
  else if (URL_RE.test(trimmed)) result = "website";
  else result = "text";

  console.log(`[AutoMode:Detect] input="${trimmed.slice(0, 80)}" → type=${result}`);
  return result;
}

// ─── Content Extraction Router ─────────────────────────────────────────────

/**
 * Extract structured content from user input based on its detected type.
 * For 'video' type, the bot layer handles file download and passes through
 * videoLocalPath/videoUrl — this function won't be called for that type.
 */
export async function extractContent(
  input: string,
  inputType: AutoInputType,
): Promise<ExtractedContent> {
  console.log(`[AutoMode:Extract] type=${inputType} input="${input.slice(0, 80)}"`);
  const startMs = Date.now();
  const result = await extractContentInner(input, inputType);
  console.log(`[AutoMode:Extract] DONE in ${Date.now() - startMs}ms → title="${result.title}" rawContent=${result.rawContent.length} chars`);
  return result;
}

async function extractContentInner(
  input: string,
  inputType: AutoInputType,
): Promise<ExtractedContent> {
  switch (inputType) {
    case "github":
      return extractGitHubContent(input.trim());
    case "youtube":
      return extractYouTubeContent(input.trim());
    case "website":
      return extractWebContent(input.trim());
    case "text":
      return extractTextContent(input);
    case "video":
      // Video uploads are handled by the bot layer before reaching here
      return {
        inputType: "video",
        title: "Uploaded Video",
        description: "User-uploaded video file",
        rawContent: "",
      };
  }
}

// ─── GitHub Extractor ──────────────────────────────────────────────────────

async function extractGitHubContent(url: string): Promise<ExtractedContent> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    return {
      inputType: "github",
      title: "GitHub Repository",
      description: "Could not parse GitHub URL",
      rawContent: url,
    };
  }

  try {
    const meta = await fetchGitHubMetadata(parsed.owner, parsed.repo);

    const rawParts = [
      `Repository: ${meta.name}`,
      `Description: ${meta.description}`,
      `Language: ${meta.language}`,
      `Stars: ${meta.stars}`,
      meta.topics.length > 0 ? `Topics: ${meta.topics.join(", ")}` : "",
      meta.features.length > 0
        ? `Key Features:\n${meta.features.map((f) => `- ${f}`).join("\n")}`
        : "",
      meta.readmeContent
        ? `\nREADME:\n${meta.readmeContent.slice(0, 3000)}`
        : "",
    ];

    return {
      inputType: "github",
      title: meta.name,
      description: meta.description || `${meta.language} repository with ${meta.stars} stars`,
      rawContent: rawParts.filter(Boolean).join("\n"),
      metadata: {
        owner: parsed.owner,
        repo: parsed.repo,
        stars: meta.stars,
        language: meta.language,
        topics: meta.topics,
        ownerAvatarUrl: meta.ownerAvatarUrl,
        features: meta.features,
      },
    };
  } catch (error) {
    console.error("GitHub extraction failed:", error);
    return {
      inputType: "github",
      title: `${parsed.owner}/${parsed.repo}`,
      description: "Failed to fetch repository details",
      rawContent: url,
      metadata: { owner: parsed.owner, repo: parsed.repo },
    };
  }
}

// ─── YouTube Extractor ─────────────────────────────────────────────────────

async function extractYouTubeContent(url: string): Promise<ExtractedContent> {
  const videoId = extractYouTubeId(url);

  // Try Gemini video analysis first (deep content understanding)
  let geminiAnalysis: string | null = null;
  try {
    geminiAnalysis = await analyzeYouTubeVideo(url);
  } catch (error) {
    console.warn("Gemini YouTube analysis failed, falling back to oEmbed:", error);
  }

  // Fetch oEmbed metadata (no API key needed)
  let title = "YouTube Video";
  let author = "";
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const data = await res.json();
      title = data.title || title;
      author = data.author_name || "";
    }
  } catch {
    // oEmbed failed, use what we have
  }

  const description = author ? `Video by ${author}` : "YouTube video";
  const rawContent = geminiAnalysis || `Title: ${title}\nAuthor: ${author}\nURL: ${url}`;

  return {
    inputType: "youtube",
    title,
    description,
    rawContent,
    metadata: {
      videoId,
      author,
      url,
      hasGeminiAnalysis: !!geminiAnalysis,
    },
  };
}

// ─── URL Safety Check ─────────────────────────────────────────────────────

/**
 * Block SSRF: reject URLs pointing to private/internal networks.
 * Checks the hostname against known private ranges and reserved domains.
 */
function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Block common private/internal hostnames
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "metadata.google.internal" ||
      hostname === "169.254.169.254" // AWS/GCP metadata endpoint
    ) {
      return true;
    }

    // Block private IPv4 ranges
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (
        a === 10 ||                          // 10.0.0.0/8
        a === 127 ||                         // 127.0.0.0/8
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
        (a === 192 && b === 168) ||          // 192.168.0.0/16
        a === 0                              // 0.0.0.0/8
      ) {
        return true;
      }
    }

    // Block non-HTTP(S) protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }

    return false;
  } catch {
    return true; // Malformed URL → block
  }
}

// ─── Website Extractor ─────────────────────────────────────────────────────

async function extractWebContent(url: string): Promise<ExtractedContent> {
  try {
    // SSRF protection: block private/internal URLs
    if (isPrivateUrl(url)) {
      return {
        inputType: "website",
        title: url,
        description: "URL blocked: private or internal addresses are not allowed",
        rawContent: url,
      };
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FlowMotion/1.0; +https://flowmotion.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });

    if (!res.ok) {
      return {
        inputType: "website",
        title: url,
        description: `Failed to fetch: ${res.status}`,
        rawContent: url,
      };
    }

    const html = await res.text();

    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/\s+/g, " ").trim()
      : new URL(url).hostname;

    // Extract meta description
    const descMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i,
    );
    const metaDesc = descMatch ? descMatch[1].trim() : "";

    // Extract og:description as fallback
    const ogDescMatch = html.match(
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i,
    );
    const description = metaDesc || (ogDescMatch ? ogDescMatch[1].trim() : "");

    // Strip HTML tags and extract visible body text
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    const visibleText = bodyHtml
      // Remove script and style blocks
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      // Remove all HTML tags
      .replace(/<[^>]+>/g, " ")
      // Decode common HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

    const rawParts = [
      `Title: ${title}`,
      description ? `Description: ${description}` : "",
      `\nContent:\n${visibleText}`,
    ];

    return {
      inputType: "website",
      title,
      description: description || `Content from ${new URL(url).hostname}`,
      rawContent: rawParts.filter(Boolean).join("\n"),
      metadata: { url, hostname: new URL(url).hostname },
    };
  } catch (error) {
    console.error("Website extraction failed:", error);
    return {
      inputType: "website",
      title: url,
      description: "Failed to extract website content",
      rawContent: url,
      metadata: { url },
    };
  }
}

// ─── Plain Text Extractor ──────────────────────────────────────────────────

function extractTextContent(input: string): ExtractedContent {
  const trimmed = input.trim();

  // Try to extract a title from the first line or sentence
  const firstLine = trimmed.split("\n")[0].trim();
  const title =
    firstLine.length <= 100
      ? firstLine
      : firstLine.slice(0, 97) + "...";

  return {
    inputType: "text",
    title,
    description: trimmed.length > 200 ? trimmed.slice(0, 197) + "..." : trimmed,
    rawContent: trimmed,
  };
}
