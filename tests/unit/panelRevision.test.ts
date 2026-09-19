import { describe, expect, it } from "vitest";
import { choosePanelImage, pendingPanels, rememberPanelImage, replacePanelImage, restorePanelImage } from "@/lib/panelRevision";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
const panel = { ...createMockStoryboard(DEFAULT_INPUT).storyboard[0], imageUrl: "old", imageStatus: "complete" as const, imageSeed: 42 };
describe("controlled image revision", () => {
  it("keeps an alternative separate until selected and restores exact image metadata", () => {
    const candidate = { ...panel, imageUrl: "candidate", imageSeed: 73, imageRefinement: "Warmer light", imageGenerationPrompt: "new prompt" };
    const remembered = rememberPanelImage(panel, candidate);
    expect(remembered.imageUrl).toBe("old");
    expect(remembered.imageHistory).toEqual([candidate]);
    const chosen = choosePanelImage({ ...remembered, action: "Keep this shot edit" }, candidate);
    expect(chosen).toMatchObject({ imageUrl: "candidate", imageSeed: 73, imageRefinement: "Warmer light", action: "Keep this shot edit" });
    expect(chosen.imageHistory?.map(image => image.imageUrl)).toEqual(["old"]);
    const original = choosePanelImage(chosen, chosen.imageHistory![0]);
    expect(original).toMatchObject({ imageUrl: "old", imageSeed: 42, action: "Keep this shot edit" });
    expect(original.imageGenerationPrompt).toBeUndefined();
    expect(original.imageRefinement).toBeUndefined();
    expect(original.imageHistory?.[0]).toMatchObject({ imageUrl: "candidate", imageGenerationPrompt: "new prompt" });
  });

  it("does not select or archive changes on locked images", () => {
    const locked = { ...panel, imageApproved: true };
    const candidate = { ...panel, imageUrl: "candidate" };
    expect(choosePanelImage(locked, candidate)).toBe(locked);
    expect(rememberPanelImage(locked, candidate)).toBe(locked);
  });

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
