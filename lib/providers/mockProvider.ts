import { createMockStoryboard } from "@/lib/mockStoryboard";
import type { StoryboardProvider } from "@/lib/providers/types";
import type { StoryboardInput } from "@/types/storyboard";

export class MockStoryboardProvider implements StoryboardProvider {
  readonly name = "mock" as const;
  readonly model = "deterministic-scene-aware-v1";

  async generate(input: StoryboardInput) {
    const startedAt = performance.now();

    return {
      storyboard: createMockStoryboard(input),
      metadata: {
        mode: "mock" as const,
        provider: "mock" as const,
        model: this.model,
        durationMs: Math.round(performance.now() - startedAt),
      },
    };
  }
}
