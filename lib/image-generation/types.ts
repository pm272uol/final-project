import type {
  ImageGenerationOptions,
  ImageGenerationResult,
  ImageProviderName,
} from "@/types/storyboard";

export interface ImageGenerationService {
  readonly name: ImageProviderName;
  readonly model: string;
  generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult>;
}

export type ImageProviderErrorCode =
  | "IMAGE_PROVIDER_ABORTED"
  | "IMAGE_PROVIDER_TIMEOUT"
  | "IMAGE_PROVIDER_UNAVAILABLE"
  | "IMAGE_PROVIDER_UNAUTHORISED"
  | "IMAGE_PROVIDER_PAYMENT_REQUIRED"
  | "IMAGE_PROVIDER_RATE_LIMITED"
  | "IMAGE_PROVIDER_INVALID_RESPONSE"
  | "IMAGE_PROVIDER_REQUEST_FAILED";

export class ImageProviderError extends Error {
  constructor(
    public readonly code: ImageProviderErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly diagnostic?: string,
  ) {
    super(message);
    this.name = "ImageProviderError";
  }
}
