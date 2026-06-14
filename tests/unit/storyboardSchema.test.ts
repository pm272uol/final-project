import { describe, expect, it } from "vitest";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { buildStoryboardPrompt } from "@/lib/promptBuilder";
import {
  isStoryboardInput,
  validateStoryboardInput,
  validateStoryboardPackage,
} from "@/lib/storyboardSchema";
import { validInput } from "../fixtures";

describe("isStoryboardInput", () => {
  it("accepts the complete supported input contract", () => {
    expect(isStoryboardInput(validInput)).toBe(true);
  });

  it("rejects blank ideas and unsupported constraints", () => {
    expect(isStoryboardInput({ ...validInput, sceneIdea: "   " })).toBe(false);
    expect(isStoryboardInput({ ...validInput, panelCount: 5 })).toBe(false);
    expect(isStoryboardInput({ ...validInput, genre: "Western" })).toBe(false);
    expect(isStoryboardInput(null)).toBe(false);
  });

  it("returns field-level input validation issues", () => {
    const result = validateStoryboardInput({
      ...validInput,
      sceneIdea: "",
      genre: "Western",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining("sceneIdea"),
          expect.stringContaining("genre"),
        ]),
      );
    }
  });
});

describe("buildStoryboardPrompt", () => {
  it("includes every creative constraint and the exact panel requirement", () => {
    const prompt = buildStoryboardPrompt(validInput);

    expect(prompt).toContain(validInput.sceneIdea);
    expect(prompt).toContain(`Genre: ${validInput.genre}`);
    expect(prompt).toContain(`Visual style: ${validInput.visualStyle}`);
    expect(prompt).toContain(`Tone: ${validInput.tone}`);
    expect(prompt).toContain(`Estimated duration: ${validInput.duration}`);
    expect(prompt).toContain(`Create exactly ${validInput.panelCount} storyboard panels`);
    expect(prompt).toContain(
      "role must be exactly one of: protagonist, supporting, antagonist, background",
    );
    expect(prompt).toContain(
      "shotType must be exactly one of: establishing shot, wide shot",
    );
    expect(prompt).toContain(
      "continuityNotes and productionNotes must each be arrays of plain strings",
    );
    expect(prompt).toContain("Return valid JSON only");
  });

  it("uses a combined visual summary without referring to uploads", () => {
    const prompt = buildStoryboardPrompt({
      ...validInput,
      visualReferenceSummary:
        "Low-key amber light, industrial interiors, and asymmetrical framing.",
    });

    expect(prompt).toContain(
      "Combined visual direction: Low-key amber light, industrial interiors, and asymmetrical framing.",
    );
    expect(prompt).toContain(
      "without mentioning reference images, uploads, filenames, or source material",
    );
  });
});

describe("validateStoryboardPackage", () => {
  it("accepts a complete package with the requested panel sequence", () => {
    const result = validateStoryboardPackage(
      createMockStoryboard(validInput),
      validInput.panelCount,
    );

    expect(result.success).toBe(true);
  });

  it("accepts image metadata added after storyboard generation", () => {
    const storyboard = createMockStoryboard(validInput);
    storyboard.storyboard[0] = {
      ...storyboard.storyboard[0],
      imageStatus: "complete",
      imageUrl: "/api/mock-panel-image?seed=1",
      imageGenerationPrompt: "Exact enriched provider prompt.",
      imageGenerationNegativePrompt: "text, watermark",
      imageProvider: "mock",
      imageModel: "deterministic-storyboard-placeholder-v1",
      imageSeed: 1,
      imageWidth: 1024,
      imageHeight: 576,
      imageGeneratedAt: "2026-06-14T12:00:00.000Z",
      imageGenerationDurationMs: 5,
    };

    expect(
      validateStoryboardPackage(storyboard, validInput.panelCount).success,
    ).toBe(true);
  });

  it("reports nested output fields that violate the schema", () => {
    const storyboard = createMockStoryboard(validInput);
    storyboard.characters[0].visualDescription = "";
    storyboard.storyboard[1].shotType =
      "impossible shot" as typeof storyboard.storyboard[number]["shotType"];

    const result = validateStoryboardPackage(
      storyboard,
      validInput.panelCount,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining("characters.0.visualDescription"),
          expect.stringContaining("storyboard.1.shotType"),
        ]),
      );
    }
  });

  it("rejects the wrong panel count and non-sequential numbering", () => {
    const storyboard = createMockStoryboard(validInput);
    storyboard.storyboard.pop();
    storyboard.storyboard[1].panelNumber = 5;

    const result = validateStoryboardPackage(
      storyboard,
      validInput.panelCount,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Expected exactly 4 panels"),
          expect.stringContaining("storyboard.1.panelNumber"),
        ]),
      );
    }
  });

  it("rejects extra fields that are outside the output contract", () => {
    const storyboard = {
      ...createMockStoryboard(validInput),
      modelCommentary: "This field must not reach the client.",
    };

    const result = validateStoryboardPackage(
      storyboard,
      validInput.panelCount,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.stringContaining("Unrecognized key")]),
      );
    }
  });
});
