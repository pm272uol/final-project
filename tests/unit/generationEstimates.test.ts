import { expect, it } from "vitest";
import { estimateConfig, estimateGeneration } from "@/lib/generationEstimates";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
it("leaves estimates unknown without reliable inputs and requires a price basis", () => {
  const board = createMockStoryboard(DEFAULT_INPUT);
  const config = estimateConfig("replicate", "model", "0.02", undefined);
  expect(estimateGeneration(board, config, 4)).toMatchObject({ costUsd: null, expectedMs: null, samples: 0 });
  expect(estimateConfig("replicate", "model", "-1", "manual").usdPerImage).toBeNull();
  expect(estimateConfig("replicate", "model", "Infinity", "manual").usdPerImage).toBeNull();
});
it("deduplicates copied renders, excludes other models, and includes batch pacing", () => {
  const board = createMockStoryboard(DEFAULT_INPUT);
  Object.assign(board.storyboard[0], { imageUrl: "image", imageProvider: "replicate", imageModel: "model", imageGeneratedAt: "2026-09-11T10:00:00Z", imageGenerationDurationMs: 2000, imageSeed: 1 });
  board.storyboard[1] = { ...board.storyboard[0], panelNumber: 2 };
  board.storyboard[2] = { ...board.storyboard[0], panelNumber: 3, imageModel: "other", imageGenerationDurationMs: 99999 };
  const config = estimateConfig("replicate", "model", "0.02", "Current provider price");
  expect(estimateGeneration(board, config, 4)).toMatchObject({ samples: 1, costUsd: 0.08, expectedMs: 38000 });
  expect(estimateGeneration(board, config, 0)).toMatchObject({ costUsd: 0, expectedMs: 0 });
});
