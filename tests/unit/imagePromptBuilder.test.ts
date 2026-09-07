import { createVisualBible } from "@/lib/visualBible";
import { describe, expect, it } from "vitest";
import { buildSdxlPrompt } from "@/lib/image-generation/promptBuilder";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { validInput } from "../fixtures";

describe("buildSdxlPrompt", () => {
  it("combines panel direction with storyboard continuity", () => {
    const storyboard = createMockStoryboard(validInput);
    const panel = storyboard.storyboard[0];
    const result = buildSdxlPrompt(panel, {
      visualStyle: storyboard.visualStyle,
      characterContinuity: storyboard.characters[0].visualDescription,
      locationContinuity: storyboard.locations[0].description,
      continuityNotes: storyboard.continuityNotes,
    });

    expect(result.prompt).toContain(panel.action);
    expect(result.prompt).toContain(panel.shotType);
    expect(result.prompt).toContain(panel.cameraDirection);
    expect(result.prompt).toContain(storyboard.visualStyle);
    expect(result.prompt).toContain(storyboard.characters[0].visualDescription);
    expect(result.prompt).toContain(storyboard.locations[0].description);
    expect(result.prompt).toContain("no text");
    expect(result.prompt).toContain("no watermark");
    expect(result.negativePrompt).not.toContain(panel.negativePrompt);
    expect(result.negativePrompt).toContain("distorted face");
  });
});

describe("SDXL visual bible regression", () => {
  it("puts the complete shot before even a very long approved bible", async () => {
    const { createVisualBible } = await import("@/lib/visualBible");
    const board = createMockStoryboard(validInput);
    const bible = { ...createVisualBible(board, validInput), approvedVersion: 1 };
    bible.referenceDirection = "Blue ink on paper. ".repeat(80);
    const panel = {
      ...board.storyboard[0],
      imagePrompt: "Wide shot, an astronaut in a white suit walking through a dark space station, flashlight illuminating floating dust.",
    };
    const result = buildSdxlPrompt(panel, {
      visualBible: bible,
      visualStyle: board.visualStyle,
      characterContinuity: "OUTDATED CHARACTER DESCRIPTION",
    });
    expect(result.prompt.startsWith(panel.shotType)).toBe(true);
    expect(result.prompt).toContain(panel.action);
    expect(result.prompt).not.toContain("astronaut");
    expect(result.prompt).not.toMatch(/Approved visual bible|takes precedence|selectedStyle|approvedVersion|character-1|location-1|[{}\[\]]/);
    expect(result.prompt).not.toContain("OUTDATED CHARACTER DESCRIPTION");
    expect(result.prompt).not.toContain("Follow the appearance description");
    expect(result.prompt).not.toContain("Use a consistent palette");
    expect(result.prompt).not.toContain("Keep light quality consistent");
  });

  it("retains concrete user edits without duplicating review instructions", async () => {
    const { createVisualBible } = await import("@/lib/visualBible");
    const board = createMockStoryboard(validInput);
    const bible = { ...createVisualBible(board, validInput), approvedVersion: 1 };
    bible.palette = "Muted blue and amber";
    bible.characters[0].hair = "Short silver hair";
    bible.locations[0].materials = "Brushed steel and cracked glass";
    const { prompt } = buildSdxlPrompt(board.storyboard[0], {
      visualBible: bible, visualStyle: "Noir", characterContinuity: "Old appearance",
    });
    expect(prompt).toContain("Muted blue and amber");
    expect(prompt).toContain("Short silver hair");
    expect(prompt).toContain("Brushed steel and cracked glass");
    expect(prompt).not.toContain("Follow the location description");
  });
});

describe("shot-specific construction", () => {
  function setup() {
    const board = createMockStoryboard(validInput);
    const bible = { ...createVisualBible(board, validInput), approvedVersion: 1 };
    bible.characters.push({ ...bible.characters[0], id: "character-2", name: "Absent visitor", appearance: "UNRELATED PERSON", hair: "GREEN HAIR" });
    bible.locations.push({ ...bible.locations[0], id: "location-2", name: "Other room", architecture: "UNRELATED CASTLE" });
    bible.locations[0].recurringProps = "UNSEEN FURNITURE";
    bible.characters[0].clothing = "Blue uniform";
    bible.characters[0].accessories = "Empty hands";
    return { board, bible, context: { visualBible: bible, visualStyle: "Noir", characterContinuity: "OLD CAST" } };
  }

  it("selects only referenced subjects, environments and visible props", () => {
    const { board, context } = setup();
    const { prompt } = buildSdxlPrompt({ ...board.storyboard[0], visibleProps: ["Small brass key"] }, context);
    expect(prompt).toContain("Blue uniform");
    expect(prompt).toContain("Small brass key");
    for (const excluded of ["UNRELATED PERSON", "GREEN HAIR", "UNRELATED CASTLE", "UNSEEN FURNITURE", "OLD CAST"]) expect(prompt).not.toContain(excluded);
    const empty = buildSdxlPrompt({ ...board.storyboard[0], characterIds: [], locationIds: [], visibleProps: [] }, context);
    expect(empty.prompt).not.toContain("Blue uniform");
  });

  it("uses identical approved style and appearance despite conflicting draft prompts", () => {
    const { board, bible, context } = setup();
    bible.medium = "Watercolour on paper";
    for (const panel of board.storyboard) {
      const result = buildSdxlPrompt({ ...panel, imagePrompt: "Photorealistic 3D render, red uniform, extreme close-up", negativePrompt: "watercolour", shotNegativePrompts: ["duplicate props"] }, context);
      expect(result.prompt).toContain("Watercolour on paper");
      expect(result.prompt).toContain("Blue uniform");
      expect(result.prompt).not.toContain("Photorealistic");
      expect(result.prompt).not.toContain("red uniform");
      expect(result.negativePrompt).not.toContain("watercolour");
      expect(result.negativePrompt).toContain("duplicate props");
    }
  });

  it("applies explicit event changes without mutating defaults or unrelated shots", () => {
    const { board, context, bible } = setup();
    const changed = buildSdxlPrompt({ ...board.storyboard[0], continuityChanges: [{ characterId: "character-1", reason: "Picks up the key", appearance: "Projectionist holding a key", accessories: "Holding a brass key" }] }, context);
    expect(changed.prompt).toContain("Holding a brass key");
    expect(changed.prompt).not.toContain("Empty hands");
    expect(buildSdxlPrompt(board.storyboard[1], context).prompt).toContain("Empty hands");
    expect(bible.characters[0].accessories).toBe("Empty hands");
  });

  it("rejects conflicting camera framing, unknown IDs and invalid changes", () => {
    const { board, context } = setup();
    expect(() => buildSdxlPrompt({ ...board.storyboard[0], cameraDirection: "Use an extreme close-up" }, context)).toThrow("conflicts");
    expect(() => buildSdxlPrompt({ ...board.storyboard[0], characterIds: ["missing"] }, context)).toThrow("Unknown shot reference");
    expect(() => buildSdxlPrompt({ ...board.storyboard[0], continuityChanges: [{ characterId: "character-2", reason: "Changes coat", appearance: "Visitor wearing a red coat", clothing: "Red coat" }] }, context)).toThrow("visible character");
  });
});
