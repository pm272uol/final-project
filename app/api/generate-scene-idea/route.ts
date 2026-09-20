import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppConfig } from "@/lib/config";
import { createLLMProvider } from "@/lib/llm/create-provider";
import { LLMError } from "@/lib/llm/errors";
import { chooseSceneIdeaVariation, mockSceneIdea, sceneIdeaPrompt, sceneIdeaRequestSchema } from "@/lib/sceneIdea";

const outputSchema = z.object({ sceneIdea: z.string().trim().min(1).max(200) }).strict();

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 16_384) return NextResponse.json({ error: "Scene idea request is too large." }, { status: 413 });
    let value: unknown;
    try { value = body.trim() ? JSON.parse(body) : {}; }
    catch { return NextResponse.json({ error: "Invalid scene idea request." }, { status: 400 }); }
    const parsed = sceneIdeaRequestSchema.safeParse(value);
    if (!parsed.success) return NextResponse.json({ error: "Invalid scene idea request." }, { status: 400 });
    const { recentSuggestions } = parsed.data;
    const variation = chooseSceneIdeaVariation(recentSuggestions);
    const config = getAppConfig();
    if (config.provider === "mock") {
      return NextResponse.json({
        sceneIdea: mockSceneIdea(recentSuggestions),
        variation,
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
          role: "system",
          content: sceneIdeaPrompt(variation),
        },
        { role: "user", content: JSON.stringify({ recentSuggestionsToAvoid: recentSuggestions.map(item => item.sceneIdea) }) },
      ],
    });
    return NextResponse.json({ ...result.data, variation });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof LLMError
        ? error.message
        : "The scene idea could not be generated. Check the LLM configuration and try again.",
    }, { status: error instanceof LLMError && error.code === "PROVIDER_TIMEOUT" ? 504 : 502 });
  }
}
