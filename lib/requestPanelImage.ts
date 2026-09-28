import { diagnosticFetch } from "@/lib/diagnostics/client";
import { generatedStoryboardPanelSchema } from "@/lib/storyboardSchema";
import type { PanelImageGenerationRequest, PanelImageGenerationResponse, StoryboardImageContext, StoryboardPackage, StoryboardPanel } from "@/types/storyboard";

export async function requestPanelImage(
  board: StoryboardPackage,
  panel: StoryboardPanel,
  imageContext: StoryboardImageContext,
  signal: AbortSignal,
  refinement?: PanelImageGenerationRequest["refinement"],
): Promise<Partial<StoryboardPanel>> {
  const response = await diagnosticFetch("/api/generate-panel-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      panel: generatedStoryboardPanelSchema.strip().parse(panel),
      // Refinements already include the current frame, but explicit uploads must
      // still guide the image model. Four uploads plus that frame fit its limit.
      references: board.visualReferences?.filter(reference => reference.approved &&
        (!refinement || reference.source === "upload")).slice(0, 4) ?? [],
      imageContext,
      refinement,
    }),
    signal,
  });
  const result = (await response.json().catch(() => null)) as
    | (PanelImageGenerationResponse & { error?: string; validationIssues?: string[] })
    | null;
  if (!response.ok || !result?.imageUrl) {
    throw new Error(result?.validationIssues?.join(" ") || result?.error || "Image generation failed. Please try again.");
  }
  return {
    imageReferenceIds: result.imageReferenceIds,
    imageModelVersion: result.imageModelVersion,
    imageSettings: result.imageSettings,
    imageBibleVersion: result.imageBibleVersion,
    imageNeedsReview: false,
    imageStatus: "complete",
    imageUrl: result.imageUrl,
    imageError: undefined,
    imageGenerationPrompt: result.imagePrompt,
    imageGenerationNegativePrompt: result.negativePrompt,
    imageProvider: result.imageProvider,
    imageModel: result.imageModel,
    imageSeed: result.imageSeed,
    imageWidth: result.imageWidth,
    imageHeight: result.imageHeight,
    imageGeneratedAt: result.imageGeneratedAt,
    imageGenerationDurationMs: result.imageGenerationDurationMs,
    imageRefinement: refinement?.instructions,
  };
}
