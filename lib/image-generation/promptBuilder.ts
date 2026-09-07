import { visualBiblePrompt, visualDescriptions } from "@/lib/visualBible";
import type { StoryboardImageContext, StoryboardPanel } from "@/types/storyboard";

export type BuiltImagePrompt = { prompt: string; negativePrompt: string };

/** Migrate older model output conservatively; an explicit empty selection stays empty. */
export function resolveShotReferences(panel: StoryboardPanel, context: StoryboardImageContext): StoryboardPanel {
  const bible = context.visualBible;
  if (!bible) return panel;
  const mentions = (name: string, text: string) => text.toLowerCase().includes(name.toLowerCase());
  return {
    ...panel,
    characterIds: panel.characterIds ?? bible.characters.filter(c =>
      mentions(c.name, panel.action) || (bible.characters.length === 1 && !/\b(empty|unoccupied|no (?:people|characters))\b/i.test(panel.action))
    ).map(c => c.id),
    locationIds: panel.locationIds ?? bible.locations.filter(l =>
      mentions(l.name, panel.setting) || bible.locations.length === 1
    ).map(l => l.id),
  };
}

export function shotPromptIssues(panel: StoryboardPanel, context: StoryboardImageContext): string[] {
  const bible = context.visualBible;
  const issues: string[] = [];
  if (bible) {
    for (const [ids, entries] of [[panel.characterIds, bible.characters], [panel.locationIds, bible.locations]] as const) {
      for (const id of ids ?? []) if (!entries.some(e => e.id === id)) issues.push(`Unknown shot reference: ${id}.`);
      if (ids && new Set(ids).size !== ids.length) issues.push("Shot references must be unique.");
    }
    for (const change of panel.continuityChanges ?? []) {
      if (!panel.characterIds?.includes(change.characterId)) issues.push("Continuity changes must reference a visible character.");
    }
    const changes = panel.continuityChanges ?? [];
    if (new Set(changes.map(c => c.characterId)).size !== changes.length) issues.push("Use one continuity change per character per shot.");
  }
  const sizes = panel.cameraDirection.toLowerCase().match(/extreme close-up|close-up|wide (?:shot|frame|composition)|medium (?:shot|frame|composition)/g) ?? [];
  for (const size of sizes) {
    const framing = size.startsWith("wide") ? "wide shot" : size.startsWith("medium") ? "medium shot" : size;
    if (["wide shot", "medium shot", "close-up", "extreme close-up", "establishing shot"].includes(panel.shotType) && framing !== panel.shotType && !(panel.shotType === "establishing shot" && framing === "wide shot")) {
      issues.push(`Camera framing ${size} conflicts with ${panel.shotType}.`);
    }
  }
  return issues;
}

export function buildSdxlPrompt(panel: StoryboardPanel, context: StoryboardImageContext): BuiltImagePrompt {
  panel = resolveShotReferences(panel, context);
  const issues = shotPromptIssues(panel, context);
  if (issues.length) throw new Error(issues.join(" "));
  const bible = context.visualBible;
  if (bible && bible.approvedVersion !== bible.version) throw new Error("Approve the current visual bible before generating images.");
  const characters = bible?.characters.filter(c => panel.characterIds?.includes(c.id)).map(c => {
    const change = panel.continuityChanges?.find(change => change.characterId === c.id);
    return visualDescriptions([c.name, change?.appearance ?? c.appearance, c.hair, change?.clothing ?? c.clothing, change?.accessories ?? c.accessories, c.distinguishingFeatures]);
  }) ?? [context.characterContinuity];
  const locations = bible?.locations.filter(l => panel.locationIds?.includes(l.id)).map(l =>
    // Recurring prop inventories are not necessarily visible in this shot.
    visualDescriptions([l.name, l.architecture, l.materials, l.visualDetails])
  ) ?? [context.locationContinuity ?? ""];

  // Free-form draft prompts (positive AND negative) are deliberately excluded:
  // they can redefine medium, costume, cast or framing independently of approval.
  // Keep the actual shot first because image providers may truncate long prompts.
  return {
    prompt: visualDescriptions([
      panel.shotType, panel.action, panel.cameraDirection, panel.shotInstructions ?? "", `Setting: ${panel.setting}`,
      bible ? visualBiblePrompt(bible) : context.visualStyle,
      ...characters, ...locations, ...(panel.visibleProps ?? []),
      "Clear readable composition, no text, no captions, no watermark",
    ]),
    negativePrompt: visualDescriptions([
      "text, caption, subtitle, watermark, logo, blurry, low quality, extra limbs, distorted face, inconsistent character design",
      ...(panel.shotNegativePrompts ?? []),
    ]),
  };
}
