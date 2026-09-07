import type { StoryboardPackage, StoryboardPanel } from "@/types/storyboard";
import { resolveShotReferences } from "./promptBuilder";

export function relevantReferences(board: StoryboardPackage, panel: StoryboardPanel) {
  const resolved = resolveShotReferences(panel, { visualBible: board.visualBible, visualStyle: board.visualStyle, characterContinuity: "" });
  return (board.visualReferences ?? []).filter(r => r.approved && (
    r.purpose === "style" || (r.purpose === "character" && resolved.characterIds?.includes(r.entityId ?? "")) ||
    (r.purpose === "location" && resolved.locationIds?.includes(r.entityId ?? ""))
  ));
}
