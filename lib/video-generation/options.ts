import { z } from "zod";
import type { StoryboardPackage } from "@/types/storyboard";
import { visualBiblePrompt, visualDescriptions } from "@/lib/visualBible";

export const VIDEO_MODEL = "Wan 2.1 T2V 1.3B";
export const VIDEO_PRESETS = {
  preview: { frames: 33, steps: 10, fps: 16, width: 832, height: 480 },
  standard: { frames: 81, steps: 30, fps: 16, width: 832, height: 480 },
} as const;
export const videoRequestSchema = z.object({
  provider: z.enum(["local", "replicate"]),
  quality: z.enum(["preview", "standard"]),
  seed: z.number().int().min(0).max(2147483637),
  shots: z.array(z.object({
    panelNumber: z.number().int().min(1).max(100),
    prompt: z.string().trim().min(1).max(6000),
  }).strict()).min(1).max(10),
}).strict().refine(value => new Set(value.shots.map(s => s.panelNumber)).size === value.shots.length,
  "Shot numbers must be unique.");
export type VideoRequest = z.infer<typeof videoRequestSchema>;
export type VideoJob = {
  id: string;
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  provider: VideoRequest["provider"];
  quality: VideoRequest["quality"];
  seed: number;
  completedShots: number;
  totalShots: number;
  message: string;
  createdAt: string;
  durationSeconds: number;
  videoUrl?: string;
  clips: { panelNumber: number; url: string }[];
};

/** Send text only; rendered images and their potentially large histories stay in the browser. */
export function storyboardVideoShots(board: StoryboardPackage): VideoRequest["shots"] {
  return board.storyboard.map(panel => {
    const bible = board.visualBible;
    const characters = bible
      ? bible.characters.filter(c => !panel.characterIds || panel.characterIds.includes(c.id)).map(c => {
          const change = panel.continuityChanges?.find(item => item.characterId === c.id);
          return visualDescriptions([c.name, change?.appearance ?? c.appearance,
            change?.clothing ?? c.clothing, change?.accessories ?? c.accessories]);
        }).join(". ")
      : board.characters.map(c => `${c.name}: ${c.visualDescription}`).join(". ");
    return {
      panelNumber: panel.panelNumber,
      prompt: [
        `${panel.shotType}. ${panel.action}`,
        `Camera movement: ${panel.cameraDirection}. ${panel.shotInstructions ?? ""}`,
        `Setting: ${panel.setting}.`,
        characters ? `Visible characters: ${characters}.` : "",
        panel.visibleProps?.length ? `Props: ${panel.visibleProps.join(", ")}.` : "",
        `Visual style: ${bible ? visualBiblePrompt(bible) : board.visualStyle}. ${board.tone} atmosphere.`,
        "One continuous cinematic shot, natural movement, no cuts, no captions or titles.",
      ].filter(Boolean).join("\n").slice(0, 6000),
    };
  });
}
