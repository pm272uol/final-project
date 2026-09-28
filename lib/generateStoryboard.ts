import { withDiagnosticResponse } from "./diagnostics/server";
import { resolveShotReferences } from "@/lib/image-generation/promptBuilder";
import { createVisualBible } from "@/lib/visualBible";
import { NextResponse } from "next/server";
import { getAppConfig, type AppConfig } from "@/lib/config";
import { MockStoryboardProvider } from "@/lib/providers/mockProvider";
import { createStoryboardProvider } from "@/lib/providers/providerFactory";
import {
  StoryboardProviderError,
  type StoryboardProvider,
  type StoryboardProviderProgress,
} from "@/lib/providers/types";
import {
  validateStoryboardInput,
  validateStoryboardPackage,
} from "@/lib/storyboardSchema";

type GenerateStoryboardOptions = {
  provider?: StoryboardProvider;
  fallbackProvider?: StoryboardProvider;
  config?: AppConfig;
  signal?: AbortSignal;
  onProgress?: (progress: StoryboardProviderProgress) => void;
};

export const createGenerateStoryboardResponse = withDiagnosticResponse(generateStoryboardResponse);

async function generateStoryboardResponse(
  body: unknown,
  options: GenerateStoryboardOptions = {},
) {
  const config = options.config ?? getAppConfig();
  const inputResult = validateStoryboardInput(body);

  if (!inputResult.success) {
    return NextResponse.json(
      {
        error:
          "Scene idea and valid creative constraints are required to generate a storyboard.",
        code: "INVALID_STORYBOARD_INPUT",
        validationIssues: inputResult.issues,
      },
      { status: 400 },
    );
  }

  const provider = options.provider ?? createStoryboardProvider(config);
  const fallbackProvider =
    options.fallbackProvider ?? new MockStoryboardProvider();
  let providerResult;
  let fallbackUsed = false;
  let fallbackReason: string | undefined;

  try {
    providerResult = await provider.generate(inputResult.data, {
      signal: options.signal,
      onProgress: options.onProgress,
    });
  } catch (error) {
    if (
      config.mockFallback &&
      provider.name !== "mock" &&
      !isAbortError(error, options.signal)
    ) {
      fallbackUsed = true;
      fallbackReason =
        error instanceof Error ? error.message : "Unknown provider failure";
      options.onProgress?.({
        type: "status",
        message: "The local model failed. Generating the mock fallback...",
      });
      providerResult = await fallbackProvider.generate(inputResult.data, {
        signal: options.signal,
        onProgress: options.onProgress,
      });
    } else {
      return providerErrorResponse(error);
    }
  }

  const outputResult = validateStoryboardPackage(
    providerResult.storyboard,
    inputResult.data.panelCount,
  );

  if (!outputResult.success) {
    return NextResponse.json(
      {
        error:
          "The generated storyboard did not match the required output schema.",
        code: "STORYBOARD_SCHEMA_VALIDATION_FAILED",
        validationIssues: outputResult.issues,
      },
      { status: 502 },
    );
  }

  const visualBible = createVisualBible(outputResult.data, inputResult.data);
  return NextResponse.json({
    mode: providerResult.metadata.mode,
    storyboard: {
      ...outputResult.data,
      visualStyle: inputResult.data.visualStyle,
      visualBible,
      storyboard: outputResult.data.storyboard.map(panel => resolveShotReferences(panel, {
        visualBible, visualStyle: inputResult.data.visualStyle, characterContinuity: "",
      })),
    },
    metadata: {
      ...providerResult.metadata,
      fallbackUsed,
      fallbackReason,
    },
  });
}

function providerErrorResponse(error: unknown) {
  const providerError =
    error instanceof StoryboardProviderError
      ? error
      : new StoryboardProviderError(
          "PROVIDER_REQUEST_FAILED",
          "The storyboard provider failed unexpectedly.",
          error,
        );
  const statusByCode = {
    PROVIDER_ABORTED: 499,
    PROVIDER_TIMEOUT: 504,
    PROVIDER_UNAVAILABLE: 503,
    MODEL_NOT_FOUND: 503,
    INVALID_MODEL_RESPONSE: 502,
    PROVIDER_REQUEST_FAILED: 502,
    PROVIDER_AUTHENTICATION: 502,
    PROVIDER_RATE_LIMIT: 429,
  } as const;

  return NextResponse.json(
    {
      error: providerError.message,
      code: providerError.code,
    },
    { status: statusByCode[providerError.code] },
  );
}

function isAbortError(error: unknown, requestSignal?: AbortSignal) {
  return (
    requestSignal?.aborted ||
    (error instanceof StoryboardProviderError &&
      error.code === "PROVIDER_ABORTED")
  );
}
