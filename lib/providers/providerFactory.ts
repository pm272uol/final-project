import type { AppConfig } from "@/lib/config";
import { MockStoryboardProvider } from "@/lib/providers/mockProvider";
import { OllamaStoryboardProvider } from "@/lib/providers/ollamaProvider";
import type { StoryboardProvider } from "@/lib/providers/types";

export function createStoryboardProvider(config: AppConfig): StoryboardProvider {
  if (config.provider === "mock") {
    return new MockStoryboardProvider();
  }

  return new OllamaStoryboardProvider({
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    timeoutMs: config.ollamaTimeoutMs,
  });
}
