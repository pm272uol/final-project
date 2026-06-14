import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate-panel-image/route";
import { ImageProviderError } from "@/lib/image-generation/types";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import * as providerFactory from "@/lib/image-generation/providerFactory";
import { validInput } from "../fixtures";

describe("POST /api/generate-panel-image", () => {
  beforeEach(() => {
    vi.stubEnv("IMAGE_PROVIDER", "mock");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns a complete mock image result with exact provider prompts", async () => {
    const response = await POST(jsonRequest(validRequest()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.panelNumber).toBe(1);
    expect(body.imageStatus).toBe("complete");
    expect(body.imageProvider).toBe("mock");
    expect(body.imageUrl).toContain("/api/mock-panel-image");
    expect(body.imagePrompt).toContain("Character continuity");
    expect(body.negativePrompt).toContain("watermark");
    expect(body.imageWidth).toBe(1024);
    expect(body.imageHeight).toBe(576);
  });

  it("rejects invalid panel input", async () => {
    const request = validRequest();
    request.panel.imagePrompt = "";
    const response = await POST(jsonRequest(request));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_PANEL_IMAGE_REQUEST");
    expect(body.validationIssues).toEqual(
      expect.arrayContaining([expect.stringContaining("panel.imagePrompt")]),
    );
  });

  it("returns a friendly malformed JSON error", async () => {
    const response = await POST(
      new Request("http://localhost/api/generate-panel-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"panel":',
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_IMAGE_REQUEST_JSON",
    });
  });

  it("does not expose a missing Replicate token", async () => {
    vi.stubEnv("IMAGE_PROVIDER", "replicate");
    vi.stubEnv("REPLICATE_API_TOKEN", "");
    const response = await POST(jsonRequest(validRequest()));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("The image provider is not configured correctly.");
    expect(JSON.stringify(body)).not.toContain("REPLICATE_API_TOKEN");
  });

  it("returns an actionable message when Replicate credit is exhausted", async () => {
    vi.spyOn(providerFactory, "createImageGenerationService").mockReturnValue({
      name: "replicate",
      model: "stability-ai/sdxl",
      async generateImage() {
        throw new ImageProviderError(
          "IMAGE_PROVIDER_PAYMENT_REQUIRED",
          "Replicate requires billing credit.",
          undefined,
          "HTTP 402: Insufficient credit",
        );
      },
    });

    const response = await POST(jsonRequest(validRequest()));
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("insufficient credit");
    expect(body.error).not.toContain("HTTP 402");
  });
});

function validRequest() {
  const storyboard = createMockStoryboard(validInput);
  return {
    panel: storyboard.storyboard[0],
    imageContext: {
      visualStyle: storyboard.visualStyle,
      characterContinuity: storyboard.characters
        .map((character) => character.visualDescription)
        .join(" "),
      locationContinuity: storyboard.locations
        .map((location) => location.description)
        .join(" "),
      continuityNotes: storyboard.continuityNotes,
    },
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/generate-panel-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
