import type { StoryboardPackage } from "@/types/storyboard";
import { validateStoryboardPackage } from "./storyboardSchema";

export function recoverStoryboard(board: StoryboardPackage): StoryboardPackage {
  const validated = validateStoryboardPackage(board);
  if (!validated.success) throw new Error(`Invalid saved storyboard: ${validated.issues.join(" ")}`);
  const ids = board.storyboard.map(p => p.panelId).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error("Saved shot identities must be unique.");
  return { ...board, storyboard: board.storyboard.map(p => ({ ...p,
    imageStatus: p.imageStatus === "generating" ? p.imageUrl ? "complete" : "not_started" : p.imageStatus,
  })) };
}
