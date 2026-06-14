import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@/lib/config";
import { analyzeReferenceImages } from "@/lib/referenceImages";

describe("analyzeReferenceImages", () => {
  it("sends sanitized image bytes and purpose guidance to local Ollama", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      Response.json({
        message: {
          role: "assistant",
          content:
            "Low-key amber lighting, asymmetrical framing, and tactile industrial surfaces.",
        },
      }),
    );

    const summary = await analyzeReferenceImages(
      [
        { bytes: new Uint8Array([1, 2, 3]), purpose: "Mood" },
        { bytes: new Uint8Array([4, 5, 6]), purpose: "Sketch" },
      ],
      "Use the lighting, not the wardrobe.",
      testConfig(),
      { fetchImplementation: fetchMock as unknown as typeof fetch },
    );
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request?.body));

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
    expect(body.model).toBe("gemma4:latest");
    expect(body.stream).toBe(false);
    expect(body.messages[0].images).toEqual(["AQID", "BAUG"]);
    expect(body.messages[0].content).toContain("Image 1: Mood");
    expect(body.messages[0].content).toContain("Image 2: Sketch");
    expect(body.messages[0].content).toContain(
      "Use the lighting, not the wardrobe.",
    );
    expect(body.messages[0].content).toContain(
      "Do not mention images, uploads, filenames, numbering, labels, or source material.",
    );
    expect(summary).toContain("Low-key amber lighting");
  });

  it("returns a deterministic summary in mock mode", async () => {
    const summary = await analyzeReferenceImages(
      [{ bytes: new Uint8Array([1]), purpose: "Composition" }],
      "",
      testConfig({ provider: "mock" }),
    );

    expect(summary).toContain("composition guidance");
  });
});

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    provider: "ollama",
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
