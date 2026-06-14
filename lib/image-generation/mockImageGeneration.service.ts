import type { ImageGenerationService } from "@/lib/image-generation/types";

export class MockImageGenerationService implements ImageGenerationService {
  readonly name = "mock" as const;
  readonly model = "deterministic-storyboard-placeholder-v1";

  async generateImage(
    prompt: string,
    options: Parameters<ImageGenerationService["generateImage"]>[1] = {},
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) {
      throw new DOMException("Image generation was aborted.", "AbortError");
    }

    const startedAt = performance.now();
    const width = options.width ?? 1024;
    const height = options.height ?? 576;
    const seed = options.seed ?? stableSeed(prompt);

    return {
      imageUrl: `/api/mock-panel-image?seed=${seed}`,
      provider: this.name,
      model: this.model,
      prompt,
      negativePrompt: options.negativePrompt,
      seed,
      width,
      height,
      generatedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}

function stableSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
