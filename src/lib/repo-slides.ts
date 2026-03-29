import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SlideContent {
  readonly title: string;
  readonly subtitle?: string;
  readonly bullets?: readonly string[];
  readonly code?: string;
  readonly stats?: Record<string, string>;
  readonly type:
    | "title"
    | "overview"
    | "tech-stack"
    | "architecture"
    | "features"
    | "stats"
    | "code"
    | "contributors"
    | "summary";
}

export interface RepoSlideshow {
  readonly repoName: string;
  readonly repoUrl: string;
  readonly slides: readonly SlideContent[];
  readonly totalSlides: number;
  readonly generatedAt: string;
}

/**
 * Rich analysis of a GitHub repository.
 * Produced by github.ts and consumed here for slide generation.
 */
export interface RepoAnalysis {
  readonly name: string;
  readonly fullName: string;
  readonly description: string;
  readonly url: string;
  readonly stars: number;
  readonly forks: number;
  readonly openIssues: number;
  readonly language: string;
  readonly topics: readonly string[];
  readonly readmeContent: string;
  readonly ownerAvatarUrl: string;
  readonly defaultBranch: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly license?: string;
  readonly languages: Record<string, number>;
  readonly fileTree: readonly string[];
  readonly dependencies: Record<string, string>;
  readonly recentCommits: readonly string[];
  readonly contributors: readonly ContributorInfo[];
}

export interface ContributorInfo {
  readonly login: string;
  readonly avatarUrl: string;
  readonly contributions: number;
}

// ─── Zod Schema for Gemini structured output ────────────────────────────────

const SlideContentSchema = z.object({
  title: z.string().describe("Slide title text"),
  subtitle: z.string().optional().describe("Optional subtitle or tagline"),
  bullets: z
    .array(z.string())
    .optional()
    .describe("Bullet points for the slide content"),
  code: z
    .string()
    .optional()
    .describe("Code snippet or config excerpt to highlight"),
  stats: z
    .record(z.string(), z.string())
    .optional()
    .describe("Key-value stats to display, e.g. { 'Stars': '12.4k' }"),
  type: z
    .enum([
      "title",
      "overview",
      "tech-stack",
      "architecture",
      "features",
      "stats",
      "code",
      "contributors",
      "summary",
    ])
    .describe("Slide layout type"),
});

const SlideshowResponseSchema = z.object({
  slides: z
    .array(SlideContentSchema)
    .min(8)
    .max(12)
    .describe("Array of 8-12 slides for the presentation"),
});

// ─── Prompt helpers ─────────────────────────────────────────────────────────

const MAX_README_CHARS = 3000;
const MAX_FILE_TREE_ENTRIES = 40;
const MAX_COMMITS = 15;
const MAX_DEPENDENCIES = 30;

function truncateReadme(readme: string): string {
  if (readme.length <= MAX_README_CHARS) return readme;
  return readme.slice(0, MAX_README_CHARS) + "\n... (truncated)";
}

function formatFileTree(files: readonly string[]): string {
  const limited = files.slice(0, MAX_FILE_TREE_ENTRIES);
  const result = limited.join("\n");
  if (files.length > MAX_FILE_TREE_ENTRIES) {
    return result + `\n... and ${files.length - MAX_FILE_TREE_ENTRIES} more files`;
  }
  return result;
}

function formatLanguages(languages: Record<string, number>): string {
  const total = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);
  if (total === 0) return "No language data available";

  return Object.entries(languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([lang, bytes]) => {
      const pct = ((bytes / total) * 100).toFixed(1);
      return `${lang}: ${pct}%`;
    })
    .join(", ");
}

function formatDependencies(deps: Record<string, string>): string {
  const entries = Object.entries(deps).slice(0, MAX_DEPENDENCIES);
  if (entries.length === 0) return "No dependency data available";

  const result = entries.map(([name, version]) => `${name}@${version}`).join(", ");
  const remaining = Object.keys(deps).length - MAX_DEPENDENCIES;
  if (remaining > 0) {
    return result + `, ... and ${remaining} more`;
  }
  return result;
}

function formatContributors(contributors: readonly ContributorInfo[]): string {
  if (contributors.length === 0) return "No contributor data available";
  return contributors
    .slice(0, 10)
    .map((c) => `${c.login} (${c.contributions} commits)`)
    .join(", ");
}

function buildPrompt(analysis: RepoAnalysis): string {
  return `Analyze the following GitHub repository and generate a compelling slide presentation (8-12 slides).

## Repository Information

- **Name**: ${analysis.name}
- **Full Name**: ${analysis.fullName}
- **URL**: ${analysis.url}
- **Description**: ${analysis.description || "No description provided"}
- **Primary Language**: ${analysis.language}
- **Stars**: ${analysis.stars.toLocaleString()}
- **Forks**: ${analysis.forks.toLocaleString()}
- **Open Issues**: ${analysis.openIssues.toLocaleString()}
- **License**: ${analysis.license || "Not specified"}
- **Created**: ${analysis.createdAt}
- **Last Updated**: ${analysis.updatedAt}
- **Topics**: ${analysis.topics.length > 0 ? analysis.topics.join(", ") : "None"}

## Language Breakdown
${formatLanguages(analysis.languages)}

## File Structure
${formatFileTree(analysis.fileTree)}

## Dependencies
${formatDependencies(analysis.dependencies)}

## Recent Commits
${analysis.recentCommits.slice(0, MAX_COMMITS).join("\n")}

## Top Contributors
${formatContributors(analysis.contributors)}

## README (excerpt)
${truncateReadme(analysis.readmeContent)}

---

Generate exactly 8-12 slides following this structure:

1. **Title slide** (type: "title") — repo name as title, a catchy tagline as subtitle, include stars and primary language in stats
2. **Overview slide** (type: "overview") — what the project does, who it's for, why it matters as bullets
3. **Tech Stack slide** (type: "tech-stack") — languages, frameworks, key dependencies as bullets
4. **Architecture slide** (type: "architecture") — how the code is organized, key directories, design patterns as bullets
5-7. **Feature slides** (type: "features") — 2-3 slides covering the most important features/capabilities as bullets
8. **Stats slide** (type: "stats") — file count, contributors, commits, stars, forks, etc. as stats key-value pairs
9. **Code slide** (type: "code") — an interesting code pattern, config snippet, or usage example in the code field
10. **Contributors slide** (type: "contributors") — top contributors listed as bullets
11-12. **Summary / Getting Started** (type: "summary") — how to get started, installation, key takeaways as bullets

Rules:
- Each slide MUST have a title and a type
- Use bullets for list-like content, stats for key-value data, code for code snippets
- Keep bullet points concise (under 15 words each)
- The code slide should show a real or representative snippet from the repo
- Make the presentation engaging and informative — this is for a developer audience
- If information is not available for a slide, still generate it with reasonable inferences from the README and file structure`;
}

// ─── Gemini client ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert developer advocate who creates compelling, visually structured slide presentations about open-source repositories. Your presentations distill complex codebases into clear, engaging narratives that help developers understand a project's value, architecture, and usage in minutes.

Guidelines:
- Write titles that are concise and memorable
- Bullets should be scannable — one idea per bullet, no filler
- Stats should use human-friendly formatting (e.g., "12.4k" not "12400")
- Code snippets should highlight the most interesting or representative pattern
- The overall narrative should flow: hook → context → details → action`;

/**
 * Generate a structured slide presentation from a GitHub repo analysis using Gemini.
 *
 * @param repoAnalysis - Full analysis of the repository (from github.ts)
 * @returns A RepoSlideshow with 8-12 structured slides
 * @throws Error if Gemini call fails or response parsing fails
 */
export async function generateRepoSlides(
  repoAnalysis: RepoAnalysis
): Promise<RepoSlideshow> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(repoAnalysis);
  const jsonSchema = z.toJSONSchema(SlideshowResponseSchema, { target: "draft-7" });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
      temperature: 0.6,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response for repo slide generation");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (parseError: unknown) {
    const message =
      parseError instanceof Error ? parseError.message : "Unknown parse error";
    throw new Error(`Failed to parse Gemini JSON response: ${message}`);
  }

  const validated = SlideshowResponseSchema.parse(parsed);

  return {
    repoName: repoAnalysis.name,
    repoUrl: repoAnalysis.url,
    slides: validated.slides,
    totalSlides: validated.slides.length,
    generatedAt: new Date().toISOString(),
  };
}
