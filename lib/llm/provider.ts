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
      const jsonSchema = "schema" in request ? z.toJSONSchema(request.schema) : undefined;
      let invocation: LLMRequest = request;
      let result: LLMResponse | StructuredLLMResponse<T>;
      for (let attempt = 0; ; attempt++) {
        const response = await this.invoke(invocation, jsonSchema);
        for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
          const value = response.usage?.[key];
          if (value !== undefined) record[key] = (record[key] ?? 0) + value;
        }
        const previousCost = record.estimatedCostUsd;
        const previousInference = record.inferenceDurationMs;
        Object.assign(record, response.metrics, { model: response.model });
        if (response.metrics.estimatedCostUsd !== undefined)
          record.estimatedCostUsd = (previousCost ?? 0) + response.metrics.estimatedCostUsd;
        if (response.metrics.inferenceDurationMs !== undefined)
          record.inferenceDurationMs = (previousInference ?? 0) + response.metrics.inferenceDurationMs;
        result = response;
        try {
          if (!response.text.trim()) throw new LLMError("INVALID_MODEL_RESPONSE", "Model returned an empty response.");
          if ("schema" in request) {
            const parsed = request.schema.safeParse(parseModelJson(response.text));
            if (!parsed.success) throw new LLMError(
              "INVALID_MODEL_RESPONSE",
              `Model output failed schema validation: ${parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ").slice(0, 2000)}`,
            );
            request.validate?.(parsed.data);
            result = { ...response, data: parsed.data };
          }
          if (attempt > 0) {
            result.usage = { inputTokens: record.inputTokens, outputTokens: record.outputTokens, totalTokens: record.totalTokens };
            result.metrics = { ...response.metrics, durationMs: Math.round(performance.now() - start),
              inferenceDurationMs: record.inferenceDurationMs, estimatedCostUsd: record.estimatedCostUsd };
          }
          break;
        } catch (error) {
          const invalidOutput = error instanceof Error && "code" in error && error.code === "INVALID_MODEL_RESPONSE";
          if (!("schema" in request) || !invalidOutput || attempt >= (request.repairAttempts ?? 0) || request.signal?.aborted) throw error;
          request.onProgress?.({ type: "status", message: "Correcting the storyboard format, then validating again…" });
          invocation = { ...request, temperature: 0, messages: [
            ...request.messages,
            { role: "assistant", content: response.text },
            { role: "user", content: `The previous JSON failed validation: ${error.message}\nReturn the complete corrected JSON object, keeping the original scene and requested panel count. Use only the exact field names and non-empty strings required by the schema. Omit optional fields when unused; use [] for no continuity changes. Do not add explanations or markdown.\nJSON schema: ${JSON.stringify(jsonSchema)}` },
          ] };
        }
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
