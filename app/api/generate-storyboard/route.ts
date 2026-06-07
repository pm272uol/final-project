import { NextResponse } from "next/server";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { buildStoryboardPrompt } from "@/lib/promptBuilder";
import { isStoryboardInput } from "@/lib/storyboardSchema";

export async function POST(request: Request) {
  const body: unknown = await request.json();

  if (!isStoryboardInput(body)) {
    return NextResponse.json(
      { error: "Scene idea and creative constraints are required." },
      { status: 400 },
    );
  }

  // Build and retain the future model instruction while mock mode is active.
  buildStoryboardPrompt(body);

  await new Promise((resolve) => setTimeout(resolve, 650));

  return NextResponse.json({
    mode: "mock",
    storyboard: createMockStoryboard(body),
  });
}
