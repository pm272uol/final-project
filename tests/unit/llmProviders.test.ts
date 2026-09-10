import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { getLLMConfig } from "@/lib/llm/config";
import { getAppConfig } from "@/lib/config";
import { createLLMProvider } from "@/lib/llm/create-provider";
import { OllamaProvider } from "@/lib/llm/providers/ollama-provider";
import { VercelAIGatewayProvider } from "@/lib/llm/providers/vercel-ai-gateway-provider";
import { estimateCost } from "@/lib/llm/pricing";
import { createStoryboardProvider } from "@/lib/providers/providerFactory";
import { LLMStoryboardProvider } from "@/lib/providers/llmStoryboardProvider";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { validInput } from "../fixtures";
const request = {
  operation: "evaluation",
  messages: [{ role: "user" as const, content: "secret prompt" }],
};
const schema = z.object({ status: z.literal("ok") });
function make(
  provider: "ollama" | "vercel",
  fetchImplementation: typeof fetch,
  timeoutMs = 1000,
) {
  const llm = createLLMProvider(
    {
      provider,
      model: "test-model",
      apiKey: "secret-key",
      baseUrl: "http://localhost:1234",
      timeoutMs,
    },
    fetchImplementation,
  );
  llm.metricsSink = vi.fn();
  return llm;
}
function body(provider: string, text: string) {
  return provider === "ollama"
    ? {
        model: "test-model",
        response: text,
        done: true,
        prompt_eval_count: 5,
        eval_count: 7,
      }
    : {
        model: "test-model",
        choices: [{ message: { content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
      };
}
describe("LLM configuration", () => {
  it("selects both backends and validates credentials", () => {
    expect(createLLMProvider(getLLMConfig({}))).toBeInstanceOf(OllamaProvider);
    expect(getLLMConfig({}).model).toBe("gemma4:e4b");
    expect(() => getLLMConfig({ LLM_PROVIDER: "vercel" })).toThrow();
    expect(() => getLLMConfig({ LLM_PROVIDER: "bad" })).toThrow();
    expect(() => getLLMConfig({ LLM_TIMEOUT_MS: "0" })).toThrow();
    const config = getLLMConfig({
      LLM_PROVIDER: "vercel",
      AI_GATEWAY_API_KEY: "test",
    });
    expect(createLLMProvider(config)).toBeInstanceOf(VercelAIGatewayProvider);
    expect(config.model).toBe("google/gemma-4-26b-a4b-it");
    const app = getAppConfig({
      LLM_PROVIDER: "vercel",
      AI_GATEWAY_API_KEY: "test",
      STORYBOARD_MOCK_FALLBACK: "true",
    });
    expect(app.mockFallback).toBe(false);
    expect(createStoryboardProvider(app).name).toBe("vercel");
  });
  it("leaves cost unknown without both counts and configured prices", () => {
    expect(estimateCost({ inputTokens: 5 })).toBeUndefined();
    expect(
      estimateCost(
        { inputTokens: 5 },
        { inputPerMillion: 1, outputPerMillion: 2 },
      ),
    ).toBeUndefined();
    expect(
      estimateCost(
        { inputTokens: 1_000_000, outputTokens: 500_000 },
        { inputPerMillion: 1, outputPerMillion: 2 },
      ),
    ).toBe(2);
  });
});
for (const provider of ["ollama", "vercel"] as const) {
  describe(provider, () => {
    it("normalizes structured output, usage, and prompt-free metrics", async () => {
      const llm = make(provider, async () =>
        Response.json(body(provider, '```json\n{"status":"ok"}\n```')),
      );
      const result = await llm.generateStructured({ ...request, schema });
      expect(result).toMatchObject({
        provider,
        model: "test-model",
        data: { status: "ok" },
        usage: { inputTokens: 5, outputTokens: 7 },
      });
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(llm.metricsSink).toHaveBeenCalledTimes(1);
      expect(llm.metricsSink).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "evaluation",
          success: true,
          timestamp: expect.any(String),
        }),
      );
      expect(
        JSON.stringify(vi.mocked(llm.metricsSink).mock.calls),
      ).not.toContain("secret");
    });
    it("uses the existing storyboard schema and prompt", async () => {
      const mock = createMockStoryboard(validInput);
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json(body(provider, JSON.stringify(mock))),
      );
      const result = await new LLMStoryboardProvider(
        make(provider, transport),
      ).generate(validInput);
      expect(result.storyboard.title).toBe(mock.title);
      expect(
        JSON.parse(String(transport.mock.calls[0][1]?.body)),
      ).toMatchObject(
        provider === "ollama"
          ? { prompt: expect.stringContaining(validInput.sceneIdea) }
          : {
              messages: [
                {
                  role: "user",
                  content: expect.stringContaining(validInput.sceneIdea),
                },
              ],
              response_format: { type: "json_schema" },
            },
      );
    });
    it.each(["", "not json", '{"status":"wrong"}'])(
      "rejects invalid structured output %s and records failure",
      async (text) => {
        const llm = make(provider, async () =>
          Response.json(body(provider, text)),
        );
        await expect(
          llm.generateStructured({ ...request, schema }),
        ).rejects.toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
        expect(llm.metricsSink).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: "INVALID_MODEL_RESPONSE",
          }),
        );
      },
    );
    it.each([
      [401, "PROVIDER_AUTHENTICATION"],
      [429, "PROVIDER_RATE_LIMIT"],
      [500, "PROVIDER_REQUEST_FAILED"],
    ])(
      "maps HTTP %s without exposing provider bodies",
      async (status, code) => {
        const llm = make(provider, async () =>
          Response.json(
            { error: "secret provider details" },
            { status: Number(status) },
          ),
        );
        await expect(llm.generate(request)).rejects.toMatchObject({ code });
        expect(
          JSON.stringify(vi.mocked(llm.metricsSink).mock.calls),
        ).not.toContain("secret");
      },
    );
    it("maps network errors", async () => {
      await expect(
        make(provider, async () => {
          throw new TypeError("secret");
        }).generate(request),
      ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    });
    it("maps malformed envelopes", async () => {
      await expect(
        make(provider, async () => new Response("invalid")).generate(request),
      ).rejects.toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    });
    it("times out even when fetch ignores abort", async () => {
      await expect(
        make(provider, () => new Promise(() => {}), 5).generate(request),
      ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
    });
    it("supports cancellation", async () => {
      const controller = new AbortController();
      const result = make(provider, () => new Promise(() => {})).generate({
        ...request,
        signal: controller.signal,
      });
      controller.abort();
      await expect(result).rejects.toMatchObject({ code: "PROVIDER_ABORTED" });
    });
  });
}

describe("transport edge cases", () => {
  it("preserves multimodal messages at the gateway boundary", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(body("vercel", "Visual summary")),
    );
    const llm = make("vercel", transport);
    await llm.generate({
      ...request,
      messages: [{ role: "user", content: "Describe", images: ["iVBORabc"] }],
    });
    const sent = JSON.parse(String(transport.mock.calls[0][1]?.body));
    expect(sent.messages[0].content).toEqual([
      { type: "text", text: "Describe" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,iVBORabc" },
      },
    ]);
  });
  it("preserves system and conversation roles in Ollama chat", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ message: { content: "ok" }, done: true }),
    );
    const messages = [
      { role: "system" as const, content: "System instruction" },
      ...request.messages,
    ];
    await make("ollama", transport).generate({ ...request, messages });
    expect(transport.mock.calls[0][0]).toBe("http://localhost:1234/api/chat");
    expect(
      JSON.parse(String(transport.mock.calls[0][1]?.body)).messages,
    ).toEqual(messages);
  });
  it.each(["ollama", "vercel"] as const)(
    "times out a stalled %s response body",
    async (provider) => {
      const llm = make(
        provider,
        async () => new Response(new ReadableStream({ start() {} })),
        5,
      );
      await expect(llm.generate(request)).rejects.toMatchObject({
        code: "PROVIDER_TIMEOUT",
      });
    },
  );
  it("rejects gateway truncation and incomplete Ollama generation", async () => {
    await expect(
      make("vercel", async () =>
        Response.json({
          choices: [{ message: { content: "{}" }, finish_reason: "length" }],
        }),
      ).generate(request),
    ).rejects.toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    await expect(
      make("ollama", async () =>
        Response.json({ response: "{}", done: false }),
      ).generate(request),
    ).rejects.toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
  });
  it("records panel-count validation failure rather than success", async () => {
    const storyboard = createMockStoryboard(validInput);
    storyboard.storyboard.pop();
    const llm = make("vercel", async () =>
      Response.json(body("vercel", JSON.stringify(storyboard))),
    );
    await expect(
      new LLMStoryboardProvider(llm).generate(validInput),
    ).rejects.toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
    expect(llm.metricsSink).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, inputTokens: 10 }),
    );
  });
  it("does not let a metrics sink change a successful result", async () => {
    const llm = make("vercel", async () => Response.json(body("vercel", "ok")));
    llm.metricsSink = () => {
      throw new Error("Logging unavailable");
    };
    await expect(llm.generate(request)).resolves.toMatchObject({ text: "ok" });
  });
});

for (const provider of ["ollama", "vercel"] as const) {
  describe(`${provider} storyboard format correction`, () => {
    it("repairs the observed continuity key error, retains the event and accounts for both calls", async () => {
      const board = createMockStoryboard(validInput);
      const change = { characterId: "character-1", reason: "Emergence from egg", appearance: "A small wet dinosaur with green scales" };
      const invalid = structuredClone(board);
      invalid.storyboard[1].continuityChanges = [{ ...change, "clothing/accessories replacement": null } as typeof change];
      board.storyboard[1].continuityChanges = [change];
      const transport = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(body(provider, JSON.stringify(invalid))))
        .mockResolvedValueOnce(Response.json(body(provider, JSON.stringify(board))));
      const llm = make(provider, transport);
      const onProgress = vi.fn();
      const result = await new LLMStoryboardProvider(llm).generate(validInput, { onProgress });
      expect(result.storyboard.storyboard[1].continuityChanges).toEqual([change]);
      expect(transport).toHaveBeenCalledTimes(2);
      const repair = JSON.parse(String(transport.mock.calls[1][1]?.body));
      expect(repair.messages[1]).toEqual({ role: "assistant", content: JSON.stringify(invalid) });
      expect(repair.messages[2].content).toContain('Unrecognized key: "clothing/accessories replacement"');
      expect(repair.messages[2].content).toContain("JSON schema:");
      expect(result.metadata.promptTokens).toBe(10);
      expect(result.metadata.completionTokens).toBe(14);
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Correcting") }));
      expect(llm.metricsSink).toHaveBeenCalledTimes(1);
      expect(llm.metricsSink).toHaveBeenCalledWith(expect.objectContaining({ success: true, inputTokens: 10, outputTokens: 14 }));
    });
    it("stops after one failed correction and never accepts malformed continuity", async () => {
      const board = createMockStoryboard(validInput);
      board.storyboard[1].continuityChanges = ["hatches" as never];
      const transport = vi.fn<typeof fetch>(async () => Response.json(body(provider, JSON.stringify(board))));
      await expect(new LLMStoryboardProvider(make(provider, transport)).generate(validInput)).rejects.toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
      expect(transport).toHaveBeenCalledTimes(2);
    });
    it("does not retry authentication errors", async () => {
      const transport = vi.fn<typeof fetch>(async () => Response.json({}, { status: 401 }));
      await expect(new LLMStoryboardProvider(make(provider, transport)).generate(validInput)).rejects.toMatchObject({ code: "PROVIDER_AUTHENTICATION" });
      expect(transport).toHaveBeenCalledTimes(1);
    });
    it("does not begin a repair when cancelled during validation", async () => {
      const controller = new AbortController();
      const transport = vi.fn<typeof fetch>(async () => {
        controller.abort();
        return Response.json(body(provider, "{}"));
      });
      await expect(new LLMStoryboardProvider(make(provider, transport)).generate(validInput, { signal: controller.signal })).rejects.toBeInstanceOf(Error);
      expect(transport).toHaveBeenCalledTimes(1);
    });
  });
}
