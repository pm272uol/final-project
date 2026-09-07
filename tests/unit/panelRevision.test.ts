import { describe, expect, it } from "vitest";
import { pendingPanels, replacePanelImage, restorePanelImage } from "@/lib/panelRevision";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
const panel = { ...createMockStoryboard(DEFAULT_INPUT).storyboard[0], imageUrl: "old", imageStatus: "complete" as const, imageSeed: 42 };
describe("controlled image revision", () => {
  it("skips completed and locked images in ordinary batches", () => {
    expect(pendingPanels([panel, { ...panel, imageUrl: undefined, imageApproved: true }], "missing")).toEqual([]);
    expect(pendingPanels([{ ...panel, imageStatus: "failed" }], "failed")).toHaveLength(1);
  });
  it("cannot replace a locked image even with explicit selection", () => {
    const locked = { ...panel, imageApproved: true, imageSelected: true };
    expect(replacePanelImage(locked, { imageUrl: "new" })).toBe(locked);
    expect(pendingPanels([locked], "selected")).toEqual([]);
  });
  it("keeps successful alternatives and restores metadata without discarding current shot edits", () => {
    const replacement = replacePanelImage(panel, { imageUrl: "new", imageSeed: 43 });
    expect(replacement.imageHistory?.[0].imageUrl).toBe("old");
    const restored = restorePanelImage({ ...replacement, action: "Revised action" }, 0);
    expect(restored).toMatchObject({ imageUrl: "old", imageSeed: 42, action: "Revised action", imageNeedsReview: true });
    expect(restored.imageHistory?.[0].imageUrl).toBe("new");
  });
});
