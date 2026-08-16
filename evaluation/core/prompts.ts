import { z } from "zod";
import { buildStoryboardPrompt } from "../../lib/promptBuilder.ts";
import { generatedStoryboardPackageSchema } from "../../lib/storyboardSchema.ts";
import { visionOutputSchema, type Scene } from "./schemas.ts";

export function buildEvaluationPrompt(category: "llm" | "vlm", scene: Scene) {
  if (category === "llm") return buildStoryboardPrompt(scene.storyboardInput);

  return `Describe this image for use by a storyboard-generation system.
Identify all important characters, objects, actions, environment details, visual
attributes, spatial relationships, lighting, visual style, and camera composition.
Do not invent details that are not visible.

Return only valid JSON matching this schema, without markdown or commentary:
${JSON.stringify(z.toJSONSchema(visionOutputSchema))}`;
}

export function constrainedFormat(category: "llm" | "vlm") {
  return z.toJSONSchema(
    category === "llm" ? generatedStoryboardPackageSchema : visionOutputSchema,
  );
}
