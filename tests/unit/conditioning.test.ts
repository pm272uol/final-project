import { describe, expect, it } from "vitest";
import { relevantReferences } from "@/lib/image-generation/references";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
import { createVisualBible } from "@/lib/visualBible";

describe("reference selection", () => {
  it("includes approved style and visible entities but excludes hidden and unapproved references", () => {
    const board = createMockStoryboard(DEFAULT_INPUT);
    board.visualBible = createVisualBible(board, DEFAULT_INPUT);
    board.visualReferences = [
      { id: "style", purpose: "style", approved: true, imageUrl: "data:image/png;base64,YQ==", version: 1 },
      { id: "visible", purpose: "character", entityId: "character-1", approved: true, imageUrl: "data:image/png;base64,YQ==", version: 1 },
      { id: "hidden", purpose: "character", entityId: "other", approved: true, imageUrl: "data:image/png;base64,YQ==", version: 1 },
      { id: "draft", purpose: "style", approved: false, imageUrl: "data:image/png;base64,YQ==", version: 1 },
    ];
    expect(relevantReferences(board, { ...board.storyboard[0], characterIds: ["character-1"] }).map(r => r.id)).toEqual(["style", "visible"]);
    expect(relevantReferences(board, { ...board.storyboard[0], characterIds: [] }).map(r => r.id)).toEqual(["style"]);
  });
});
