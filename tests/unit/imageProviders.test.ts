import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { MockImageGenerationService } from "@/lib/image-generation/mockImageGeneration.service";
import { ReplicateImageGenerationService } from "@/lib/image-generation/replicateImageGeneration.service";
import { ImageProviderError } from "@/lib/image-generation/types";

describe("image generation providers", () => {
  it("returns a deterministic local image from the mock provider", async () => {
    const provider = new MockImageGenerationService();
    const first = await provider.generateImage("same prompt", {
      negativePrompt: "text",
    });
    const second = await provider.generateImage("same prompt");

    expect(first.provider).toBe("mock");
    expect(first.model).toContain("placeholder");
    expect(first.imageUrl).toBe(second.imageUrl);
    expect(first.imageUrl).toContain("/api/mock-panel-image");
    expect(first.width).toBe(1024);
    expect(first.height).toBe(576);
  });

  it("normalises a successful Replicate response", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          latest_version: {
            id: "a".repeat(64),
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "prediction-1",
          status: "succeeded",
          output: ["https://replicate.delivery/image.png"],
        }),
      );
    const provider = new ReplicateImageGenerationService({
      apiToken: "secret-token",
      model: "stability-ai/sdxl",
      timeoutMs: 1_000,
      fetchImplementation,
    });

    const result = await provider.generateImage("frame prompt", {
      negativePrompt: "text",
    });

    expect(result.imageUrl).toBe("https://replicate.delivery/image.png");
    expect(result.provider).toBe("replicate");
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.replicate.com/v1/predictions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
      }),
    );
    expect(
      JSON.parse(String(fetchImplementation.mock.calls[1][1]?.body)),
    ).toMatchObject({
      version: "a".repeat(64),
      input: {
        prompt: "frame prompt",
        width: 1024,
        height: 576,
      },
    });
  });

  it("maps Replicate authentication failures without exposing the token", async () => {
    const provider = new ReplicateImageGenerationService({
      apiToken: "secret-token",
      model: "stability-ai/sdxl",
      timeoutMs: 1_000,
      fetchImplementation: vi.fn().mockResolvedValue(
        new Response("unauthorised", { status: 401 }),
      ),
    });

    await expect(provider.generateImage("frame prompt")).rejects.toMatchObject({
      code: "IMAGE_PROVIDER_UNAUTHORISED",
    } satisfies Partial<ImageProviderError>);
    await expect(provider.generateImage("frame prompt")).rejects.not.toThrow(
      "secret-token",
    );
  });

  it("maps insufficient Replicate credit to a payment error", async () => {
    const provider = new ReplicateImageGenerationService({
      apiToken: "secret-token",
      model: "stability-ai/sdxl",
      timeoutMs: 1_000,
      fetchImplementation: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Insufficient credit",
            detail: "Purchase credit before trying again.",
          }),
          { status: 402 },
        ),
      ),
    });

    await expect(provider.generateImage("frame prompt")).rejects.toMatchObject({
      code: "IMAGE_PROVIDER_PAYMENT_REQUIRED",
      diagnostic: expect.stringContaining("Insufficient credit"),
    });
  });

  it("rejects empty Replicate output", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ latest_version: { id: "b".repeat(64) } }),
      )
      .mockResolvedValueOnce(
        Response.json({ id: "prediction-2", status: "succeeded", output: [] }),
      );
    const provider = new ReplicateImageGenerationService({
      apiToken: "token",
      model: "stability-ai/sdxl",
      timeoutMs: 1_000,
      fetchImplementation,
    });

    await expect(provider.generateImage("frame prompt")).rejects.toMatchObject({
      code: "IMAGE_PROVIDER_INVALID_RESPONSE",
    });
  });

  it("polls a running Replicate prediction until it succeeds", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ latest_version: { id: "c".repeat(64) } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "prediction-3",
          status: "processing",
          urls: {
            get: "https://api.replicate.com/v1/predictions/prediction-3",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "prediction-3",
          status: "succeeded",
          output: ["https://replicate.delivery/polled.png"],
        }),
      );
    const provider = new ReplicateImageGenerationService({
      apiToken: "token",
      model: "stability-ai/sdxl",
      timeoutMs: 5_000,
      fetchImplementation,
    });

    const result = await provider.generateImage("frame prompt");

    expect(result.imageUrl).toBe("https://replicate.delivery/polled.png");
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it("retains safe Replicate failure diagnostics", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ latest_version: { id: "d".repeat(64) } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "prediction-4",
          status: "failed",
          error: "Invalid width supplied",
          logs: "Model rejected its input",
        }),
      );
    const provider = new ReplicateImageGenerationService({
      apiToken: "token",
      model: "stability-ai/sdxl",
      timeoutMs: 1_000,
      fetchImplementation,
    });

    await expect(provider.generateImage("frame prompt")).rejects.toMatchObject({
      code: "IMAGE_PROVIDER_REQUEST_FAILED",
      diagnostic: expect.stringContaining("Invalid width supplied"),
    });
  });
});

it("maps rate limiting", async () => {
  const provider = new ReplicateImageGenerationService({ apiToken: "token", model: "a".repeat(64), timeoutMs: 100, fetchImplementation: vi.fn().mockResolvedValue(new Response("busy", { status: 429 })) });
  await expect(provider.generateImage("prompt")).rejects.toMatchObject({ code: "IMAGE_PROVIDER_RATE_LIMITED" });
});
it("times out an unresponsive provider", async () => {
  const provider = new ReplicateImageGenerationService({ apiToken: "token", model: "a".repeat(64), timeoutMs: 10, fetchImplementation: vi.fn((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch });
  await expect(provider.generateImage("prompt")).rejects.toMatchObject({ code: "IMAGE_PROVIDER_TIMEOUT" });
});
it("rejects malformed prediction status", async () => {
  const provider = new ReplicateImageGenerationService({ apiToken: "token", model: "a".repeat(64), timeoutMs: 100, fetchImplementation: vi.fn().mockResolvedValue(Response.json({ nonsense: true })) });
  await expect(provider.generateImage("prompt")).rejects.toMatchObject({ code: "IMAGE_PROVIDER_INVALID_RESPONSE" });
});
it("sends verified style-only conditioning fields without imposing reference composition", async () => {
  const fetchImplementation = vi.fn().mockResolvedValueOnce(Response.json({ latest_version: { id: "a".repeat(64) } })).mockResolvedValueOnce(Response.json({ status: "succeeded", output: ["https://replicate.delivery/image.png"] }));
  const provider = new ReplicateImageGenerationService({ apiToken: "token", model: "fofr/style-transfer", timeoutMs: 100, fetchImplementation });
  await provider.generateImage("new wide shot", { seed: 42, references: [{ id: "style", purpose: "style", imageUrl: "data:image/png;base64,YQ==", approved: true, version: 1 }] });
  const input = JSON.parse(fetchImplementation.mock.calls[1][1].body).input;
  expect(input).toMatchObject({ style_image: "data:image/png;base64,YQ==", model: "fast", number_of_images: 1, seed: 42 });
  expect(input).not.toHaveProperty("structure_image");
});
it("uses native separate references and bounded resolution for locally runnable Klein", async () => {
  const img = `data:image/png;base64,${(await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer()).toString("base64")}`;
  const fetchImplementation = vi.fn().mockResolvedValueOnce(Response.json({ latest_version: { id: "8".repeat(64) } })).mockResolvedValueOnce(Response.json({ status: "succeeded", output: ["https://replicate.delivery/image.png"] }));
  const provider = new ReplicateImageGenerationService({ apiToken: "token", model: "black-forest-labs/flux-2-klein-4b", timeoutMs: 100, fetchImplementation });
  const result = await provider.generateImage("close-up of an astronaut", { seed: 7, references: [
    { id: "style", purpose: "style", imageUrl: img, approved: true, version: 1 },
    { id: "actor", purpose: "character", entityId: "character-1", imageUrl: img, approved: true, version: 1 },
  ] });
  const input = JSON.parse(fetchImplementation.mock.calls[1][1].body).input;
  expect(input).toMatchObject({ output_megapixels: "0.5", aspect_ratio: "16:9", go_fast: true, seed: 7 });
  expect(input.images).toHaveLength(2);
  expect(input.images[0]).toMatch(/^data:image\/png;base64,/);
  expect(input.prompt).toContain("Image 2: preserve the character appearance");
  expect(result.prompt).toBe(input.prompt);
  expect(result.modelVersion).toBe("8".repeat(64));
  expect(input).not.toHaveProperty("negative_prompt");
});
