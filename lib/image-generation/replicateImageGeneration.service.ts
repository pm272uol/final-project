import sharp from "sharp";
import { referenceSheet } from "./referenceSheet";
import {
  ImageProviderError,
  type ImageGenerationService,
} from "@/lib/image-generation/types";
import type { ImageGenerationOptions } from "@/types/storyboard";

type ReplicateImageGenerationOptions = {
  apiToken: string;
  model: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

type ReplicatePrediction = {
  id?: unknown;
  status?: unknown;
  output?: unknown;
  error?: unknown;
  logs?: unknown;
  urls?: {
    get?: unknown;
  };
};

type ReplicateModel = {
  latest_version?: {
    id?: unknown;
  };
};

export class ReplicateImageGenerationService
  implements ImageGenerationService
{
  readonly name = "replicate" as const;
  readonly model: string;
  private readonly apiToken: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;
  private resolvedVersion?: string;

  constructor(options: ReplicateImageGenerationOptions) {
    this.apiToken = options.apiToken;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
    signal?: AbortSignal,
  ) {
    const klein = this.model === "black-forest-labs/flux-2-klein-4b";
    if (klein) {
      const roles = (options.references ?? []).map((ref, index) => `Image ${index + 1}: ${ref.purpose === "composition" ? "use this as the composition reference; preserve its layout and subjects except for the explicitly requested changes" : ref.purpose === "style" ? "use only its visual medium, palette and texture; create the requested new camera angle, setting and subjects" : `preserve the ${ref.purpose} appearance of ${ref.entityId ?? "the depicted subject"} only when visible in the requested shot`}.`).join(" ");
      prompt = `${prompt} ${roles} Create one storyboard frame, not a collage. ${options.negativePrompt ? `Avoid: ${options.negativePrompt}` : ""}`.trim();
    }
    const startedAt = performance.now();
    const width = options.width ?? 1024;
    const height = options.height ?? 576;
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), this.timeoutMs);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const nativeImages = klein ? await Promise.all((options.references ?? []).map(async ref => {
        if (!ref.imageUrl.startsWith("data:image/")) throw new ImageProviderError("IMAGE_PROVIDER_REQUEST_FAILED", "Hosted references must be embedded images.");
        const bytes = await sharp(Buffer.from(ref.imageUrl.split(",")[1], "base64"), { limitInputPixels: 20_000_000 }).rotate().resize(704, 704, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
        return `data:image/png;base64,${bytes.toString("base64")}`;
      })) : [];
      const styleImage = this.model === "fofr/style-transfer" ? await referenceSheet(options.references ?? []) : undefined;
      const version = await this.resolveVersion(combinedSignal);
      const response = await this.fetchImplementation(
        "https://api.replicate.com/v1/predictions",
        {
          method: "POST",
          headers: this.headers({ Prefer: "wait=60" }),
          body: JSON.stringify({
            version,
            input: klein ? {
              prompt, images: nativeImages,
              aspect_ratio: "16:9", output_megapixels: "0.5", output_format: "png",
              go_fast: true, seed: options.seed,
            } : this.model === "fofr/style-transfer" ? {
              prompt, negative_prompt: options.negativePrompt,
              style_image: styleImage,
              structure_image: options.references?.find(r => r.purpose === "composition")?.imageUrl,
              model: "fast", width, height, seed: options.seed,
              number_of_images: 1, output_format: "png", output_quality: 100,
              structure_denoising_strength: 0.85,
            } : {
              prompt,
              negative_prompt: options.negativePrompt,
              width,
              height,
              num_inference_steps: options.steps ?? 30,
              guidance_scale: options.guidanceScale ?? 7,
              seed: options.seed,
              num_outputs: 1,
            },
          }),
          signal: combinedSignal,
        },
      );

      if (!response.ok) {
        throw await providerHttpError(response);
      }

      const initialPrediction = (await response.json()) as ReplicatePrediction;
      const prediction = await this.waitForPrediction(
        initialPrediction,
        combinedSignal,
      );
      assertPredictionSucceeded(prediction);
      const imageUrl = getOutputUrl(prediction.output);

      if (!imageUrl) {
        throw new ImageProviderError(
          "IMAGE_PROVIDER_INVALID_RESPONSE",
          "Replicate completed without returning an image URL.",
          undefined,
          predictionDiagnostic(prediction),
        );
      }

      return {
        imageUrl,
        modelVersion: version,
        settings: klein ? { model: "klein-4b-distilled", steps: 4, guidanceScale: 1, outputMegapixels: "0.5", aspectRatio: "16:9", goFast: "true", negativePromptControl: "prompt-text", referenceMaxSide: 704 } as Record<string, string | number> : this.model === "fofr/style-transfer" ? { model: "fast", steps: 4, guidanceScale: 2 } : { model: "sdxl", steps: options.steps ?? 30, guidanceScale: options.guidanceScale ?? 7 },
        provider: this.name,
        model: this.model,
        prompt,
        negativePrompt: options.negativePrompt,
        seed: options.seed,
        width,
        height,
        generatedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      if (error instanceof ImageProviderError) throw error;
      if (error instanceof SyntaxError) throw new ImageProviderError("IMAGE_PROVIDER_INVALID_RESPONSE", "Replicate returned malformed JSON.", error);
      if (combinedSignal.aborted) {
        const timedOut = timeoutController.signal.aborted && !signal?.aborted;
        throw new ImageProviderError(
          timedOut ? "IMAGE_PROVIDER_TIMEOUT" : "IMAGE_PROVIDER_ABORTED",
          timedOut
            ? "Replicate image generation timed out."
            : "Image generation was cancelled.",
          error,
        );
      }
      throw new ImageProviderError(
        "IMAGE_PROVIDER_UNAVAILABLE",
        "Replicate could not be reached.",
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private headers(additional: Record<string, string> = {}) {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
      ...additional,
    };
  }

  private async resolveVersion(signal: AbortSignal) {
    if (this.resolvedVersion) return this.resolvedVersion;

    if (/^[a-f0-9]{64}$/i.test(this.model)) {
      this.resolvedVersion = this.model;
      return this.resolvedVersion;
    }

    const [owner, name, ...extra] = this.model.split("/");
    if (!owner || !name || extra.length > 0) {
      throw new ImageProviderError(
        "IMAGE_PROVIDER_REQUEST_FAILED",
        `Replicate model "${this.model}" must use owner/name format.`,
      );
    }

    const response = await this.fetchImplementation(
      `https://api.replicate.com/v1/models/${owner}/${name}`,
      {
        headers: this.headers(),
        signal,
      },
    );
    if (!response.ok) {
      throw await providerHttpError(response);
    }

    const model = (await response.json()) as ReplicateModel;
    const version = model.latest_version?.id;
    if (typeof version !== "string" || !version) {
      throw new ImageProviderError(
        "IMAGE_PROVIDER_INVALID_RESPONSE",
        `Replicate model "${this.model}" has no usable latest version.`,
      );
    }

    this.resolvedVersion = version;
    return version;
  }

  private async waitForPrediction(
    initial: ReplicatePrediction,
    signal: AbortSignal,
  ) {
    let prediction = initial;

    while (isRunning(prediction.status)) {
      await abortableDelay(1_000, signal);
      const getUrl =
        typeof prediction.urls?.get === "string"
          ? prediction.urls.get
          : typeof prediction.id === "string"
            ? `https://api.replicate.com/v1/predictions/${prediction.id}`
            : undefined;

      if (!getUrl) {
        throw new ImageProviderError(
          "IMAGE_PROVIDER_INVALID_RESPONSE",
          "Replicate returned a running prediction without a status URL.",
          undefined,
          predictionDiagnostic(prediction),
        );
      }

      const statusUrl = new URL(getUrl);
      if (statusUrl.origin !== "https://api.replicate.com" || !statusUrl.pathname.startsWith("/v1/predictions/")) throw new ImageProviderError("IMAGE_PROVIDER_INVALID_RESPONSE", "Unexpected prediction status URL.");
      const response = await this.fetchImplementation(getUrl, {
        headers: this.headers(),
        signal,
      });
      if (!response.ok) {
        throw await providerHttpError(response);
      }
      prediction = (await response.json()) as ReplicatePrediction;
    }

    return prediction;
  }
}

function getOutputUrl(output: unknown): string | undefined {
  if (typeof output === "string" && output.startsWith("http")) return output;
  if (!Array.isArray(output)) return undefined;
  return output.find(
    (item): item is string =>
      typeof item === "string" && item.startsWith("http"),
  );
}

function isRunning(status: unknown) {
  return status === "starting" || status === "processing";
}

function assertPredictionSucceeded(prediction: ReplicatePrediction) {
  if (prediction.status === "succeeded") return;

  const diagnostic = predictionDiagnostic(prediction);
  if (prediction.status === "failed") {
    throw new ImageProviderError(
      "IMAGE_PROVIDER_REQUEST_FAILED",
      "Replicate failed while generating the image.",
      undefined,
      diagnostic,
    );
  }
  if (prediction.status === "canceled") {
    throw new ImageProviderError(
      "IMAGE_PROVIDER_ABORTED",
      "Replicate canceled the image generation.",
      undefined,
      diagnostic,
    );
  }
  throw new ImageProviderError(
    "IMAGE_PROVIDER_INVALID_RESPONSE",
    "Replicate returned an unexpected prediction status.",
    undefined,
    diagnostic,
  );
}

async function providerHttpError(response: Response) {
  const diagnostic = await readProviderError(response);
  const status = response.status;
  if (status === 401 || status === 403) {
    return new ImageProviderError(
      "IMAGE_PROVIDER_UNAUTHORISED",
      "Replicate rejected the configured API token.",
      undefined,
      diagnostic,
    );
  }
  if (status === 402) {
    return new ImageProviderError(
      "IMAGE_PROVIDER_PAYMENT_REQUIRED",
      "Replicate requires billing credit before image generation can run.",
      undefined,
      diagnostic,
    );
  }
  if (status === 429) {
    return new ImageProviderError(
      "IMAGE_PROVIDER_RATE_LIMITED",
      "Replicate is temporarily rate limiting image generation.",
      undefined,
      diagnostic,
    );
  }
  return new ImageProviderError(
    "IMAGE_PROVIDER_REQUEST_FAILED",
    `Replicate image generation failed with status ${status}.`,
    undefined,
    diagnostic,
  );
}

async function readProviderError(response: Response) {
  const text = (await response.text()).trim();
  return `HTTP ${response.status}${text ? `: ${truncate(text, 2_000)}` : ""}`;
}

function predictionDiagnostic(prediction: ReplicatePrediction) {
  const error =
    typeof prediction.error === "string" ? prediction.error.trim() : "";
  const logs = typeof prediction.logs === "string" ? prediction.logs.trim() : "";
  return [
    typeof prediction.id === "string" ? `prediction=${prediction.id}` : "",
    typeof prediction.status === "string" ? `status=${prediction.status}` : "",
    error ? `error=${truncate(error, 1_000)}` : "",
    logs ? `logs=${truncate(logs, 2_000)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function truncate(value: string, maximumLength: number) {
  return value.length > maximumLength
    ? `${value.slice(0, maximumLength)}...`
    : value;
}

function abortableDelay(durationMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
