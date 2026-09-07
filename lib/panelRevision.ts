import type { StoryboardPanel } from "@/types/storyboard";

export function replacePanelImage(panel: StoryboardPanel, update: Partial<StoryboardPanel>): StoryboardPanel {
  if (panel.imageApproved) return panel;
  const { imageHistory: history = [], ...previous } = panel;
  return { ...panel, ...update, imageApproved: false, imageHistory: panel.imageUrl ? [...history, { ...previous, imageStatus: "complete", imageError: undefined }] : history };
}
export function restorePanelImage(panel: StoryboardPanel, index: number): StoryboardPanel {
  if (panel.imageApproved) return panel;
  const selected = panel.imageHistory?.[index]; if (!selected) return panel;
  const { imageHistory: history = [], ...current } = panel;
  // Restore generation metadata, retaining current shot text and marking it for review.
  const imageFields = Object.fromEntries(Object.entries(selected).filter(([key]) => key.startsWith("image")));
  return { ...panel, ...imageFields, imageApproved: false, imageStatus: "complete", imageNeedsReview: true, imageError: undefined,
    imageHistory: [...history.filter((_, i) => i !== index), ...(panel.imageUrl ? [{ ...current, imageStatus: "complete" as const }] : [])] };
}
export function pendingPanels(panels: StoryboardPanel[], mode: "missing" | "failed" | "selected") {
  return panels.filter(p => !p.imageApproved && p.imageStatus !== "generating" && (mode === "selected" ? p.imageSelected : mode === "failed" ? p.imageStatus === "failed" : !p.imageUrl));
}
