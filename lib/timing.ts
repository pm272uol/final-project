import type { StoryboardPackage } from "@/types/storyboard";

export function durationSeconds(duration: string): number | null {
  const match = duration.trim().match(/^(\d+(?:\.\d+)?)\s*(seconds?|minutes?)$/i);
  if (!match) return null;
  const seconds = Number(match[1]) * (match[2].toLowerCase().startsWith("minute") ? 60 : 1);
  return seconds > 0 && Number.isFinite(seconds) ? seconds : null;
}
export function sequenceTiming(board: StoryboardPackage, target: string) {
  const targetSeconds = durationSeconds(target);
  const fallback = Math.round((targetSeconds ?? board.storyboard.length * 10) / board.storyboard.length * 10) / 10;
  let start = 0;
  const shots = board.storyboard.map(panel => {
    const duration = panel.durationSeconds ?? fallback;
    const shot = { panel, start, end: start + duration, duration };
    start += duration;
    return shot;
  });
  return { shots, total: start, targetSeconds };
}
export function activeShotIndex(ends: number[], elapsed: number) {
  const index = ends.findIndex(end => elapsed < end);
  return index < 0 ? Math.max(0, ends.length - 1) : index;
}
