import { z } from "zod";
import { storyboardPanelSchema } from "@/lib/storyboardSchema";
import type {
  PanelImageGenerationRequest,
  StoryboardImageContext,
} from "@/types/storyboard";

export const storyboardImageContextSchema = z.object({
  visualStyle: z.string().trim().min(1).max(1_000),
  characterContinuity: z.string().trim().min(1).max(4_000),
  locationContinuity: z.string().trim().min(1).max(4_000).optional(),
  continuityNotes: z.array(z.string().trim().min(1).max(1_000)).max(20).optional(),
}).strict() satisfies z.ZodType<StoryboardImageContext>;

export const panelImageGenerationRequestSchema = z.object({
  panel: storyboardPanelSchema,
  imageContext: storyboardImageContextSchema,
}).strict() satisfies z.ZodType<PanelImageGenerationRequest>;
