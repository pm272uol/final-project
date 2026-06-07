import { describe, expect, it } from "vitest";
import {
  EVALUATION_PASS_THRESHOLD,
  evaluateStoryboard,
} from "@/lib/evaluator";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { validInput } from "../fixtures";

describe("evaluateStoryboard", () => {
  it("passes a complete storyboard package", () => {
    const result = evaluateStoryboard(
      createMockStoryboard(validInput),
      validInput.panelCount,
    );

    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("reports missing and incomplete production fields", () => {
    const storyboard = createMockStoryboard(validInput);
    storyboard.title = "";
    storyboard.characters = [];
    storyboard.storyboard[0].imagePrompt = "Too short";
    storyboard.productionNotes = [];

    const result = evaluateStoryboard(storyboard, validInput.panelCount);

    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(85);
    expect(failedIds(result)).toEqual(
      expect.arrayContaining(["title", "characters", "prompts", "production"]),
    );
  });

  it("detects a panel count mismatch and incorrect ordering", () => {
    const storyboard = createMockStoryboard(validInput);
    storyboard.storyboard[1].panelNumber = 4;

    const result = evaluateStoryboard(storyboard, 6);

    expect(failedIds(result)).toEqual(
      expect.arrayContaining(["panel-count", "sequence"]),
    );
  });

  it("passes with twelve of fourteen checks and fails with eleven", () => {
    const passingStoryboard = createMockStoryboard(validInput);
    passingStoryboard.title = "";
    passingStoryboard.logline = "";

    const passingResult = evaluateStoryboard(
      passingStoryboard,
      validInput.panelCount,
    );

    expect(EVALUATION_PASS_THRESHOLD).toBe(85);
    expect(passingResult.score).toBe(86);
    expect(passingResult.passed).toBe(true);

    passingStoryboard.characters = [];
    const failingResult = evaluateStoryboard(
      passingStoryboard,
      validInput.panelCount,
    );

    expect(failingResult.score).toBe(79);
    expect(failingResult.passed).toBe(false);
  });
});

function failedIds(result: ReturnType<typeof evaluateStoryboard>) {
  return result.checks.filter((check) => !check.passed).map((check) => check.id);
}
