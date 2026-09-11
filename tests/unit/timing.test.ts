import { expect, it } from "vitest";
import { activeShotIndex, durationSeconds, sequenceTiming } from "@/lib/timing";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
import { createMockStoryboard } from "@/lib/mockStoryboard";
it("derives default timing, respects overrides and resolves exact boundaries", () => {
  const board = createMockStoryboard(DEFAULT_INPUT);
  expect(sequenceTiming(board, "60 seconds").total).toBe(60);
  board.storyboard[0].durationSeconds = 5;
  const timing = sequenceTiming(board, "60 seconds");
  expect(timing.total).toBe(55);
  expect(activeShotIndex(timing.shots.map(s => s.end), 5)).toBe(1);
  expect(activeShotIndex(timing.shots.map(s => s.end), 55)).toBe(5);
  expect(durationSeconds("2 minutes")).toBe(120);
  expect(durationSeconds("about a minute")).toBeNull();
});
