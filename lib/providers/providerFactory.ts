import type { AppConfig } from "@/lib/config";
import { MockStoryboardProvider } from "@/lib/providers/mockProvider";
import { createLLMProvider } from "@/lib/llm/create-provider";
import { LLMStoryboardProvider } from "./llmStoryboardProvider";
import type { StoryboardProvider } from "@/lib/providers/types";

export function createStoryboardProvider(
  config: AppConfig,
): StoryboardProvider {
  if (config.provider === "mock") {
    return new MockStoryboardProvider();
  }

  return new LLMStoryboardProvider(
    createLLMProvider(
      config.llm ?? {
        provider: config.provider,
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaModel,
        timeoutMs: config.ollamaTimeoutMs,
      },
    ),
  );
}
