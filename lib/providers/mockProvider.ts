import { diagnosticCall } from "../diagnostics/server";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import type {
  StoryboardGenerationContext,
  StoryboardProvider,
} from "@/lib/providers/types";
import type { StoryboardInput } from "@/types/storyboard";

export class MockStoryboardProvider implements StoryboardProvider {
  readonly name = "mock" as const;
  readonly model = "deterministic-scene-aware-v1";

  async generate(
    input: StoryboardInput,
    context: StoryboardGenerationContext = {},
  ) {
    const startedAt = performance.now();
    context.onProgress?.({
      type: "status",
      message: "Building the deterministic storyboard...",
    });

    return diagnosticCall("scene_generation", this.name, this.model, input, () => ({
      storyboard: createMockStoryboard(input),
      metadata: {
        mode: "mock" as const,
        provider: "mock" as const,
        model: this.model,
        durationMs: Math.round(performance.now() - startedAt),
      },
    }));
  }
}
