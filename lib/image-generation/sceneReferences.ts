import type { REFERENCE_PURPOSES } from "@/lib/referenceImageOptions";
import type { StoryboardPackage, VisualReference } from "@/types/storyboard";

export function uploadedVisualReferences(drafts: {
  id: string; imageUrl: string; purpose: (typeof REFERENCE_PURPOSES)[number];
}[]): VisualReference[] {
  return drafts.map(draft => ({
    id: draft.id,
    imageUrl: draft.imageUrl,
    purpose: draft.purpose === "Character" ? "character" : draft.purpose === "Location" ? "location"
      : draft.purpose === "Composition" || draft.purpose === "Sketch" ? "composition" : "style",
    source: "upload", approved: true, version: 1,
  }));
}

/** User uploads take priority. Removing them restores the automatic frame reference. */
export function sceneImageReferences(board: StoryboardPackage, uploads: VisualReference[]): VisualReference[] {
  if (uploads.length) return uploads;
  const generated = board.visualReferences?.find(reference => reference.source !== "upload" && reference.approved);
  if (generated) return [generated];
  const firstImage = board.storyboard.find(panel => panel.imageUrl);
  return firstImage?.imageUrl ? [{
    id: `frame-${firstImage.panelId ?? firstImage.panelNumber}`,
    imageUrl: firstImage.imageUrl, purpose: "style", source: "generated", approved: true, version: 1,
  }] : [];
}
