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

    expect(result.prompt).toContain(panel.storyBeat);
    expect(result.prompt).toContain(panel.shotType);
    expect(result.prompt).toContain(panel.cameraDirection);
    expect(result.prompt).toContain(storyboard.visualStyle);
    expect(result.prompt).toContain(storyboard.characters[0].visualDescription);
    expect(result.prompt).toContain(storyboard.locations[0].description);
    expect(result.prompt).toContain("no text");
    expect(result.prompt).toContain("no watermark");
    expect(result.negativePrompt).toContain(panel.negativePrompt);
    expect(result.negativePrompt).toContain("distorted face");
  });
});
