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
  readonly name: "ollama" | "mock";
  readonly model: string;
  generate(
    input: StoryboardInput,
    context?: StoryboardGenerationContext,
  ): Promise<StoryboardProviderResult>;
}

export type ProviderErrorCode =
  | "PROVIDER_ABORTED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "MODEL_NOT_FOUND"
  | "INVALID_MODEL_RESPONSE"
  | "PROVIDER_REQUEST_FAILED";

export class StoryboardProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StoryboardProviderError";
  }
}
