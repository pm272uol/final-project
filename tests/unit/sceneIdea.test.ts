import { expect, it } from "vitest";
import { chooseSceneIdeaVariation, sceneIdeaPrompt, sceneIdeaVariationSchema, type RecentSceneIdea } from "@/lib/sceneIdea";

it("keeps every creative axis out of the recent six even with a repeated random draw", () => {
  let recent: RecentSceneIdea[] = [];
  for (let i = 0; i < 30; i++) {
    const variation = chooseSceneIdeaVariation(recent, () => 0);
    expect(sceneIdeaVariationSchema.safeParse(variation).success).toBe(true);
    for (const key of ["cast", "setting", "action", "tone"] as const) {
      expect(recent.some(item => item.variation?.[key] === variation[key])).toBe(false);
    }
    expect(sceneIdeaPrompt(variation)).not.toContain("undefined");
    recent = [...recent, { sceneIdea: `Idea ${i}`, variation }].slice(-6);
  }
});
