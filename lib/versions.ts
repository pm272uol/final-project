import { z } from "zod";
import { storyboardInputSchema, storyboardPackageSchema } from "./storyboardSchema";
import type { GenerationMetadata, StoryboardInput, StoryboardPackage } from "@/types/storyboard";

export const generationMetadataSchema = z.object({
  mode: z.enum(["mock", "ollama", "vercel"]), provider: z.enum(["mock", "ollama", "vercel"]), model: z.string(),
  durationMs: z.number().nonnegative(), fallbackUsed: z.boolean(), fallbackReason: z.string().optional(),
  promptTokens: z.number().nonnegative().optional(), completionTokens: z.number().nonnegative().optional(), estimatedCostUsd: z.number().nonnegative().optional(),
});
export const storyboardVersionSchema = z.object({
  id: z.string().min(1), label: z.string().min(1).max(200), createdAt: z.string().datetime(),
  condition: z.string().min(1).max(500), input: storyboardInputSchema, storyboard: storyboardPackageSchema,
  metadata: generationMetadataSchema.nullable(),
});
export type StoryboardVersion = z.infer<typeof storyboardVersionSchema>;
export const MAX_VERSIONS = 50;
export function captureVersion(input: StoryboardInput, storyboard: StoryboardPackage, metadata: GenerationMetadata | null, label: string, condition: string): StoryboardVersion {
  return storyboardVersionSchema.parse(structuredClone({ id: crypto.randomUUID(), label, condition, createdAt: new Date().toISOString(), input, storyboard, metadata }));
}
export function inputCondition(input: StoryboardInput) {
  return input.visualReferenceSummary?.trim() ? "Scene text + reviewed visual summary (audio origin unspecified)" : "Scene text (audio origin unspecified)";
}
