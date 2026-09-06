import { visualBiblePrompt } from "@/lib/visualBible";
import type {
  StoryboardImageContext,
  StoryboardPanel,
} from "@/types/storyboard";

export type BuiltImagePrompt = {
  prompt: string;
  negativePrompt: string;
};

export function buildSdxlPrompt(
  panel: StoryboardPanel,
  context: StoryboardImageContext,
): BuiltImagePrompt {
  const continuity = context.continuityNotes?.filter(Boolean).join(" ");
  const prompt = [
    context.visualBible ? visualBiblePrompt(context.visualBible) : context.visualStyle,
    `Storyboard frame ${panel.panelNumber}.`,
    `${panel.shotType}.`,
    panel.cameraDirection,
    panel.imagePrompt,
    `Setting: ${panel.setting}.`,
    `Character continuity: ${context.visualBible ? JSON.stringify(context.visualBible.characters) : context.characterContinuity}.`,
    (context.visualBible || context.locationContinuity)
      ? `Location continuity: ${context.visualBible ? JSON.stringify(context.visualBible.locations) : context.locationContinuity}.`
      : undefined,
    continuity ? `Continuity notes: ${continuity}.` : undefined,
    "Clear readable composition, no text, no captions, no watermark.",
  ]
    .filter(Boolean)
    .join(" ");

  const negativePrompt = [
    panel.negativePrompt,
    "text",
    "caption",
    "subtitle",
    "watermark",
    "logo",
    "blurry",
    "low quality",
    "extra limbs",
    "distorted face",
    "inconsistent character design",
  ].join(", ");

  return { prompt, negativePrompt };
}
