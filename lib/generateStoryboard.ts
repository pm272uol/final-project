import { NextResponse } from "next/server";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { buildStoryboardPrompt } from "@/lib/promptBuilder";
import {
  validateStoryboardInput,
  validateStoryboardPackage,
} from "@/lib/storyboardSchema";
import type { StoryboardInput } from "@/types/storyboard";

type StoryboardGenerator = (input: StoryboardInput) => unknown;

export async function createGenerateStoryboardResponse(
  body: unknown,
  generateStoryboard: StoryboardGenerator = createMockStoryboard,
) {
  const inputResult = validateStoryboardInput(body);

  if (!inputResult.success) {
    return NextResponse.json(
      {
        error:
          "Scene idea and valid creative constraints are required to generate a storyboard.",
        code: "INVALID_STORYBOARD_INPUT",
        validationIssues: inputResult.issues,
      },
      { status: 400 },
    );
  }

  // Build and retain the future model instruction while mock mode is active.
  buildStoryboardPrompt(inputResult.data);

  if (process.env.NODE_ENV !== "test") {
    await new Promise((resolve) => setTimeout(resolve, 650));
  }

  const generatedStoryboard = generateStoryboard(inputResult.data);
  const outputResult = validateStoryboardPackage(
    generatedStoryboard,
    inputResult.data.panelCount,
  );

  if (!outputResult.success) {
    return NextResponse.json(
      {
        error:
          "The generated storyboard did not match the required output schema.",
        code: "STORYBOARD_SCHEMA_VALIDATION_FAILED",
        validationIssues: outputResult.issues,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    mode: "mock",
    storyboard: outputResult.data,
  });
}
