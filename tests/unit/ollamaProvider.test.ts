import { describe, expect, it, vi } from "vitest";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import {
  OllamaStoryboardProvider,
  parseModelJson,
} from "@/lib/providers/ollamaProvider";
import { StoryboardProviderError } from "@/lib/providers/types";
import { validInput } from "../fixtures";

describe("OllamaStoryboardProvider", () => {
  it("sends a structured non-streaming generation request", async () => {
    const storyboard = createMockStoryboard(validInput);
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      Response.json({
        model: "gemma4:latest",
        response: JSON.stringify(storyboard),
        done: true,
        total_duration: 12_000_000,
        prompt_eval_count: 100,
        eval_count: 200,
      }),
    );
    const fetchImplementation = fetchMock as unknown as typeof fetch;
    const provider = new OllamaStoryboardProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:latest",
      timeoutMs: 1_000,
      fetchImplementation,
    });

    const result = await provider.generate(validInput);
    const [, request] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(String(request?.body));

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/generate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(requestBody.model).toBe("gemma4:latest");
    expect(requestBody.stream).toBe(false);
    expect(requestBody.prompt).toContain(validInput.sceneIdea);
    expect(requestBody.format).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["title", "storyboard"]),
    });
    expect(result.storyboard.title).toBe(storyboard.title);
    expect(result.metadata).toMatchObject({
      mode: "ollama",
      provider: "ollama",
      model: "gemma4:latest",
      durationMs: 12,
      promptTokens: 100,
      completionTokens: 200,
    });
  });

  it("maps missing model responses to a model-not-found provider error", async () => {
    const provider = new OllamaStoryboardProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:latest",
      timeoutMs: 1_000,
      fetchImplementation: async () =>
        Response.json(
          { error: "model 'gemma4:latest' not found" },
          { status: 404 },
        ),
    });

    await expect(provider.generate(validInput)).rejects.toMatchObject({
      code: "MODEL_NOT_FOUND",
    });
  });

  it("rejects model JSON that fails the storyboard schema", async () => {
    const storyboard = createMockStoryboard(validInput);
    storyboard.storyboard.pop();
    const provider = new OllamaStoryboardProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:latest",
      timeoutMs: 1_000,
      fetchImplementation: async () =>
        Response.json({
          model: "gemma4:latest",
          response: JSON.stringify(storyboard),
          done: true,
        }),
    });

    await expect(provider.generate(validInput)).rejects.toMatchObject({
      code: "INVALID_MODEL_RESPONSE",
    });
  });

  it("turns timeout aborts into provider timeout errors", async () => {
    const provider = new OllamaStoryboardProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:latest",
      timeoutMs: 1,
      fetchImplementation: () => new Promise(() => {}),
    });

    await expect(provider.generate(validInput)).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
    });
  });

  it("turns caller cancellation into provider aborted errors", async () => {
    const controller = new AbortController();
    const provider = new OllamaStoryboardProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:latest",
      timeoutMs: 1_000,
      fetchImplementation: () => new Promise(() => {}),
    });

    const generation = provider.generate(validInput, {
      signal: controller.signal,
    });
    controller.abort();

    await expect(generation).rejects.toMatchObject({
      code: "PROVIDER_ABORTED",
    });
  });
});

describe("parseModelJson", () => {
  it("parses plain JSON and fenced JSON", () => {
    expect(parseModelJson('{"title":"x"}')).toEqual({ title: "x" });
    expect(parseModelJson('```json\n{"title":"x"}\n```')).toEqual({
      title: "x",
    });
  });

  it("throws a provider error for invalid JSON", () => {
    expect(() => parseModelJson("not json")).toThrow(StoryboardProviderError);
  });
});
