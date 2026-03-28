import { NextResponse } from "next/server";
import { z } from "zod";
import { createJob as createInMemoryJob } from "@/queue/worker";

const RepoSlidesRequestSchema = z.object({
  repoUrl: z
    .string()
    .url()
    .refine(
      (url) => /github\.com\/[\w.-]+\/[\w.-]+/.test(url),
      "Must be a valid GitHub repository URL"
    ),
  slideCount: z.number().min(6).max(15).optional().default(10),
  aspectRatio: z.enum(["16:9", "9:16"]).optional().default("16:9"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RepoSlidesRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { repoUrl, slideCount, aspectRatio } = parsed.data;

    // Create job using Path B (text-video) pipeline with repo analysis
    const jobId = createInMemoryJob(repoUrl, "1080p", slideCount, {
      pathType: "path-b",
      pathConfig: {
        path: "remotion-only",
        type: "text-video",
        aspectRatio,
        text: `__REPO_SLIDES__:${repoUrl}`,
      },
    });

    return NextResponse.json(
      { jobId, message: "Repo slide generation started" },
      { status: 202 }
    );
  } catch (error) {
    console.error("Repo slides API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
