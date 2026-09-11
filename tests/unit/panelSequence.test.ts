import { expect, it } from "vitest";
import { sequencePanels } from "@/lib/panelSequence";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
import { validateStoryboardPackage } from "@/lib/storyboardSchema";
it("moves locked images with their shots and renumbers without losing history", () => {
  const board = createMockStoryboard(DEFAULT_INPUT);
  board.storyboard[0] = { ...board.storyboard[0], imageUrl: "test", imageApproved: true, imageHistory: [{ ...board.storyboard[0] }] };
  const moved = sequencePanels(board, 0, "down");
  expect(moved.storyboard[1]).toMatchObject({ panelNumber: 2, imageUrl: "test", imageApproved: true, imageHistory: board.storyboard[0].imageHistory });
  expect(validateStoryboardPackage(moved, 6).success).toBe(true);
  expect(board.storyboard[0].panelNumber).toBe(1);
});
it("duplicates independently, inserts clean shots, and prevents deleting the last panel", () => {
  const board = createMockStoryboard(DEFAULT_INPUT);
  const copied = sequencePanels(board, 0, "duplicate");
  expect(copied.storyboard).toHaveLength(7);
  expect(copied.storyboard[0].panelId).not.toBe(copied.storyboard[1].panelId);
  const inserted = sequencePanels(copied, 0, "insert");
  expect(inserted.storyboard[1].imageUrl).toBeUndefined();
  expect(validateStoryboardPackage(inserted, 8).success).toBe(true);
  const single = { ...board, storyboard: [board.storyboard[0]] };
  expect(sequencePanels(single, 0, "delete")).toBe(single);
  board.storyboard[0].imageStatus = "generating";
  expect(sequencePanels(board, 0, "down")).toBe(board);
});
