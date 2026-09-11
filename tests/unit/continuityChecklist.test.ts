import { expect, it } from "vitest";
import { continuityChecklist } from "@/lib/continuityChecklist";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
import { createVisualBible } from "@/lib/visualBible";
it("flags unknown entities, prop changes and missing persistent wardrobe overrides", () => {
  const board = createMockStoryboard(DEFAULT_INPUT); board.visualBible = createVisualBible(board, DEFAULT_INPUT);
  Object.assign(board.storyboard[0], { characterIds: ["character-1"], locationIds: ["location-1"], visibleProps: ["key"], continuityChanges: [{ characterId: "character-1", appearance: "Wet coat", reason: "Rain" }] });
  Object.assign(board.storyboard[1], { characterIds: ["character-1", "unknown"], locationIds: ["location-1"], visibleProps: [] });
  const issues = continuityChecklist(board).filter(i => i.panelNumber === 2 && i.flagged);
  expect(issues.map(i => i.category)).toEqual(expect.arrayContaining(["Cast", "Props", "Wardrobe"]));
  const first = issues[0]; board.continuityReview = { [first.id]: { checked: true, note: "Intentional" } };
  expect(continuityChecklist(board).find(i => i.id === first.id)).toBeDefined();
  board.storyboard[1].action = "The character leaves.";
  expect(continuityChecklist(board).find(i => i.id === first.id)).toBeUndefined();
});
