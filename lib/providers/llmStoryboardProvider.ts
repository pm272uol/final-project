import { buildStoryboardPrompt } from "../promptBuilder.ts";
import {
  generatedStoryboardPackageSchema,
  validateStoryboardPackage,
} from "../storyboardSchema.ts";
import type { LLMProvider } from "@/lib/llm/types";
import {
  StoryboardProviderError,
  type StoryboardProvider,
  type StoryboardGenerationContext,
} from "./types.ts";
import type { StoryboardInput } from "@/types/storyboard";
export class LLMStoryboardProvider implements StoryboardProvider {
  get name() {
    return this.llm.providerName;
  }
  get model() {
    return this.llm.modelName;
  }
  constructor(private readonly llm: LLMProvider) {}
  async generate(
    input: StoryboardInput,
    context: StoryboardGenerationContext = {},
  ) {
    const response = await this.llm.generateStructured({
      operation: "scene_generation",
      messages: [{ role: "user", content: buildStoryboardPrompt(input) }],
      temperature: 0.2,
      schema: generatedStoryboardPackageSchema,
      repairAttempts: 1,
      ...context,
      validate: (data) => {
        const validation = validateStoryboardPackage(data, input.panelCount);
        if (!validation.success)
          throw new StoryboardProviderError(
            "INVALID_MODEL_RESPONSE",
            `Model returned an invalid storyboard sequence: ${validation.issues.join("; ")}`,
          );
      },
    });
    context.onProgress?.({
      type: "status",
      message: "Validating the completed storyboard package...",
    });
    const validated = validateStoryboardPackage(
      response.data,
      input.panelCount,
    );
    if (!validated.success)
      throw new StoryboardProviderError(
        "INVALID_MODEL_RESPONSE",
        "Invalid storyboard.",
      );
    return {
      storyboard: validated.data,
      metadata: {
        mode: this.name,
        provider: this.name,
        model: response.model,
        durationMs:
          response.metrics.inferenceDurationMs ?? response.metrics.durationMs,
        promptTokens: response.usage?.inputTokens,
        completionTokens: response.usage?.outputTokens,
        estimatedCostUsd: response.metrics.estimatedCostUsd,
      },
    };
  }
}
