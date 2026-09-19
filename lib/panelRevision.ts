import type { StoryboardPanel } from "@/types/storyboard";

export function replacePanelImage(panel: StoryboardPanel, update: Partial<StoryboardPanel>): StoryboardPanel {
  if (panel.imageApproved) return panel;
  const { imageHistory: history = [], ...previous } = panel;
  return { ...panel, ...update, imageApproved: false, imageHistory: panel.imageUrl ? [...history, { ...previous, imageStatus: "complete" as const, imageError: undefined }].slice(-100) : history };
}

export type PanelImageVersion = Omit<StoryboardPanel, "imageHistory">;

/** Keep generated alternatives without changing the selected image or shot text. */
export function rememberPanelImage(panel: StoryboardPanel, candidate: PanelImageVersion): StoryboardPanel {
  if (panel.imageApproved || !candidate.imageUrl) return panel;
  return { ...panel, imageHistory: [...(panel.imageHistory ?? []), candidate].slice(-100) };
}

/** Switch only image fields, removing metadata that belongs to the old selection. */
export function choosePanelImage(panel: StoryboardPanel, candidate: PanelImageVersion): StoryboardPanel {
  if (panel.imageApproved || !candidate.imageUrl || candidate.imageUrl === panel.imageUrl) return panel;
  const { imageHistory = [], ...current } = panel;
  const shotFields = Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith("image")));
  const imageFields = Object.fromEntries(Object.entries(candidate).filter(([key]) => key.startsWith("image") && key !== "imageHistory"));
  const history = imageHistory.filter(image => image.imageUrl !== candidate.imageUrl);
  if (current.imageUrl) history.push({ ...current, imageStatus: "complete", imageError: undefined });
  return { ...shotFields, ...imageFields, imageStatus: "complete", imageError: undefined,
    imageApproved: false, imageSelected: panel.imageSelected, imageHistory: history.slice(-100) } as StoryboardPanel;
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
