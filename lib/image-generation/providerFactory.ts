import type { AppConfig } from "@/lib/config";
import { MockImageGenerationService } from "@/lib/image-generation/mockImageGeneration.service";
import { ReplicateImageGenerationService } from "@/lib/image-generation/replicateImageGeneration.service";
import {
  ImageProviderError,
  type ImageGenerationService,
} from "@/lib/image-generation/types";

export function createImageGenerationService(
  config: AppConfig,
): ImageGenerationService {
  if (config.imageProvider === "mock") {
    return new MockImageGenerationService();
  }

  if (!config.replicateApiToken) {
    throw new ImageProviderError(
      "IMAGE_PROVIDER_UNAUTHORISED",
      "Replicate image generation is not configured.",
    );
  }

  return new ReplicateImageGenerationService({
    apiToken: config.replicateApiToken,
    model: config.replicateModel,
    timeoutMs: config.imageGenerationTimeoutMs,
  });
}
