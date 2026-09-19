import sharp from "sharp";
import { randomInt } from "node:crypto";
import { persistProviderImage } from "@/lib/image-generation/assets";
import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/config";
import { createImageGenerationService } from "@/lib/image-generation/providerFactory";
import { buildSdxlPrompt } from "@/lib/image-generation/promptBuilder";
import { panelImageGenerationRequestSchema } from "@/lib/image-generation/schema";
import { ImageProviderError } from "@/lib/image-generation/types";
import type { PanelImageGenerationResponse } from "@/types/storyboard";

export async function POST(request: Request) {
  const config = getAppConfig();
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (contentLength > config.imageMaxRequestBytes) {
    return errorResponse(
      `Request body exceeds the ${config.imageMaxRequestBytes}-byte limit.`,
      "IMAGE_REQUEST_TOO_LARGE",
      413,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      "The image-generation request body is not valid JSON.",
      "INVALID_IMAGE_REQUEST_JSON",
      400,
    );
  }

  if (JSON.stringify(body).length > config.imageMaxRequestBytes) {
    return errorResponse(
      `Request body exceeds the ${config.imageMaxRequestBytes}-byte limit.`,
      "IMAGE_REQUEST_TOO_LARGE",
      413,
    );
  }

  const parsed = panelImageGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "The panel does not contain valid image-generation data.",
        code: "INVALID_PANEL_IMAGE_REQUEST",
        validationIssues: parsed.error.issues.map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "root";
          return `${path}: ${issue.message}`;
        }),
      },
      { status: 400 },
    );
  }

  try {
    const service = createImageGenerationService({ ...config, replicateModel: "black-forest-labs/flux-2-klein-4b" });
    const { prompt: shotPrompt, negativePrompt } = buildSdxlPrompt(
      parsed.data.panel,
      parsed.data.imageContext,
    );
    const refinement = parsed.data.refinement;
    const prompt = refinement
      ? `Refine the current storyboard image supplied as Image 1. Make this requested change: ${refinement.instructions}\nPreserve the composition, characters, setting and visual style except where the requested change requires otherwise. The requested change takes priority over conflicting details in the original shot description below. Return one finished frame.\nOriginal shot context: ${shotPrompt}`
      : shotPrompt;
    const references = refinement
      ? [{ id: "refinement-source", imageUrl: refinement.imageUrl, purpose: "composition" as const, approved: true, version: 1 }, ...(parsed.data.references ?? [])]
      : parsed.data.references;
    const result = await service.generateImage(
      prompt,
      {
        references,
        seed: parsed.data.seed ?? randomInt(0, 4294967296),
        width: 1024,
        height: 576,
        negativePrompt,
        outputFormat: "png",
      },
      request.signal,
    );
    const imageUrl = await persistProviderImage(result.imageUrl, request.signal);
    const dimensions = imageUrl.startsWith("data:image/") ? await sharp(Buffer.from(imageUrl.split(",")[1], "base64")).metadata() : undefined;
    const response: PanelImageGenerationResponse = {
      imageReferenceIds: references?.map(r => `${r.id}@${r.version}`) ?? [],
      imageModelVersion: result.modelVersion,
      imageSettings: result.settings,
      imageBibleVersion: parsed.data.imageContext.visualBible.version,
      panelNumber: parsed.data.panel.panelNumber,
      imagePrompt: result.prompt,
      negativePrompt: result.negativePrompt ?? negativePrompt,
      imageUrl,
      imageStatus: "complete",
      imageProvider: result.provider,
      imageModel: result.model,
      imageSeed: result.seed,
      imageWidth: dimensions?.width ?? result.width,
      imageHeight: dimensions?.height ?? result.height,
      imageGeneratedAt: result.generatedAt,
      imageGenerationDurationMs: result.durationMs,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ImageProviderError) {
      console.error("[image-generation] Provider request failed", {
        provider: config.imageProvider,
        model: config.replicateModel,
        panelNumber: parsed.data.panel.panelNumber,
        code: error.code,
        message: error.message,
        diagnostic: error.diagnostic,
        cause:
          error.cause instanceof Error
            ? error.cause.message
            : error.cause,
      });
      return errorResponse(
        userFacingProviderError(error),
        error.code,
        providerStatus(error),
      );
    }

    console.error("[image-generation] Unexpected image generation failure", {
      provider: config.imageProvider,
      panelNumber: parsed.data.panel.panelNumber,
      error: error instanceof Error ? error.message : error,
    });
    return errorResponse(
      "Image generation failed unexpectedly. Please retry this panel.",
      "IMAGE_GENERATION_FAILED",
      502,
    );
  }
}

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

function providerStatus(error: ImageProviderError) {
  if (error.code === "IMAGE_PROVIDER_UNAUTHORISED") return 503;
  if (error.code === "IMAGE_PROVIDER_PAYMENT_REQUIRED") return 402;
  if (error.code === "IMAGE_PROVIDER_RATE_LIMITED") return 429;
  if (error.code === "IMAGE_PROVIDER_TIMEOUT") return 504;
  if (error.code === "IMAGE_PROVIDER_ABORTED") return 499;
  return 502;
}

function userFacingProviderError(error: ImageProviderError) {
  switch (error.code) {
    case "IMAGE_PROVIDER_UNAUTHORISED":
      return "The image provider is not configured correctly.";
    case "IMAGE_PROVIDER_PAYMENT_REQUIRED":
      return "Replicate has insufficient credit. Add billing credit, wait a few minutes, then retry.";
    case "IMAGE_PROVIDER_RATE_LIMITED":
      return "The image provider is busy. Please retry this panel shortly.";
    case "IMAGE_PROVIDER_TIMEOUT":
      return "Image generation timed out. Please retry this panel.";
    case "IMAGE_PROVIDER_ABORTED":
      return "Image generation was cancelled.";
    case "IMAGE_PROVIDER_INVALID_RESPONSE":
      return "The image provider returned no usable image. Please retry.";
    default:
      return "Image generation failed. Please retry this panel.";
  }
}
