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
  outputChannel: "response" | "thinking_json_fallback";
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
  const inactivityTimeout = createInactivityTimeout(config.settings.timeoutMs);
  const started = performance.now();

  try {
    const isVision = config.category === "vlm";
    const endpoint = isVision ? "/api/chat" : "/api/generate";
    const thinking = model.thinking;
    const requestBody = isVision
      ? {
          model: model.model,
          messages: [{
            role: "user",
            content: prompt,
            images: imagePath ? [(await readFile(imagePath)).toString("base64")] : [],
          }],
          stream: true,
          ...(thinking === undefined ? {} : { think: thinking }),
          format,
          keep_alive: "10m",
          options: ollamaOptions(config),
        }
      : {
          model: model.model,
          prompt,
          stream: true,
          ...(thinking === undefined ? {} : { think: thinking }),
          format,
          keep_alive: "10m",
          options: ollamaOptions(config),
        };

    const response = await fetch(`${config.provider.baseUrl.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: inactivityTimeout.controller.signal,
    });
    inactivityTimeout.reset();
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama returned ${response.status}: ${text.slice(0, 500)}`);
    }
    const envelope = await readOllamaStream(
      response,
      isVision,
      inactivityTimeout.reset,
      inactivityTimeout.controller.signal,
    );
    const responseOutput = isVision ? envelope.message?.content : envelope.response;
    const rawThinking = isVision ? envelope.message?.thinking : envelope.thinking;
    if (typeof responseOutput !== "string") throw new Error("Ollama response did not contain model output.");
    const useThinkingFallback = !responseOutput.trim() && isCompleteJson(rawThinking);
    const rawOutput = useThinkingFallback ? rawThinking : responseOutput;
    const completionTokens = envelope.eval_count;
    const evalMilliseconds = nanosecondsToMs(envelope.eval_duration);
    const evalSeconds = evalMilliseconds === undefined ? undefined : evalMilliseconds / 1000;

    return {
      rawOutput,
      rawThinking,
      outputChannel: useThinkingFallback ? "thinking_json_fallback" : "response",
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
    if (inactivityTimeout.controller.signal.aborted) {
      throw new Error(`Ollama stream was inactive for ${config.settings.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    inactivityTimeout.clear();
  }
}

async function readOllamaStream(
  response: Response,
  isVision: boolean,
  onActivity: () => void,
  signal: AbortSignal,
): Promise<OllamaEnvelope> {
  if (!response.body) throw new Error("Ollama returned an empty response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let responseOutput = "";
  let thinkingOutput = "";
  let finalEnvelope: OllamaEnvelope | undefined;
  const abortWaiter = waitForAbort(signal);

  const processLine = (line: string) => {
    if (!line.trim()) return;
    let chunk: OllamaEnvelope;
    try {
      chunk = JSON.parse(line) as OllamaEnvelope;
    } catch {
      throw new Error(`Ollama returned a malformed response envelope: ${line.slice(0, 500)}`);
    }

    responseOutput += isVision ? chunk.message?.content ?? "" : chunk.response ?? "";
    thinkingOutput += isVision ? chunk.message?.thinking ?? "" : chunk.thinking ?? "";
    finalEnvelope = chunk;
  };

  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), abortWaiter.promise]);
      if (value && value.byteLength > 0) onActivity();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
      if (done) break;
    }
  } finally {
    abortWaiter.cleanup();
  }
  processLine(buffer);

  if (!finalEnvelope?.done) {
    throw new Error("Ollama ended its response before generation completed.");
  }

  return {
    ...finalEnvelope,
    ...(isVision
      ? { message: { content: responseOutput, thinking: thinkingOutput } }
      : { response: responseOutput, thinking: thinkingOutput }),
  };
}

function waitForAbort(signal: AbortSignal) {
  let onAbort: (() => void) | undefined;
  const promise = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });

  return {
    promise,
    cleanup: () => {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    },
  };
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
      () => controller.abort(new Error(`Ollama stream was inactive for ${timeoutMs}ms.`)),
      timeoutMs,
    );
  };

  reset();
  return { controller, reset, clear };
}

function isCompleteJson(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    JSON.parse(value.trim());
    return true;
  } catch {
    return false;
  }
}
