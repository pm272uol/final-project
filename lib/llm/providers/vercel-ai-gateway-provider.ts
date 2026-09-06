import { z } from "zod";
import { BaseLLMProvider } from "../provider.ts";
import { estimateCost, type ModelPricing } from "../pricing.ts";
import { LLMError } from "../errors.ts";
import type { LLMRequest, LLMResponse } from "../types.ts";
const envelope = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().nonnegative().optional(),
      completion_tokens: z.number().nonnegative().optional(),
      total_tokens: z.number().nonnegative().optional(),
    })
    .optional(),
});
export class VercelAIGatewayProvider extends BaseLLMProvider {
  readonly providerName = "vercel" as const;
  readonly modelName: string;
  constructor(
    private readonly options: {
      model: string;
      apiKey: string;
      baseUrl: string;
      timeoutMs: number;
      pricing?: ModelPricing;
      fetchImplementation?: typeof fetch;
    },
  ) {
    super();
    this.modelName = options.model;
  }
  protected async invoke(
    request: LLMRequest,
    schema?: Record<string, unknown>,
  ): Promise<LLMResponse> {
    const start = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs,
    );
    const signal = request.signal
      ? AbortSignal.any([request.signal, controller.signal])
      : controller.signal;
    let listener: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      listener = () => reject(new Error("Aborted"));
      if (signal.aborted) listener();
      else signal.addEventListener("abort", listener, { once: true });
    });
    try {
      request.onProgress?.({
        type: "status",
        message: `Waiting for ${this.modelName} to begin responding...`,
      });
      const response = await Promise.race([
        (this.options.fetchImplementation ?? fetch)(
          `${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`,
          {
            method: "POST",
            signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.options.apiKey}`,
            },
            body: JSON.stringify({
              model: this.modelName,
              stream: false,
              messages: request.messages.map(({ role, content, images }) => ({
                role,
                content: images?.length
                  ? [
                      { type: "text", text: content },
                      ...images.map((image) => ({
                        type: "image_url",
                        image_url: {
                          url: `data:image/${image.startsWith("iVBOR") ? "png" : image.startsWith("UklGR") ? "webp" : "jpeg"};base64,${image}`,
                        },
                      })),
                    ]
                  : content,
              })),
              temperature: request.temperature,
              max_tokens: request.maxTokens,
              response_format: schema
                ? {
                    type: "json_schema",
                    json_schema: { name: "response", schema, strict: true },
                  }
                : undefined,
            }),
          },
        ),
        aborted,
      ]);
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        const code =
          response.status === 401 || response.status === 403
            ? "PROVIDER_AUTHENTICATION"
            : response.status === 429
              ? "PROVIDER_RATE_LIMIT"
              : "PROVIDER_REQUEST_FAILED";
        throw new LLMError(
          code,
          `AI Gateway request failed with status ${response.status}.`,
        );
      }
      let body: unknown;
      try {
        body = await Promise.race([response.json(), aborted]);
      } catch (error) {
        if (signal.aborted) throw error;
        throw new LLMError(
          "INVALID_MODEL_RESPONSE",
          "AI Gateway returned invalid JSON.",
        );
      }
      const parsed = envelope.safeParse(body);
      if (!parsed.success || parsed.data.choices[0].finish_reason === "length")
        throw new LLMError(
          "INVALID_MODEL_RESPONSE",
          "AI Gateway returned an invalid or incomplete response.",
        );
      const usage = {
        inputTokens: parsed.data.usage?.prompt_tokens,
        outputTokens: parsed.data.usage?.completion_tokens,
        totalTokens: parsed.data.usage?.total_tokens,
      };
      return {
        text: parsed.data.choices[0].message.content ?? "",
        provider: this.providerName,
        model: parsed.data.model ?? this.modelName,
        usage,
        metrics: {
          durationMs: Math.round(performance.now() - start),
          estimatedCostUsd: estimateCost(usage, this.options.pricing),
        },
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      if (signal.aborted)
        throw new LLMError(
          controller.signal.aborted ? "PROVIDER_TIMEOUT" : "PROVIDER_ABORTED",
          controller.signal.aborted
            ? "LLM request timed out."
            : "LLM request was cancelled.",
        );
      throw new LLMError(
        "PROVIDER_UNAVAILABLE",
        "Could not connect to AI Gateway.",
      );
    } finally {
      clearTimeout(timeout);
      if (listener) signal.removeEventListener("abort", listener);
    }
  }
}
