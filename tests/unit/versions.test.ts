import { expect, it } from "vitest";
import { captureVersion } from "@/lib/versions";
import { parseProject } from "@/lib/projects";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
import { createMockStoryboard } from "@/lib/mockStoryboard";
it("preserves independent snapshots with original inputs across a portable project round trip", () => {
  const board = createMockStoryboard(DEFAULT_INPUT);
  board.storyboard[0].durationSeconds = 4;
  const version = captureVersion({ ...DEFAULT_INPUT, visualReferenceSummary: "Blue light" }, board, null, "Reference condition", "Text and sketch");
  board.storyboard[0].action = "Changed action";
  expect(version.storyboard.storyboard[0].action).not.toBe("Changed action");
  const project = parseProject(JSON.parse(JSON.stringify({ formatVersion: 1, id: "one", name: "Test", savedAt: new Date().toISOString(), input: DEFAULT_INPUT, storyboard: board, versions: [version] })));
  expect(project.versions?.[0].input.visualReferenceSummary).toBe("Blue light");
  expect(project.versions?.[0].storyboard.storyboard[0].durationSeconds).toBe(4);
});
it("normalizes interrupted snapshot renders and rejects ambiguous shot numbering on import", () => {
  const board = createMockStoryboard(DEFAULT_INPUT);
  const version = captureVersion(DEFAULT_INPUT, board, null, "Interrupted", "Text");
  version.storyboard.storyboard[0].imageStatus = "generating";
  const project = { formatVersion: 1, id: "one", name: "Test", savedAt: new Date().toISOString(), input: DEFAULT_INPUT, storyboard: board, versions: [version] };
  expect(parseProject(project).versions?.[0].storyboard.storyboard[0].imageStatus).toBe("not_started");
  board.storyboard[1].panelNumber = 1;
  expect(() => parseProject(project)).toThrow("Invalid saved storyboard");
});
