import { z } from "zod";
import {
  CHARACTER_ROLES,
  DURATIONS,
  GENRES,
  SHOT_TYPES,
  TARGET_FORMATS,
  TONES,
  VISUAL_STYLES,
} from "@/lib/storyboardOptions";
import type { StoryboardInput, StoryboardPackage } from "@/types/storyboard";

export const storyboardInputSchema = z.object({
  sceneIdea: z
    .string()
    .trim()
    .min(1, "Scene idea is required.")
    .max(1_200, "Scene idea must be 1,200 characters or fewer."),
  visualReferenceSummary: z
    .string()
    .trim()
    .max(2_000, "Visual reference summary must be 2,000 characters or fewer.")
    .optional(),
  genre: z.enum(GENRES),
  visualStyle: z.enum(VISUAL_STYLES),
  duration: z.enum(DURATIONS),
  panelCount: z.union([
    z.literal(4),
    z.literal(6),
    z.literal(8),
    z.literal(10),
  ]),
  tone: z.enum(TONES),
  targetFormat: z.enum(TARGET_FORMATS),
}).strict() satisfies z.ZodType<StoryboardInput>;

export const characterSchema = z.object({
  name: z.string().trim().min(1, "Character name is required."),
  role: z.enum(CHARACTER_ROLES),
  visualDescription: z
    .string()
    .trim()
    .min(1, "Character visual description is required."),
  personality: z.string().trim().min(1, "Character personality is required."),
}).strict();

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Location name is required."),
  description: z.string().trim().min(1, "Location description is required."),
  mood: z.string().trim().min(1, "Location mood is required."),
}).strict();

export const generatedStoryboardPanelSchema = z.object({
  panelNumber: z.number().int().positive(),
  storyBeat: z.string().trim().min(1, "Story beat is required."),
  shotType: z.enum(SHOT_TYPES),
  cameraDirection: z.string().trim().min(1, "Camera direction is required."),
  action: z.string().trim().min(1, "Action is required."),
  setting: z.string().trim().min(1, "Setting is required."),
  imagePrompt: z.string().trim().min(1, "Image prompt is required."),
  negativePrompt: z.string().trim().min(1, "Negative prompt is required."),
  dialogueOrNarration: z
    .string()
    .trim()
    .min(1, "Dialogue or narration is required."),
  productionNote: z.string().trim().min(1, "Production note is required."),
}).strict();

export const storyboardPanelSchema = generatedStoryboardPanelSchema.extend({
  imageStatus: z
    .enum(["not_started", "generating", "complete", "failed"])
    .optional(),
  imageUrl: z.string().trim().min(1).optional(),
  imageError: z.string().trim().min(1).optional(),
  imageGenerationPrompt: z.string().trim().min(1).optional(),
  imageGenerationNegativePrompt: z.string().trim().min(1).optional(),
  imageProvider: z.enum(["mock", "replicate"]).optional(),
  imageModel: z.string().trim().min(1).optional(),
  imageSeed: z.number().int().nonnegative().optional(),
  imageWidth: z.number().int().positive().optional(),
  imageHeight: z.number().int().positive().optional(),
  imageGeneratedAt: z.string().datetime().optional(),
  imageGenerationDurationMs: z.number().int().nonnegative().optional(),
}).strict();

const storyboardPackageFields = {
  title: z.string().trim().min(1, "Title is required."),
  logline: z.string().trim().min(1, "Logline is required."),
  genre: z.string().trim().min(1, "Genre is required."),
  tone: z.string().trim().min(1, "Tone is required."),
  visualStyle: z.string().trim().min(1, "Visual style is required."),
  estimatedDuration: z
    .string()
    .trim()
    .min(1, "Estimated duration is required."),
  characters: z
    .array(characterSchema)
    .min(1, "At least one character is required."),
  locations: z.array(locationSchema).min(1, "At least one location is required."),
  storyboard: z
    .array(storyboardPanelSchema)
    .min(1, "At least one storyboard panel is required."),
  continuityNotes: z
    .array(z.string().trim().min(1))
    .min(1, "At least one continuity note is required."),
  productionNotes: z
    .array(z.string().trim().min(1))
    .min(1, "At least one production note is required."),
};

export const generatedStoryboardPackageSchema = z.object({
  ...storyboardPackageFields,
  storyboard: z
    .array(generatedStoryboardPanelSchema)
    .min(1, "At least one storyboard panel is required."),
}).strict() satisfies z.ZodType<StoryboardPackage>;

export const storyboardPackageSchema = z.object({
  ...storyboardPackageFields,
  storyboard: z
    .array(storyboardPanelSchema)
    .min(1, "At least one storyboard panel is required."),
}).strict() satisfies z.ZodType<StoryboardPackage>;

export type SchemaValidationResult<T> =
  | { success: true; data: T; issues: [] }
  | { success: false; issues: string[] };

export function isStoryboardInput(value: unknown): value is StoryboardInput {
  return storyboardInputSchema.safeParse(value).success;
}

export function validateStoryboardInput(
  value: unknown,
): SchemaValidationResult<StoryboardInput> {
  return formatValidationResult(storyboardInputSchema.safeParse(value));
}

export function validateStoryboardPackage(
  value: unknown,
  requestedPanelCount?: number,
): SchemaValidationResult<StoryboardPackage> {
  const result = storyboardPackageSchema.safeParse(value);
  const sequenceIssues = validateStoryboardSequence(
    value,
    requestedPanelCount,
  );

  if (!result.success) {
    const validationResult = formatValidationResult(result);
    return {
      success: false,
      issues: [...validationResult.issues, ...sequenceIssues],
    };
  }

  if (sequenceIssues.length > 0) {
    return { success: false, issues: sequenceIssues };
  }

  return { success: true, data: result.data, issues: [] };
}

function validateStoryboardSequence(
  value: unknown,
  requestedPanelCount?: number,
) {
  const issues: string[] = [];
  if (
    !value ||
    typeof value !== "object" ||
    !("storyboard" in value) ||
    !Array.isArray(value.storyboard)
  ) {
    return issues;
  }

  const panels = value.storyboard;

  if (
    typeof requestedPanelCount === "number" &&
    panels.length !== requestedPanelCount
  ) {
    issues.push(
      `storyboard: Expected exactly ${requestedPanelCount} panels, received ${panels.length}.`,
    );
  }

  panels.forEach((panel, index) => {
    const expectedPanelNumber = index + 1;
    if (
      panel &&
      typeof panel === "object" &&
      "panelNumber" in panel &&
      panel.panelNumber !== expectedPanelNumber
    ) {
      issues.push(
        `storyboard.${index}.panelNumber: Expected ${expectedPanelNumber}, received ${panel.panelNumber}.`,
      );
    }
  });

  return issues;
}

function formatValidationResult<T>(
  result: z.ZodSafeParseResult<T>,
): SchemaValidationResult<T> {
  if (result.success) {
    return { success: true, data: result.data, issues: [] };
  }

  return {
    success: false,
    issues: result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    }),
  };
}
