import { readFile } from "node:fs/promises";
import type { EvaluationConfig, EvaluationModel } from "../core/schemas.ts";

type OllamaEnvelope = {
  model?: string;
  response?: string;
  thinking?: string;
  message?: { content?: string; thinking?: string };
  done?: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
};

export type RunnerResult = {
  rawOutput: string;
  rawThinking?: string;
  rawResponseEnvelope: OllamaEnvelope;
  actualModel: string;
  wallTimeMs: number;
  providerTotalMs?: number;
  loadMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  tokensPerSecond?: number;
};

export async function runOllama(options: {
  config: EvaluationConfig;
  model: EvaluationModel;
  prompt: string;
  imagePath?: string;
  format?: unknown;
}): Promise<RunnerResult> {
  const { config, model, prompt, imagePath, format } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.settings.timeoutMs);
  const started = performance.now();

  try {
    const isVision = config.category === "vlm";
    const endpoint = isVision ? "/api/chat" : "/api/generate";
    const requestBody = isVision
      ? {
          model: model.model,
          messages: [{
            role: "user",
            content: prompt,
            images: imagePath ? [(await readFile(imagePath)).toString("base64")] : [],
          }],
          stream: false,
          think: config.settings.thinking,
          format,
          keep_alive: "10m",
          options: ollamaOptions(config),
        }
      : {
          model: model.model,
          prompt,
          stream: false,
          think: config.settings.thinking,
          format,
          keep_alive: "10m",
          options: ollamaOptions(config),
        };

    const response = await fetch(`${config.provider.baseUrl.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Ollama returned ${response.status}: ${text.slice(0, 500)}`);

    let envelope: OllamaEnvelope;
    try {
      envelope = JSON.parse(text) as OllamaEnvelope;
    } catch {
      throw new Error(`Ollama returned a malformed response envelope: ${text.slice(0, 500)}`);
    }
    const rawOutput = isVision ? envelope.message?.content : envelope.response;
    const rawThinking = isVision ? envelope.message?.thinking : envelope.thinking;
    if (typeof rawOutput !== "string") throw new Error("Ollama response did not contain model output.");
    const completionTokens = envelope.eval_count;
    const evalMilliseconds = nanosecondsToMs(envelope.eval_duration);
    const evalSeconds = evalMilliseconds === undefined ? undefined : evalMilliseconds / 1000;

    return {
      rawOutput,
      rawThinking,
      rawResponseEnvelope: envelope,
      actualModel: envelope.model ?? model.model,
      wallTimeMs: Math.round(performance.now() - started),
      providerTotalMs: nanosecondsToMs(envelope.total_duration),
      loadMs: nanosecondsToMs(envelope.load_duration),
      promptTokens: envelope.prompt_eval_count,
      completionTokens,
      tokensPerSecond: completionTokens && evalSeconds
        ? Math.round((completionTokens / evalSeconds) * 100) / 100
        : undefined,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Ollama request timed out after ${config.settings.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function unloadOllamaModel(config: EvaluationConfig, model: string) {
  try {
    await fetch(`${config.provider.baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
  } catch {
    // Unload is best-effort and must not erase a completed run.
  }
}

export async function listOllamaModels(baseUrl: string, timeoutMs = 30_000) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
    const body = await response.json() as {
      models?: Array<{
        name?: string;
        digest?: string;
        size?: number;
        capabilities?: string[];
      }>;
    };
    return body.models ?? [];
  } catch (error) {
    if (error instanceof Error && /TimeoutError|timed out|aborted due to timeout/i.test(`${error.name} ${error.message}`)) {
      throw new Error(`Ollama model inventory timed out after ${timeoutMs}ms.`);
    }
    throw error;
  }
}

function ollamaOptions(config: EvaluationConfig) {
  return {
    temperature: config.settings.temperature,
    num_ctx: config.settings.contextLength,
    num_predict: config.settings.maxOutputTokens,
    seed: config.settings.seed,
  };
}

function nanosecondsToMs(value?: number) {
  return value === undefined ? undefined : Math.round(value / 1_000_000);
}
