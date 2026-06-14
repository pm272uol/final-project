import { z } from "zod";
import { buildStoryboardPrompt } from "@/lib/promptBuilder";
import {
  StoryboardProviderError,
  type StoryboardGenerationContext,
  type StoryboardProvider,
  type StoryboardProviderProgress,
} from "@/lib/providers/types";
import {
  generatedStoryboardPackageSchema,
  validateStoryboardPackage,
} from "@/lib/storyboardSchema";
import type { StoryboardInput } from "@/types/storyboard";

const ollamaResponseSchema = z.object({
  model: z.string(),
  response: z.string(),
  done: z.boolean(),
  total_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

const ollamaStreamChunkSchema = z.object({
  model: z.string().optional(),
  response: z.string().default(""),
  done: z.boolean(),
  total_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

type OllamaProviderOptions = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

export class OllamaStoryboardProvider implements StoryboardProvider {
  readonly name = "ollama" as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: OllamaProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async generate(
    input: StoryboardInput,
    context: StoryboardGenerationContext = {},
  ) {
    const startedAt = performance.now();
    const inactivityTimeout = createInactivityTimeout(this.timeoutMs);
    const signal = combineSignals(
      context.signal,
      inactivityTimeout.controller.signal,
    );
    const abortWaiter = waitForAbort(signal);
    const streaming = Boolean(context.onProgress);

    try {
      context.onProgress?.({
        type: "status",
        message: `Waiting for ${this.model} to begin responding...`,
      });
      const response = await Promise.race([
        this.fetchImplementation(`${this.baseUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            prompt: buildStoryboardPrompt(input),
            stream: streaming,
            format: z.toJSONSchema(generatedStoryboardPackageSchema),
            options: {
              temperature: 0.2,
              num_ctx: 8192,
            },
          }),
          signal,
        }),
        abortWaiter.promise,
      ]);
      inactivityTimeout.reset();

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        if (response.status === 404 && /model/i.test(detail)) {
          throw new StoryboardProviderError(
            "MODEL_NOT_FOUND",
            `Ollama model "${this.model}" is not installed.`,
          );
        }

        throw new StoryboardProviderError(
          "PROVIDER_REQUEST_FAILED",
          `Ollama request failed with status ${response.status}: ${detail}`,
        );
      }

      const ollamaResult = ollamaResponseSchema.safeParse(
        streaming
          ? await readStreamingResponse(
              response,
              context.onProgress,
              inactivityTimeout.reset,
              abortWaiter.promise,
            )
          : await Promise.race([response.json(), abortWaiter.promise]),
      );
      inactivityTimeout.clear();
      if (!ollamaResult.success) {
        throw new StoryboardProviderError(
          "INVALID_MODEL_RESPONSE",
          "Ollama returned an unexpected response envelope.",
          ollamaResult.error,
        );
      }

      context.onProgress?.({
        type: "status",
        message: "Validating the completed storyboard package...",
      });
      const parsedStoryboard = parseModelJson(ollamaResult.data.response);
      const validation = validateStoryboardPackage(
        parsedStoryboard,
        input.panelCount,
      );

      if (!validation.success) {
        throw new StoryboardProviderError(
          "INVALID_MODEL_RESPONSE",
          `Ollama returned storyboard JSON that failed validation: ${validation.issues.join(" ")}`,
          validation.issues,
        );
      }

      return {
        storyboard: validation.data,
        metadata: {
          mode: "ollama" as const,
          provider: "ollama" as const,
          model: ollamaResult.data.model || this.model,
          durationMs:
            ollamaResult.data.total_duration !== undefined
              ? Math.round(ollamaResult.data.total_duration / 1_000_000)
              : Math.round(performance.now() - startedAt),
          promptTokens: ollamaResult.data.prompt_eval_count,
          completionTokens: ollamaResult.data.eval_count,
        },
      };
    } catch (error) {
      if (error instanceof StoryboardProviderError) throw error;

      if (signal.aborted) {
        const timedOut = inactivityTimeout.controller.signal.aborted;
        throw new StoryboardProviderError(
          timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_ABORTED",
          timedOut
            ? `Ollama stream was inactive for ${this.timeoutMs}ms.`
            : "Ollama generation was cancelled.",
          error,
        );
      }

      throw new StoryboardProviderError(
        "PROVIDER_UNAVAILABLE",
        `Could not connect to Ollama at ${this.baseUrl}. Start it with: ollama serve`,
        error,
      );
    } finally {
      inactivityTimeout.clear();
      abortWaiter.cleanup();
    }
  }
}

async function readStreamingResponse(
  response: Response,
  onProgress?: (progress: StoryboardProviderProgress) => void,
  onActivity?: () => void,
  abortPromise?: Promise<never>,
) {
  if (!response.body) {
    throw new StoryboardProviderError(
      "INVALID_MODEL_RESPONSE",
      "Ollama returned an empty streaming response.",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let generatedText = "";
  let finalChunk: z.infer<typeof ollamaStreamChunkSchema> | undefined;

  async function processLine(line: string) {
    if (!line.trim()) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new StoryboardProviderError(
        "INVALID_MODEL_RESPONSE",
        "Ollama returned a malformed streaming response.",
        error,
      );
    }

    const chunkResult = ollamaStreamChunkSchema.safeParse(parsed);
    if (!chunkResult.success) {
      throw new StoryboardProviderError(
        "INVALID_MODEL_RESPONSE",
        "Ollama returned an unexpected streaming response.",
        chunkResult.error,
      );
    }

    const chunk = chunkResult.data;
    generatedText += chunk.response;
    if (chunk.response) {
      onProgress?.({ type: "output", text: chunk.response });
    }
    if (chunk.done) finalChunk = chunk;
  }

  while (true) {
    const readPromise = reader.read();
    const { done, value } = abortPromise
      ? await Promise.race([readPromise, abortPromise])
      : await readPromise;
    if (value && value.byteLength > 0) onActivity?.();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      await processLine(line);
    }

    if (done) break;
  }

  await processLine(buffer);

  if (!finalChunk) {
    throw new StoryboardProviderError(
      "INVALID_MODEL_RESPONSE",
      "Ollama ended its response before generation completed.",
    );
  }

  return {
    ...finalChunk,
    model: finalChunk.model ?? "",
    response: generatedText,
  };
}

function createInactivityTimeout(timeoutMs: number) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };
  const reset = () => {
    clear();
    timeoutId = setTimeout(
      () =>
        controller.abort(
          new Error(`Ollama stream was inactive for ${timeoutMs}ms.`),
        ),
      timeoutMs,
    );
  };

  reset();
  return { controller, reset, clear };
}

export function parseModelJson(value: string): unknown {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(withoutFence);
  } catch (error) {
    throw new StoryboardProviderError(
      "INVALID_MODEL_RESPONSE",
      "Ollama returned content that was not valid JSON.",
      error,
    );
  }
}

function combineSignals(
  requestSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
) {
  return requestSignal
    ? AbortSignal.any([requestSignal, timeoutSignal])
    : timeoutSignal;
}

function waitForAbort(signal: AbortSignal) {
  let onAbort: (() => void) | undefined;
  const promise = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });

  return {
    promise,
    cleanup: () => {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    },
  };
}

async function readErrorDetail(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? response.statusText;
  } catch {
    return response.statusText || "Unknown Ollama error";
  }
}
