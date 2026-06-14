import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate-storyboard/route";
import type { AppConfig } from "@/lib/config";
import { createGenerateStoryboardResponse } from "@/lib/generateStoryboard";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import {
  StoryboardProviderError,
  type StoryboardProvider,
} from "@/lib/providers/types";
import { validInput } from "../fixtures";

describe("POST /api/generate-storyboard", () => {
  beforeEach(() => {
    vi.stubEnv("STORYBOARD_PROVIDER", "mock");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a scene-aware mock storyboard for valid input", async () => {
    const response = await POST(jsonRequest(validInput));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("mock");
    expect(body.metadata.provider).toBe("mock");
    expect(body.metadata.fallbackUsed).toBe(false);
    expect(body.storyboard.title).toBe("The Frame Of Tomorrow");
    expect(body.storyboard.storyboard).toHaveLength(validInput.panelCount);
  });

  it("streams progress and the completed storyboard when requested", async () => {
    const response = await POST(
      new Request("http://localhost/api/generate-storyboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify(validInput),
      }),
    );
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(events[0]).toEqual({
      type: "status",
      message: "Preparing the storyboard prompt...",
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "status",
          message: "Building the deterministic storyboard...",
        }),
        expect.objectContaining({
          type: "complete",
          data: expect.objectContaining({
            mode: "mock",
            storyboard: expect.objectContaining({
              title: "The Frame Of Tomorrow",
            }),
          }),
        }),
      ]),
    );
  });

  it("returns a friendly validation error for invalid input", async () => {
    const response = await POST(jsonRequest({ ...validInput, panelCount: 5 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("valid creative constraints");
    expect(body.code).toBe("INVALID_STORYBOARD_INPUT");
    expect(body.validationIssues).toEqual(
      expect.arrayContaining([expect.stringContaining("panelCount")]),
    );
  });

  it("returns a friendly error when the request body is malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/generate-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"sceneIdea":',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("not valid JSON");
  });

  it("rejects generated output that fails the storyboard schema", async () => {
    const brokenStoryboard = createMockStoryboard(validInput);
    brokenStoryboard.storyboard[0].imagePrompt = "";
    brokenStoryboard.storyboard.pop();

    const response = await createGenerateStoryboardResponse(
      validInput,
      {
        provider: providerReturning(brokenStoryboard),
        config: testConfig({ mockFallback: false }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("STORYBOARD_SCHEMA_VALIDATION_FAILED");
    expect(body.error).toContain("required output schema");
    expect(body.validationIssues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("storyboard.0.imagePrompt"),
        expect.stringContaining("Expected exactly 4 panels"),
      ]),
    );
  });

  it("falls back to mock output when Ollama is unavailable and fallback is enabled", async () => {
    const response = await createGenerateStoryboardResponse(validInput, {
      provider: providerThrowing(
        new StoryboardProviderError(
          "PROVIDER_UNAVAILABLE",
          "Could not connect to Ollama.",
        ),
      ),
      config: testConfig({ mockFallback: true }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("mock");
    expect(body.metadata.fallbackUsed).toBe(true);
    expect(body.metadata.fallbackReason).toContain("Could not connect");
  });

  it("returns provider errors when fallback is disabled", async () => {
    const response = await createGenerateStoryboardResponse(validInput, {
      provider: providerThrowing(
        new StoryboardProviderError(
          "MODEL_NOT_FOUND",
          "Ollama model gemma4:latest is not installed.",
        ),
      ),
      config: testConfig({ mockFallback: false }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("MODEL_NOT_FOUND");
  });

  it("enforces the configured request size limit in the route", async () => {
    const response = await POST(
      new Request("http://localhost/api/generate-storyboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "20000",
        },
        body: JSON.stringify(validInput),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.code).toBe("REQUEST_TOO_LARGE");
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/generate-storyboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function providerReturning(
  storyboard: ReturnType<typeof createMockStoryboard>,
): StoryboardProvider {
  return {
    name: "ollama",
    model: "gemma4:latest",
    async generate() {
      return {
        storyboard,
        metadata: {
          mode: "ollama",
          provider: "ollama",
          model: "gemma4:latest",
          durationMs: 1,
        },
      };
    },
  };
}

function providerThrowing(error: Error): StoryboardProvider {
  return {
    name: "ollama",
    model: "gemma4:latest",
    async generate() {
      throw error;
    },
  };
}

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    provider: "ollama" as const,
    ollamaBaseUrl: "http://127.0.0.1:11434",
    ollamaModel: "gemma4:latest",
    ollamaTimeoutMs: 300_000,
    mockFallback: true,
    maxRequestBytes: 16_384,
    imageProvider: "mock",
    replicateModel: "stability-ai/sdxl",
    imageGenerationTimeoutMs: 120_000,
    imageMaxRequestBytes: 65_536,
    ...overrides,
  };
}
