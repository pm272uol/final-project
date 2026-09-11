import { expect, it } from "vitest";
import { recoverWorkspace } from "@/lib/workspace";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
import { createMockStoryboard } from "@/lib/mockStoryboard";

it("recovers incomplete input and interrupted image generation without a busy state", () => {
  const storyboard = createMockStoryboard(DEFAULT_INPUT);
  storyboard.storyboard[0].imageStatus = "generating";
  storyboard.storyboard[1].imageStatus = "generating";
  storyboard.storyboard[1].imageUrl = "/api/mock-panel-image?seed=1";
  const recovered = recoverWorkspace({ input: { ...DEFAULT_INPUT, sceneIdea: "" }, projectInput: DEFAULT_INPUT, storyboard, metadata: null, projectId: "project-1", visualSummary: "reviewed summary", references: [{ id: "ref", purpose: "Mood", blob: new Blob(["test"]) }] });
  expect(recovered.input.sceneIdea).toBe("");
  expect(recovered.storyboard?.storyboard[0].imageStatus).toBe("not_started");
  expect(recovered.storyboard?.storyboard[1].imageStatus).toBe("complete");
  expect(recovered.references[0].blob.size).toBe(4);
});
