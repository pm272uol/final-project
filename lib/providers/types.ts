import type {
  GenerationMetadata,
  StoryboardInput,
  StoryboardPackage,
} from "@/types/storyboard";

export type StoryboardGenerationContext = {
  signal?: AbortSignal;
  onProgress?: (progress: StoryboardProviderProgress) => void;
};

export type StoryboardProviderProgress =
  | {
      type: "status";
      message: string;
    }
  | {
      type: "output";
      text: string;
    };

export type StoryboardProviderResult = {
  storyboard: StoryboardPackage;
  metadata: Omit<GenerationMetadata, "fallbackUsed">;
};

export interface StoryboardProvider {
  readonly name: "ollama" | "vercel" | "mock";
  readonly model: string;
  generate(
    input: StoryboardInput,
    context?: StoryboardGenerationContext,
  ): Promise<StoryboardProviderResult>;
}

export {
  LLMError as StoryboardProviderError,
  type LLMErrorCode as ProviderErrorCode,
} from "../llm/errors.ts";
