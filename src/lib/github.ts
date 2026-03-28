import type { GitHubMetadata } from "./types";

// ─── Deep Repo Analysis Types ───────────────────────────────────────────────

export interface FileTreeEntry {
  readonly path: string;
  readonly type: string;
  readonly size?: number;
}

export interface Contributor {
  readonly login: string;
  readonly avatarUrl: string;
  readonly contributions: number;
}

export interface RepoCommit {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly date: string;
}

export interface RepoStats {
  readonly totalFiles: number;
  readonly totalDirs: number;
  readonly topLanguage: string;
  readonly hasCI: boolean;
  readonly hasDocker: boolean;
  readonly hasTests: boolean;
  readonly license: string;
}

export interface RepoAnalysis {
  readonly metadata: GitHubMetadata;
  readonly languages: Record<string, number>;
  readonly fileTree: readonly FileTreeEntry[];
  readonly keyFiles: Record<string, string>;
  readonly contributors: readonly Contributor[];
  readonly recentCommits: readonly RepoCommit[];
  readonly stats: RepoStats;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const GITHUB_API_BASE = "https://api.github.com";
const KEY_FILE_MAX_CHARS = 5000;

const KEY_FILE_PATHS: readonly string[] = [
  "README.md",
  "readme.md",
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "Makefile",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "LICENSE",
  "LICENSE.md",
  "CONTRIBUTING.md",
  "tsconfig.json",
  "setup.py",
  "setup.cfg",
];

const CI_WORKFLOW_GLOB = ".github/workflows/";

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AI-Video-Generator",
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function githubApiFetch<T>(path: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: headers ?? buildHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
}

// ─── Existing Functions (preserved) ─────────────────────────────────────────

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

export async function fetchGitHubMetadata(owner: string, repo: string): Promise<GitHubMetadata> {
  const headers = buildHeaders();

  const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers });
  if (!repoRes.ok) {
    throw new Error(`GitHub API error: ${repoRes.status} ${repoRes.statusText}`);
  }
  const repoData = await repoRes.json();

  let readmeContent = "";
  try {
    const readmeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`, {
      headers: { ...headers, Accept: "application/vnd.github.v3.raw" },
    });
    if (readmeRes.ok) {
      readmeContent = await readmeRes.text();
    }
  } catch {
    // README not available
  }

  const features = extractFeaturesFromReadme(readmeContent);

  return {
    name: repoData.name,
    description: repoData.description || "",
    stars: repoData.stargazers_count,
    language: repoData.language || "Unknown",
    topics: repoData.topics || [],
    readmeContent,
    ownerAvatarUrl: repoData.owner?.avatar_url || "",
    features,
  };
}

function extractFeaturesFromReadme(readme: string): string[] {
  const features: string[] = [];
  const lines = readme.split("\n");

  let inFeaturesSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#{1,3}\s*(features|highlights|what|why|key|benefits)/i.test(trimmed)) {
      inFeaturesSection = true;
      continue;
    }

    if (inFeaturesSection && /^#{1,3}\s/.test(trimmed) && !/features|highlights/i.test(trimmed)) {
      inFeaturesSection = false;
    }

    if (inFeaturesSection && /^[-*]\s+/.test(trimmed)) {
      const feature = trimmed.replace(/^[-*]\s+/, "").replace(/\*\*/g, "");
      if (feature.length > 5 && feature.length < 200) {
        features.push(feature);
      }
    }

    if (features.length >= 6) break;
  }

  if (features.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[-*]\s+/.test(trimmed)) {
        const feature = trimmed.replace(/^[-*]\s+/, "").replace(/\*\*/g, "");
        if (feature.length > 10 && feature.length < 200) {
          features.push(feature);
        }
      }
      if (features.length >= 4) break;
    }
  }

  return features;
}

export async function extractGitHubContent(url: string): Promise<GitHubMetadata> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }
  return fetchGitHubMetadata(parsed.owner, parsed.repo);
}

// ─── Deep Analysis Functions ────────────────────────────────────────────────

/**
 * Fetch the full recursive file tree for a repository.
 * Uses the Git Trees API with `recursive=1` for a single-request traversal.
 */
export async function fetchRepoTree(
  owner: string,
  repo: string,
): Promise<readonly FileTreeEntry[]> {
  const headers = buildHeaders();

  // First, get the default branch SHA from the repo endpoint
  const repoData = await githubApiFetch<{
    default_branch: string;
  }>(`/repos/${owner}/${repo}`, headers);

  const branchData = await githubApiFetch<{
    commit: { sha: string };
  }>(`/repos/${owner}/${repo}/branches/${repoData.default_branch}`, headers);

  const treeSha = branchData.commit.sha;

  const treeData = await githubApiFetch<{
    tree: ReadonlyArray<{ path: string; type: string; size?: number }>;
    truncated: boolean;
  }>(`/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`, headers);

  return treeData.tree.map((entry) => ({
    path: entry.path,
    type: entry.type,
    ...(entry.size !== undefined ? { size: entry.size } : {}),
  }));
}

/**
 * Read important files from the repository, returning their content
 * truncated to KEY_FILE_MAX_CHARS to avoid context overflow.
 */
export async function fetchKeyFiles(
  owner: string,
  repo: string,
  filePaths: readonly string[],
): Promise<Record<string, string>> {
  const headers = {
    ...buildHeaders(),
    Accept: "application/vnd.github.v3.raw",
  };

  const results = await Promise.allSettled(
    filePaths.map(async (filePath) => {
      const res = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`,
        { headers },
      );
      if (!res.ok) {
        return { filePath, content: null };
      }
      const rawContent = await res.text();
      return {
        filePath,
        content: rawContent.slice(0, KEY_FILE_MAX_CHARS),
      };
    }),
  );

  const keyFiles: Record<string, string> = {};
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.content !== null) {
      keyFiles[result.value.filePath] = result.value.content;
    }
  }

  return keyFiles;
}

/**
 * Fetch the language breakdown for a repository (language → bytes).
 */
export async function fetchRepoLanguages(
  owner: string,
  repo: string,
): Promise<Record<string, number>> {
  try {
    return await githubApiFetch<Record<string, number>>(
      `/repos/${owner}/${repo}/languages`,
    );
  } catch (error: unknown) {
    throw new Error(
      `Failed to fetch languages for ${owner}/${repo}: ${getErrorMessage(error)}`,
    );
  }
}

/**
 * Fetch the top 10 contributors for a repository.
 */
export async function fetchRepoContributors(
  owner: string,
  repo: string,
): Promise<readonly Contributor[]> {
  try {
    const data = await githubApiFetch<
      ReadonlyArray<{
        login: string;
        avatar_url: string;
        contributions: number;
      }>
    >(`/repos/${owner}/${repo}/contributors?per_page=10`);

    return data.map((c) => ({
      login: c.login,
      avatarUrl: c.avatar_url,
      contributions: c.contributions,
    }));
  } catch (error: unknown) {
    throw new Error(
      `Failed to fetch contributors for ${owner}/${repo}: ${getErrorMessage(error)}`,
    );
  }
}

/**
 * Fetch the 20 most recent commits for a repository.
 */
export async function fetchRecentCommits(
  owner: string,
  repo: string,
): Promise<readonly RepoCommit[]> {
  try {
    const data = await githubApiFetch<
      ReadonlyArray<{
        sha: string;
        commit: {
          message: string;
          author: { name: string; date: string } | null;
        };
      }>
    >(`/repos/${owner}/${repo}/commits?per_page=20`);

    return data.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author?.name ?? "Unknown",
      date: c.commit.author?.date ?? "",
    }));
  } catch (error: unknown) {
    throw new Error(
      `Failed to fetch commits for ${owner}/${repo}: ${getErrorMessage(error)}`,
    );
  }
}

// ─── Stat Derivation Helpers ────────────────────────────────────────────────

function deriveTopLanguage(languages: Record<string, number>): string {
  const entries = Object.entries(languages);
  if (entries.length === 0) return "Unknown";

  return entries.reduce(
    (top, current) => (current[1] > top[1] ? current : top),
    entries[0],
  )[0];
}

function deriveHasCI(fileTree: readonly FileTreeEntry[]): boolean {
  return fileTree.some((entry) => entry.path.startsWith(CI_WORKFLOW_GLOB));
}

function deriveHasDocker(fileTree: readonly FileTreeEntry[]): boolean {
  return fileTree.some(
    (entry) =>
      entry.path === "Dockerfile" ||
      entry.path.endsWith("/Dockerfile") ||
      entry.path === "docker-compose.yml" ||
      entry.path === "docker-compose.yaml" ||
      entry.path.endsWith("/docker-compose.yml") ||
      entry.path.endsWith("/docker-compose.yaml"),
  );
}

function deriveHasTests(fileTree: readonly FileTreeEntry[]): boolean {
  return fileTree.some(
    (entry) =>
      entry.path.includes("test/") ||
      entry.path.includes("tests/") ||
      entry.path.includes("__tests__/") ||
      entry.path.includes("spec/") ||
      entry.path.includes(".test.") ||
      entry.path.includes(".spec.") ||
      entry.path.includes("_test.go") ||
      entry.path.includes("_test.rs"),
  );
}

function deriveLicense(keyFiles: Record<string, string>): string {
  const licenseContent =
    keyFiles["LICENSE"] ?? keyFiles["LICENSE.md"] ?? "";

  if (!licenseContent) return "None detected";

  const lower = licenseContent.toLowerCase();
  if (lower.includes("mit license")) return "MIT";
  if (lower.includes("apache license")) return "Apache-2.0";
  if (lower.includes("gnu general public license") && lower.includes("version 3"))
    return "GPL-3.0";
  if (lower.includes("gnu general public license") && lower.includes("version 2"))
    return "GPL-2.0";
  if (lower.includes("bsd 2-clause")) return "BSD-2-Clause";
  if (lower.includes("bsd 3-clause")) return "BSD-3-Clause";
  if (lower.includes("mozilla public license")) return "MPL-2.0";
  if (lower.includes("isc license")) return "ISC";
  if (lower.includes("unlicense")) return "Unlicense";

  return "Other";
}

function deriveStats(
  fileTree: readonly FileTreeEntry[],
  languages: Record<string, number>,
  keyFiles: Record<string, string>,
): RepoStats {
  return {
    totalFiles: fileTree.filter((e) => e.type === "blob").length,
    totalDirs: fileTree.filter((e) => e.type === "tree").length,
    topLanguage: deriveTopLanguage(languages),
    hasCI: deriveHasCI(fileTree),
    hasDocker: deriveHasDocker(fileTree),
    hasTests: deriveHasTests(fileTree),
    license: deriveLicense(keyFiles),
  };
}

// ─── Discover CI workflow files from the tree ───────────────────────────────

function discoverWorkflowPaths(fileTree: readonly FileTreeEntry[]): readonly string[] {
  return fileTree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        entry.path.startsWith(CI_WORKFLOW_GLOB) &&
        (entry.path.endsWith(".yml") || entry.path.endsWith(".yaml")),
    )
    .map((entry) => entry.path);
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

/**
 * Perform a comprehensive analysis of a GitHub repository.
 * Fetches metadata, file tree, languages, contributors, recent commits,
 * and key file contents — all in parallel where possible.
 */
export async function analyzeRepo(url: string): Promise<RepoAnalysis> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }

  const { owner, repo } = parsed;

  // Phase 1: Fetch everything that can run in parallel
  const [metadata, fileTree, languages, contributors, recentCommits] =
    await Promise.all([
      fetchGitHubMetadata(owner, repo),
      fetchRepoTree(owner, repo),
      fetchRepoLanguages(owner, repo),
      fetchRepoContributors(owner, repo).catch((): readonly Contributor[] => []),
      fetchRecentCommits(owner, repo).catch((): readonly RepoCommit[] => []),
    ]);

  // Phase 2: Discover workflow files from tree, then fetch key files
  const workflowPaths = discoverWorkflowPaths(fileTree);
  const allKeyFilePaths = [...KEY_FILE_PATHS, ...workflowPaths];

  // Deduplicate paths (in case a key file path already exists in tree)
  const uniqueKeyFilePaths = Array.from(new Set(allKeyFilePaths));

  const keyFiles = await fetchKeyFiles(owner, repo, uniqueKeyFilePaths);

  // Phase 3: Derive stats from collected data
  const stats = deriveStats(fileTree, languages, keyFiles);

  return {
    metadata,
    languages,
    fileTree,
    keyFiles,
    contributors,
    recentCommits,
    stats,
  };
}
