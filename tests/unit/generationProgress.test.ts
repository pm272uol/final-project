import { describe, expect, it } from "vitest";
import { inspectGenerationOutput } from "@/lib/generationProgress";

describe("inspectGenerationOutput", () => {
  it("extracts completed milestones from partial storyboard JSON", () => {
    const output = `{
      "title": "Tomorrow's Frame",
      "characters": [
        {"name": "Mara", "role": "protagonist"},
        {"name": "The Visitor", "role": "supporting"}
      ],
      "locations": [
        {"name": "Projection Booth", "description": "Dusty"}
      ],
      "storyboard": [
        {"panelNumber": 1, "storyBeat": "The reel catches"},
        {"panelNumber": 2, "storyBeat": "Tomorrow appears"`;

    expect(inspectGenerationOutput(output)).toEqual({
      title: "Tomorrow's Frame",
      characters: ["Mara", "The Visitor"],
      locations: ["Projection Booth"],
      panelCount: 2,
      latestStoryBeat: "Tomorrow appears",
    });
  });

  it("ignores string values that have not finished streaming", () => {
    const output = `{"title":"An unfinished title`;

    expect(inspectGenerationOutput(output)).toEqual({
      title: undefined,
      characters: [],
      locations: [],
      panelCount: 0,
      latestStoryBeat: undefined,
    });
  });

  it("decodes escaped JSON string content", () => {
    expect(
      inspectGenerationOutput(
        String.raw`{"title":"The \"Impossible\" Frame","characters":[]}`,
      ).title,
    ).toBe('The "Impossible" Frame');
  });
});
