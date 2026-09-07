import { expect, it } from "vitest";
import { parseProject } from "@/lib/projects";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
it("round trips images, reference approvals and history, recovering interrupted renders", () => {
  const board = createMockStoryboard(DEFAULT_INPUT);
  board.visualReferences = [{ id: "ref", imageUrl: "data:image/png;base64,YQ==", purpose: "style", approved: true, version: 1 }];
  board.storyboard[0] = { ...board.storyboard[0], imageUrl: "data:image/png;base64,YQ==", imageStatus: "generating", imageSeed: 42, imageHistory: [{ ...board.storyboard[0], imageUrl: "data:image/png;base64,Yg==" }] };
  const project = parseProject(JSON.parse(JSON.stringify({ formatVersion: 1, id: "one", name: board.title, savedAt: new Date().toISOString(), input: DEFAULT_INPUT, storyboard: board })));
  expect(project.storyboard.storyboard[0]).toMatchObject({ imageStatus: "complete", imageSeed: 42, imageHistory: [{ imageUrl: "data:image/png;base64,Yg==" }] });
  expect(project.storyboard.visualReferences?.[0].approved).toBe(true);
});
it("rejects unknown project versions and malformed storyboard content", () => {
  expect(() => parseProject({ formatVersion: 2 })).toThrow();
  expect(() => parseProject({ formatVersion: 1, storyboard: {} })).toThrow();
});
