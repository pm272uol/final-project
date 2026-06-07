import { describe, expect, it } from "vitest";
import {
  createMockStoryboard,
  deriveSceneProfile,
} from "@/lib/mockStoryboard";
import { validInput } from "../fixtures";

describe("scene-aware mock storyboard", () => {
  it("derives the protagonist, central visual, and setting from the idea", () => {
    const profile = deriveSceneProfile(validInput.sceneIdea);

    expect(profile.subjectName).toBe("Night-Shift Projectionist");
    expect(profile.keyVisual).toBe("frame of tomorrow");
    expect(profile.setting).toBe("old film reel");
  });

  it("adapts the package instead of returning astronaut content", () => {
    const storyboard = createMockStoryboard(validInput);
    const serialized = JSON.stringify(storyboard);

    expect(storyboard.title).toBe("The Frame Of Tomorrow");
    expect(storyboard.characters[0].name).toBe("Night-Shift Projectionist");
    expect(storyboard.locations[0].name).toBe("Old Film Reel");
    expect(storyboard.storyboard).toHaveLength(4);
    expect(serialized).toContain("frame of tomorrow");
    expect(serialized).not.toContain("Astronaut");
    expect(serialized).not.toContain("space station");
  });
});
