import { z } from "zod";
import type { StoryboardInput, StoryboardPackage } from "../types/storyboard.ts";

const detail = z.string().trim().min(1).max(2000);
const character = z.object({
  id: detail, name: detail, appearance: detail, hair: detail, clothing: detail,
  accessories: detail, distinguishingFeatures: detail,
}).strict();
const location = z.object({
  id: detail, name: detail, architecture: detail, materials: detail,
  recurringProps: detail, visualDetails: detail,
}).strict();
export const visualBibleSchema = z.object({
  version: z.number().int().positive(),
  approvedVersion: z.number().int().positive().nullable(),
  selectedStyle: detail,
  referenceDirection: z.string().trim().max(2000),
  medium: detail, palette: detail, linework: detail, texture: detail,
  renderingTreatment: detail, lightingRules: detail,
  characters: z.array(character).min(1).max(30),
  locations: z.array(location).min(1).max(30),
}).strict().superRefine((bible, ctx) => {
  for (const key of ["characters", "locations"] as const) {
    const ids = bible[key].map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: [key], message: "IDs must be unique." });
  }
  if (bible.approvedVersion !== null && bible.approvedVersion !== bible.version) {
    ctx.addIssue({ code: "custom", path: ["approvedVersion"], message: "Approval must match the current version." });
  }
});
export type VisualBible = z.infer<typeof visualBibleSchema>;

export function createVisualBible(board: StoryboardPackage, input: StoryboardInput): VisualBible {
  const preserve = "Follow the appearance description; keep consistent across shots.";
  return {
    version: 1, approvedVersion: null, selectedStyle: input.visualStyle,
    referenceDirection: input.visualReferenceSummary ?? "",
    medium: input.visualStyle,
    palette: "Use a consistent palette appropriate to the selected style and visual direction.",
    linework: "Keep line treatment consistent with the selected medium.",
    texture: "Keep surface texture and grain consistent across the sequence.",
    renderingTreatment: board.visualStyle,
    lightingRules: "Keep light quality consistent within each scene. Allow deliberate changes in time of day, practical lights, and scene mood when specified by the shot.",
    characters: board.characters.map((c, i) => ({ id: `character-${i + 1}`, name: c.name, appearance: c.visualDescription, hair: preserve, clothing: preserve, accessories: preserve, distinguishingFeatures: preserve })),
    locations: board.locations.map((l, i) => ({ id: `location-${i + 1}`, name: l.name, architecture: l.description, materials: "Follow the location description consistently.", recurringProps: "Preserve recurring props established in this location.", visualDetails: l.mood })),
  };
}

export function reviseVisualBible(board: StoryboardPackage, draft: VisualBible): StoryboardPackage {
  const bible = visualBibleSchema.parse({ ...draft, version: (board.visualBible?.version ?? 0) + 1, approvedVersion: null });
  for (const key of ["characters", "locations"] as const) {
    if (JSON.stringify(bible[key].map(x => x.id)) !== JSON.stringify(board.visualBible?.[key].map(x => x.id))) throw new Error("Character and location IDs must remain stable.");
  }
  return { ...board, visualBible: bible, storyboard: board.storyboard.map(panel => ({ ...panel, imageNeedsReview: Boolean(panel.imageUrl) })) };
}

export function visualBiblePrompt(bible: VisualBible): string {
  const direction = { selectedStyle: bible.selectedStyle, referenceDirection: bible.referenceDirection, medium: bible.medium, palette: bible.palette, linework: bible.linework, texture: bible.texture, renderingTreatment: bible.renderingTreatment, lightingRules: bible.lightingRules };
  return `Approved visual bible v${bible.version} (takes precedence over shot style and appearance): ${JSON.stringify(direction)}. Preserve these shared visual rules; vary only shot action, framing and intentional scene lighting.`;
}
