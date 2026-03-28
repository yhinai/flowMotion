import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const SYSTEM_PROMPT = `You are FlowMotion's AI video director — an expert creative collaborator for AI-generated video.

You help users:
- Craft compelling video prompts and scene descriptions
- Choose the right template (product-launch, explainer, social-promo, brand-story)
- Tune visual style: overlays, transitions, music mood, pacing
- Debug or improve scripts that didn't turn out as expected
- Suggest creative directions based on their goal

Be concise, opinionated, and creative. When a user describes what they want, give them a concrete, ready-to-use prompt they can paste directly into FlowMotion. If they share a rough idea, refine it into something cinematic.`;

export async function POST(request: Request) {
  const { messages } = await request.json() as {
    messages: Array<{ role: string; content: string }>;
  };

  const contents = messages.map((m) => ({
    role: m.role === "user" ? "user" : ("model" as const),
    parts: [{ text: m.content }],
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await ai.models.generateContentStream({
          model: "gemini-2.0-flash",
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.7,
          },
        });

        for await (const chunk of response) {
          const text = chunk.text;
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
