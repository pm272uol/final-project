import { z } from "zod";
import { BaseLLMProvider } from "../provider.ts";
import type { LLMRequest, LLMResponse } from "../types.ts";
import { LLMError } from "../errors.ts";
import type { LLMProgress } from "../types.ts";
const ollamaResponseSchema = z.object({
  model: z.string(),
  response: z.string(),
  done: z.literal(true),
  total_duration: z.number().optional(),
  prompt_eval_count: z.number().nonnegative().optional(),
  eval_count: z.number().nonnegative().optional(),
  eval_duration: z.number().nonnegative().optional(),
});

const ollamaStreamChunkSchema = z.object({
  model: z.string().optional(),
  response: z.string().default(""),
  done: z.boolean(),
  total_duration: z.number().optional(),
  prompt_eval_count: z.number().nonnegative().optional(),
  eval_count: z.number().nonnegative().optional(),
  eval_duration: z.number().nonnegative().optional(),
});

export type OllamaProviderOptions = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

export class OllamaProvider extends BaseLLMProvider {
  readonly providerName = "ollama" as const;
  readonly modelName: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: OllamaProviderOptions) {
    super();
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.modelName = options.model;
    this.timeoutMs = options.timeoutMs;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  protected async invoke(
    request: LLMRequest,
    schema?: Record<string, unknown>,
  ): Promise<LLMResponse> {
    let timeToFirstTokenMs: number | undefined;
    const context = {
      signal: request.signal,
      onProgress: request.onProgress
        ? (event: LLMProgress) => {
            if (
              event.type === "output" &&
              event.text &&
              timeToFirstTokenMs === undefined
            ) {
              timeToFirstTokenMs = Math.round(performance.now() - startedAt);
            }
            request.onProgress?.(event);
          }
        : undefined,
    };
    const startedAt = performance.now();
    const inactivityTimeout = createInactivityTimeout(this.timeoutMs);
    const signal = combineSignals(
      context.signal,
      inactivityTimeout.controller.signal,
    );
    const abortWaiter = waitForAbort(signal);
    const useChat =
      request.messages.length !== 1 ||
      request.messages[0]?.role !== "user" ||
      Boolean(request.messages[0]?.images?.length);
    const streaming = Boolean(context.onProgress) && !useChat;

    try {
      context.onProgress?.({
        type: "status",
        message: `Waiting for ${this.modelName} to begin responding...`,
      });
      const response = await Promise.race([
        this.fetchImplementation(
          `${this.baseUrl}/${useChat ? "api/chat" : "api/generate"}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: this.modelName,
              ...(useChat
                ? { messages: request.messages }
                : { prompt: request.messages[0].content }),
              stream: streaming,
              format: schema,
              options: {
                temperature: request.temperature,
                num_ctx: request.contextWindow ?? 8192,
                num_predict: request.maxTokens,
              },
            }),
            signal,
          },
        ),
        abortWaiter.promise,
      ]);
      inactivityTimeout.reset();

      if (!response.ok) {
        const detail = await Promise.race([
          readErrorDetail(response),
          abortWaiter.promise,
        ]);
        if (response.status === 404 && /model/i.test(detail)) {
          throw new LLMError(
            "MODEL_NOT_FOUND",
            `Ollama model "${this.modelName}" is not installed.`,
          );
        }

        throw new LLMError(
          response.status === 401 || response.status === 403
            ? "PROVIDER_AUTHENTICATION"
            : response.status === 429
              ? "PROVIDER_RATE_LIMIT"
              : "PROVIDER_REQUEST_FAILED",
          `Ollama request failed with status ${response.status}.`,
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
          : await Promise.race([
              response
                .json()
                .then((body) => {
                  if (!body || typeof body !== "object" || Array.isArray(body)) {
                    throw new LLMError("INVALID_MODEL_RESPONSE", "Ollama returned an invalid response envelope.");
                  }
                  return {
                    ...body,
                    response: body.response ?? body.message?.content,
                    model: body.model ?? this.modelName,
                    done: body.done ?? true,
                  };
                }),
              abortWaiter.promise,
            ]),
      );
      inactivityTimeout.clear();
      if (!ollamaResult.success) {
        throw new LLMError(
          "INVALID_MODEL_RESPONSE",
          "Ollama returned an unexpected response envelope.",
          ollamaResult.error,
        );
      }

      return {
        text: ollamaResult.data.response,
        provider: this.providerName,
        model: ollamaResult.data.model || this.modelName,
        usage: {
          inputTokens: ollamaResult.data.prompt_eval_count,
          outputTokens: ollamaResult.data.eval_count,
          totalTokens:
            ollamaResult.data.prompt_eval_count !== undefined &&
            ollamaResult.data.eval_count !== undefined
              ? ollamaResult.data.prompt_eval_count +
                ollamaResult.data.eval_count
              : undefined,
        },
        metrics: {
          durationMs: Math.round(performance.now() - startedAt),
          timeToFirstTokenMs,
          tokensPerSecond:
            ollamaResult.data.eval_duration &&
            ollamaResult.data.eval_count !== undefined
              ? ollamaResult.data.eval_count /
                (ollamaResult.data.eval_duration / 1_000_000_000)
              : undefined,
          inferenceDurationMs:
            ollamaResult.data.total_duration === undefined
              ? undefined
              : Math.round(ollamaResult.data.total_duration / 1_000_000),
        },
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      if (error instanceof SyntaxError)
        throw new LLMError(
          "INVALID_MODEL_RESPONSE",
          "Ollama returned invalid JSON.",
        );

      if (signal.aborted) {
        const timedOut = inactivityTimeout.controller.signal.aborted;
        throw new LLMError(
          timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_ABORTED",
          timedOut
            ? `Ollama stream was inactive for ${this.timeoutMs}ms.`
            : "Ollama generation was cancelled.",
          error,
        );
      }

      throw new LLMError(
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
  onProgress?: (progress: LLMProgress) => void,
  onActivity?: () => void,
  abortPromise?: Promise<never>,
) {
  if (!response.body) {
    throw new LLMError(
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
      throw new LLMError(
        "INVALID_MODEL_RESPONSE",
        "Ollama returned a malformed streaming response.",
        error,
      );
    }

    const chunkResult = ollamaStreamChunkSchema.safeParse(parsed);
    if (!chunkResult.success) {
      throw new LLMError(
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

  try {
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
      throw new LLMError(
        "INVALID_MODEL_RESPONSE",
        "Ollama ended its response before generation completed.",
      );
    }

    return {
      ...finalChunk,
      model: finalChunk.model ?? "",
      response: generatedText,
    };
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
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
