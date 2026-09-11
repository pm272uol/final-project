import type { StoryboardPackage, StoryboardPanel } from "@/types/storyboard";

export const MAX_PANELS = 60;
export type SequenceAction = "up" | "down" | "insert" | "duplicate" | "delete";
export function sequencePanels(board: StoryboardPackage, index: number, action: SequenceAction): StoryboardPackage {
  if (!board.storyboard[index] || board.storyboard.some(p => p.imageStatus === "generating")) return board;
  if ((action === "insert" || action === "duplicate") && board.storyboard.length >= MAX_PANELS) return board;
  if (action === "delete" && board.storyboard.length === 1) return board;
  if ((action === "up" && index === 0) || (action === "down" && index === board.storyboard.length - 1)) return board;
  const panels = board.storyboard.map(p => ({ ...p, panelId: p.panelId ?? crypto.randomUUID() }));
  if (action === "delete") panels.splice(index, 1);
  else if (action === "up" || action === "down") {
    const target = index + (action === "up" ? -1 : 1);
    [panels[index], panels[target]] = [panels[target], panels[index]];
  } else {
    const added: StoryboardPanel = action === "duplicate"
      ? { ...structuredClone(panels[index]), panelId: crypto.randomUUID(), imageApproved: false, imageSelected: false }
      : { panelId: crypto.randomUUID(), panelNumber: 1, storyBeat: "New story beat", shotType: "medium shot", cameraDirection: "Describe the framing and camera movement.", action: "Describe the action.", setting: "Describe the setting.", imagePrompt: "Describe the image.", negativePrompt: "Avoid unwanted objects.", dialogueOrNarration: "None", productionNote: "Add production notes.", imageStatus: "not_started" };
    panels.splice(index + 1, 0, added as typeof panels[number]);
  }
  return { ...board, storyboard: panels.map((p, i) => ({ ...p, panelNumber: i + 1 })) };
}
