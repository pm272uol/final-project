import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppConfig } from "@/lib/config";
import { createLLMProvider } from "@/lib/llm/create-provider";
import { LLMError } from "@/lib/llm/errors";
import { storyboardInputSchema } from "@/lib/storyboardSchema";

const outputSchema = z.object({ sceneIdea: storyboardInputSchema.shape.sceneIdea }).strict();

export async function POST(request: Request) {
  try {
    const config = getAppConfig();
    if (config.provider === "mock") {
      return NextResponse.json({
        sceneIdea: "A caretaker finds a forgotten suitcase at an empty train station. Inside is a photograph of the same platform, taken tomorrow.",
        mode: "mock",
      });
    }

    const result = await createLLMProvider(config.llm).generateStructured({
      operation: "scene_idea_generation",
      schema: outputSchema,
      signal: request.signal,
      temperature: 0.9,
      maxTokens: 500,
      messages: [
        {
          role: "user",
          content: "Generate one simple, original scene idea as a starting point for a short film. Choose any subject and setting. Use 1–2 short sentences with a clear visual action and a small conflict, surprise, or discovery. Keep it easy to imagine and under 400 characters. Return only a JSON object with a sceneIdea string; no title, headings, commentary, or shot list.",
        },
      ],
    });
    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof LLMError
        ? error.message
        : "The scene idea could not be generated. Check the LLM configuration and try again.",
    }, { status: error instanceof LLMError && error.code === "PROVIDER_TIMEOUT" ? 504 : 502 });
  }
}
