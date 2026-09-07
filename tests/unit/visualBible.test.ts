import { describe, expect, it } from "vitest";
import { createVisualBible, reviseVisualBible, visualBibleSchema } from "@/lib/visualBible";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { buildSdxlPrompt } from "@/lib/image-generation/promptBuilder";
import { validInput } from "../fixtures";

describe("visual bible", () => {
  it("preserves the chosen style and reference direction and assigns stable IDs", () => {
    const board = createMockStoryboard(validInput);
    const bible = createVisualBible(board, { ...validInput, visualReferenceSummary: "Blue ink on rough paper" });
    expect(visualBibleSchema.safeParse(bible).success).toBe(true);
    expect(bible.selectedStyle).toBe("Noir");
    expect(bible.referenceDirection).toBe("Blue ink on rough paper");
    expect(bible.approvedVersion).toBeNull();
    expect(bible.characters[0].id).toBe("character-1");
    expect(bible.characters[0].appearance).toBe(board.characters[0].visualDescription);
  });

  it("revokes approval and flags existing images without losing them on revision", () => {
    const board = createMockStoryboard(validInput);
    board.visualBible = { ...createVisualBible(board, validInput), approvedVersion: 1 };
    board.storyboard[0] = { ...board.storyboard[0], imageUrl: "/old.png", imageBibleVersion: 1, imageStatus: "complete" };
    const revised = reviseVisualBible(board, { ...board.visualBible, palette: "Red and gold" });
    expect(revised.visualBible).toMatchObject({ version: 2, approvedVersion: null, palette: "Red and gold" });
    expect(revised.storyboard[0]).toMatchObject({ imageUrl: "/old.png", imageBibleVersion: 1, imageNeedsReview: true });
    expect(revised.storyboard[1].imageNeedsReview).toBe(false);
    expect(revised.visualBible?.characters).toEqual(board.visualBible.characters);
  });

  it("includes shared approved rules in every panel prompt", () => {
    const board = createMockStoryboard(validInput);
    const bible = { ...createVisualBible(board, validInput), approvedVersion: 1, texture: "Rough paper grain" };
    for (const panel of board.storyboard) {
      const { prompt } = buildSdxlPrompt(panel, { visualBible: bible, visualStyle: "Noir", characterContinuity: "Projectionist" });
      expect(prompt).not.toContain("Approved visual bible");
      expect(prompt).toContain("Rough paper grain");
      expect(prompt).not.toContain("Cinematic storyboard concept art");
    }
  });
});
