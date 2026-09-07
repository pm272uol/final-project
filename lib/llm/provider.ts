import { z } from "zod";
import { LLMError } from "./errors.ts";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMRunMetrics,
  StructuredLLMRequest,
  StructuredLLMResponse,
} from "./types.ts";
export function parseModelJson(value: string): unknown {
  try {
    return JSON.parse(
      value
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw new LLMError(
      "INVALID_MODEL_RESPONSE",
      "Model returned content that was not valid JSON.",
    );
  }
}
export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly providerName: "ollama" | "vercel";
  abstract readonly modelName: string;
  metricsSink: (metrics: LLMRunMetrics) => void = (metrics) =>
    console.info(JSON.stringify({ type: "llm_run", ...metrics }));
  protected abstract invoke(
    request: LLMRequest,
    schema?: Record<string, unknown>,
  ): Promise<LLMResponse>;
  generate(request: LLMRequest) {
    return this.run(request);
  }
  generateStructured<T>(
    request: StructuredLLMRequest<T>,
  ): Promise<StructuredLLMResponse<T>> {
    return this.run(request) as Promise<StructuredLLMResponse<T>>;
  }
  private async run<T>(
    request: LLMRequest | StructuredLLMRequest<T>,
  ): Promise<LLMResponse | StructuredLLMResponse<T>> {
    const start = performance.now();
    const record: LLMRunMetrics = {
      timestamp: new Date().toISOString(),
      operation: request.operation,
      provider: this.providerName,
      model: this.modelName,
      durationMs: 0,
      success: false,
    };
    try {
      if (!request.operation.trim() || !request.messages.length)
        throw new LLMError(
          "PROVIDER_REQUEST_FAILED",
          "An operation and at least one message are required.",
        );
      const response = await this.invoke(
        request,
        "schema" in request ? z.toJSONSchema(request.schema) : undefined,
      );
      Object.assign(record, response.usage, response.metrics, {
        model: response.model,
      });
      if (!response.text.trim())
        throw new LLMError(
          "INVALID_MODEL_RESPONSE",
          "Model returned an empty response.",
        );
      let result: LLMResponse | StructuredLLMResponse<T> = response;
      if ("schema" in request) {
        const parsed = request.schema.safeParse(parseModelJson(response.text));
        if (!parsed.success)
          throw new LLMError(
            "INVALID_MODEL_RESPONSE",
            `Model output failed schema validation: ${parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ").slice(0, 2000)}`,
          );
        request.validate?.(parsed.data);
        result = { ...response, data: parsed.data };
      }
      record.success = true;
      return result;
    } catch (error) {
      record.error =
        error instanceof LLMError ? error.code : "PROVIDER_REQUEST_FAILED";
      throw error;
    } finally {
      record.durationMs = Math.round(performance.now() - start);
      try {
        this.metricsSink(record);
      } catch {
        /* Observability must not change generation results. */
      }
    }
  }
}
