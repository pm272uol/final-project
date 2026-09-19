import { describe, expect, it } from "vitest";
import { sceneImageReferences, uploadedVisualReferences } from "@/lib/image-generation/sceneReferences";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";

describe("scene image references", () => {
  it("prioritizes uploads and preserves their selected purposes", () => {
    const uploads = uploadedVisualReferences([
      { id: "upload-1", imageUrl: "data:image/jpeg;base64,YQ==", purpose: "Mood" },
      { id: "upload-2", imageUrl: "data:image/jpeg;base64,Yg==", purpose: "Sketch" },
    ]);
    const board = createMockStoryboard(DEFAULT_INPUT);
    board.visualReferences = [{ id: "first", imageUrl: "first-image", purpose: "style", approved: true, version: 1 }];
    expect(sceneImageReferences(board, uploads)).toEqual(uploads);
    expect(uploads.map(reference => reference.purpose)).toEqual(["style", "composition"]);
    expect(uploads.every(reference => reference.approved && reference.source === "upload")).toBe(true);
  });

  it("uses the existing automatic reference or the first panel image after uploads are removed", () => {
    const board = createMockStoryboard(DEFAULT_INPUT);
    board.storyboard[0].imageUrl = "panel-one";
    board.visualReferences = uploadedVisualReferences([{ id: "upload", imageUrl: "upload-image", purpose: "Character" }]);
    expect(sceneImageReferences(board, [])[0]).toMatchObject({ imageUrl: "panel-one", source: "generated" });
    board.visualReferences = [{ id: "original-reference", imageUrl: "original-image", purpose: "style", approved: true, version: 1 }];
    expect(sceneImageReferences(board, [])[0].id).toBe("original-reference");
    expect(sceneImageReferences(createMockStoryboard(DEFAULT_INPUT), [])).toEqual([]);
  });
});
