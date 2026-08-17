import { describe, expect, it, vi } from "vitest";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { loadConfig } from "@/evaluation/core/config";
import { loadDataset } from "@/evaluation/core/dataset";
import { hashValue, stableJson } from "@/evaluation/core/files";
import { evaluateOutput, parseModelJson } from "@/evaluation/core/output";
import { evaluationConfigSchema, sceneSchema } from "@/evaluation/core/schemas";
import { listOllamaModels, runOllama } from "@/evaluation/runners/ollama";

describe("evaluation harness", () => {
  it("loads and validates the six Stage 1 scenes", async () => {
    const { config } = await loadConfig("evaluation/configs/stage1/llm.json");
    const { scenes } = await loadDataset(config);

    expect(scenes).toHaveLength(6);
    expect(scenes.map((scene) => scene.record.complexity)).toEqual([
      "simple",
      "simple",
      "medium",
      "medium",
      "complex",
      "complex",
    ]);
  });

  it("extracts JSON from a fenced model response", () => {
    expect(parseModelJson("```json\n{\"answer\":42}\n```"))
      .toEqual({ answer: 42 });
  });

  it("scores a structurally valid storyboard output", async () => {
    const { config } = await loadConfig("evaluation/configs/smoke/llm.json");
    const { scenes } = await loadDataset(config);
    const scene = scenes[0].record;
    const storyboard = createMockStoryboard(scene.storyboardInput);

    const result = evaluateOutput("llm", scene, JSON.stringify(storyboard));

    expect(result.metrics.jsonParsed).toBe(true);
    expect(result.metrics.schemaValid).toBe(true);
    expect(result.metrics.completeness).toBe(1);
    expect(result.metrics.panelCountCorrect).toBe(true);
    expect(result.metrics.sourceConstraintAccuracy).toBe(1);
    expect(result.metrics.requiredShotCoverage).toBe(1);
    expect(result.metrics.instructionAdherence).toBe(1);
    expect(result.metrics.deterministicEvaluationScore).toBeGreaterThanOrEqual(85);
  });

  it("preserves parse failures as metrics instead of throwing", async () => {
    const { config } = await loadConfig("evaluation/configs/smoke/llm.json");
    const { scenes } = await loadDataset(config);

    const result = evaluateOutput("llm", scenes[0].record, "not json");

    expect(result.parsedOutput).toBeNull();
    expect(result.metrics.jsonParsed).toBe(false);
    expect(result.metrics.schemaValid).toBe(false);
    expect(result.metrics.completeness).toBe(0);
  });

  it("rejects cached performance configurations", () => {
    const base = {
      version: 1,
      id: "invalid-performance",
      category: "llm",
      stage: "stage1",
      dataset: "dataset.json",
      provider: { type: "ollama", baseUrl: "http://127.0.0.1:11434" },
      models: [{ id: "model", displayName: "Model", model: "model:latest" }],
      settings: { runMode: "performance", useCache: true },
    };

    expect(evaluationConfigSchema.safeParse(base).success).toBe(false);
  });

  it("generates order-independent cache hashes", () => {
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
    expect(hashValue({ b: 2, a: 1 })).toBe(hashValue({ a: 1, b: 2 }));
  });

  it("rejects incomplete scene records", () => {
    expect(sceneSchema.safeParse({ version: 1, id: "SCENE-01" }).success).toBe(false);
  });

  it("reports an Ollama inventory timeout clearly", async () => {
    const timeout = Object.assign(
      new Error("The operation was aborted due to timeout"),
      { name: "TimeoutError" },
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));

    try {
      await expect(listOllamaModels("http://127.0.0.1:11434", 25))
        .rejects.toThrow("Ollama model inventory timed out after 25ms.");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends each model's configured thinking mode to Ollama", async () => {
    const { config } = await loadConfig("evaluation/configs/stage1/llm.json");
    const qwen = config.models.find((model) => model.id === "qwen3-06b");
    const gptOss = config.models.find((model) => model.id === "gpt-oss-20b");
    expect(qwen?.thinking).toBe(true);
    expect(gptOss?.thinking).toBe("medium");

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response([
        JSON.stringify({ model: "test", response: "{", thinking: "reason", done: false }),
        JSON.stringify({ model: "test", response: "}", thinking: "ing", done: true }),
      ].join("\n"))
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const qwenResult = await runOllama({ config, model: qwen!, prompt: "test" });
      await runOllama({ config, model: gptOss!, prompt: "test" });
      const requestBodies = fetchMock.mock.calls.map(([, request]) =>
        JSON.parse(String(request?.body)) as { think?: unknown; stream?: unknown }
      );
      expect(requestBodies[0]?.think).toBe(true);
      expect(requestBodies[1]?.think).toBe("medium");
      expect(requestBodies.every((body) => body.stream === true)).toBe(true);
      expect(qwenResult.rawThinking).toBe("reasoning");
      expect(qwenResult.outputChannel).toBe("response");

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({
          model: "test",
          response: "",
          thinking: "{}",
          done: true,
        })),
      );
      const fallbackResult = await runOllama({ config, model: qwen!, prompt: "test" });
      expect(fallbackResult.rawOutput).toBe("{}");
      expect(fallbackResult.outputChannel).toBe("thinking_json_fallback");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses timeoutMs as a resettable stream inactivity timeout", async () => {
    const loaded = await loadConfig("evaluation/configs/smoke/llm.json");
    const config = {
      ...loaded.config,
      settings: { ...loaded.config.settings, timeoutMs: 80 },
    };
    const model = config.models[0]!;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        setTimeout(() => controller.enqueue(encoder.encode(
          `${JSON.stringify({ model: "test", response: "{", done: false })}\n`,
        )), 30);
        setTimeout(() => controller.enqueue(encoder.encode(
          `${JSON.stringify({ model: "test", response: "", done: false })}\n`,
        )), 60);
        setTimeout(() => {
          controller.enqueue(encoder.encode(
            `${JSON.stringify({ model: "test", response: "}", done: true })}\n`,
          ));
          controller.close();
        }, 90);
      },
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(stream)));

    try {
      const result = await runOllama({ config, model, prompt: "test" });
      expect(result.rawOutput).toBe("{}");
      expect(result.wallTimeMs).toBeGreaterThan(80);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("aborts an Ollama stream after a full inactive interval", async () => {
    const loaded = await loadConfig("evaluation/configs/smoke/llm.json");
    const config = {
      ...loaded.config,
      settings: { ...loaded.config.settings, timeoutMs: 10 },
    };
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(stream)));

    try {
      await expect(runOllama({
        config,
        model: config.models[0]!,
        prompt: "test",
      })).rejects.toThrow("Ollama stream was inactive for 10ms.");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
