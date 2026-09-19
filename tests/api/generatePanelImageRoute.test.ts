import { createVisualBible } from "@/lib/visualBible";
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
    expect(body.imagePrompt).toContain(validRequest().imageContext.visualBible.characters[0].appearance);
    expect(body.negativePrompt).toContain("watermark");
    expect(body.imageWidth).toBe(1024);
    expect(body.imageHeight).toBe(576);
  });

  it("rejects an unapproved or missing bible before invoking the provider", async () => {
    const service = vi.spyOn(providerFactory, "createImageGenerationService");
    const request = validRequest();
    request.imageContext.visualBible.approvedVersion = null;
    expect((await POST(jsonRequest(request))).status).toBe(400);
    expect((await POST(jsonRequest({ ...request, imageContext: { ...request.imageContext, visualBible: undefined } }))).status).toBe(400);
    expect(service).not.toHaveBeenCalled();
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

  it("forwards refinement instructions and the current image as the first reference", async () => {
    const generateImage = vi.fn(async (prompt: string) => ({
      imageUrl: "/api/mock-panel-image?seed=42", provider: "mock" as const, model: "mock",
      prompt, width: 1024, height: 576, generatedAt: new Date().toISOString(), durationMs: 1,
    }));
    vi.spyOn(providerFactory, "createImageGenerationService").mockReturnValue({ name: "mock", model: "mock", generateImage });
    const response = await POST(jsonRequest({ ...validRequest(), refinement: {
      instructions: "Make the paper boat red.", imageUrl: "/api/mock-panel-image?seed=7",
    } }));
    expect(response.status).toBe(200);
    expect(generateImage).toHaveBeenCalledWith(expect.stringContaining("Make the paper boat red."),
      expect.objectContaining({ references: [expect.objectContaining({ purpose: "composition", imageUrl: "/api/mock-panel-image?seed=7" })] }), expect.any(AbortSignal));
    expect((await response.json()).imagePrompt).toContain("requested change takes priority");
  });

  it.each([
    { instructions: " ", imageUrl: "/api/mock-panel-image?seed=7" },
    { instructions: "x".repeat(1001), imageUrl: "/api/mock-panel-image?seed=7" },
    { instructions: "Red boat", imageUrl: "https://example.com/private-image" },
  ])("rejects invalid refinement data before calling the provider", async refinement => {
    const factory = vi.spyOn(providerFactory, "createImageGenerationService");
    expect((await POST(jsonRequest({ ...validRequest(), refinement }))).status).toBe(400);
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([false, true])("passes all uploaded references through to the image provider (refinement: %s)", async refining => {
    const generateImage = vi.fn(async (prompt: string) => ({
      imageUrl: "/api/mock-panel-image?seed=42", provider: "mock" as const, model: "mock",
      prompt, width: 1024, height: 576, generatedAt: new Date().toISOString(), durationMs: 1,
    }));
    vi.spyOn(providerFactory, "createImageGenerationService").mockReturnValue({ name: "mock", model: "mock", generateImage });
    const references = Array.from({ length: 4 }, (_, index) => ({
      id: `upload-${index}`, source: "upload", purpose: "style", approved: true, version: 1,
      imageUrl: "data:image/jpeg;base64,YQ==",
    }));
    const response = await POST(jsonRequest({ ...validRequest(), references,
      refinement: refining ? { instructions: "Match the reference colours.", imageUrl: "/api/mock-panel-image?seed=7" } : undefined,
    }));
    expect(response.status).toBe(200);
    expect(generateImage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      references: refining ? [expect.objectContaining({ purpose: "composition", imageUrl: "/api/mock-panel-image?seed=7" }), ...references] : references,
    }), expect.any(AbortSignal));
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
      visualBible: { ...createVisualBible(storyboard, validInput), approvedVersion: 1 as number | null },
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

describe("shot prompt validation", () => {
  it("rejects unknown references and style exclusions before provider creation", async () => {
    const service = vi.spyOn(providerFactory, "createImageGenerationService");
    try {
      const request = validRequest();
      expect((await POST(jsonRequest({ ...request, panel: { ...request.panel, characterIds: ["unknown"] } }))).status).toBe(400);
      expect((await POST(jsonRequest({ ...request, panel: { ...request.panel, shotNegativePrompts: ["watercolour"] } }))).status).toBe(400);
      expect((await POST(jsonRequest({ ...request, panel: { ...request.panel, shotType: "close-up", cameraDirection: "wide shot" } }))).status).toBe(400);
      expect(service).not.toHaveBeenCalled();
    } finally {
      service.mockRestore();
    }
  });
});
