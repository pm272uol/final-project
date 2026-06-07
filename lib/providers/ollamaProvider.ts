import { z } from "zod";
import { buildStoryboardPrompt } from "@/lib/promptBuilder";
import {
  StoryboardProviderError,
  type StoryboardGenerationContext,
  type StoryboardProvider,
} from "@/lib/providers/types";
import {
  storyboardPackageSchema,
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
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(
      () => timeoutController.abort(new Error("Ollama request timed out.")),
      this.timeoutMs,
    );
    const signal = combineSignals(context.signal, timeoutController.signal);
    const abortWaiter = waitForAbort(signal);

    try {
      const response = await Promise.race([
        this.fetchImplementation(`${this.baseUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            prompt: buildStoryboardPrompt(input),
            stream: false,
            format: z.toJSONSchema(storyboardPackageSchema),
            options: {
              temperature: 0.2,
              num_ctx: 8192,
            },
          }),
          signal,
        }),
        abortWaiter.promise,
      ]);

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

      const ollamaResult = ollamaResponseSchema.safeParse(await response.json());
      if (!ollamaResult.success) {
        throw new StoryboardProviderError(
          "INVALID_MODEL_RESPONSE",
          "Ollama returned an unexpected response envelope.",
          ollamaResult.error,
        );
      }

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
        const timedOut = timeoutController.signal.aborted;
        throw new StoryboardProviderError(
          timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_ABORTED",
          timedOut
            ? `Ollama did not respond within ${this.timeoutMs}ms.`
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
      clearTimeout(timeoutId);
      abortWaiter.cleanup();
    }
  }
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
