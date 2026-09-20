import { z } from "zod";
import type { StoryboardPackage } from "@/types/storyboard";
import { visualBiblePrompt, visualDescriptions } from "@/lib/visualBible";

export const VIDEO_MODEL = "Wan 2.2 5B Fast";
export const VIDEO_PRESETS = {
  preview: { frames: 121, fps: 24, resolution: "480p", width: 832, height: 480, costUsd: 0.0125 },
  standard: { frames: 121, fps: 24, resolution: "720p", width: 1280, height: 720, costUsd: 0.025 },
} as const;
export const VIDEO_MAX_REQUEST_BYTES = 81_000_000;
export const videoImageSchema = z.string().max(8_000_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/, "Each shot needs an embedded PNG, JPEG or WebP image.");
export function hasVideoImage(panel: StoryboardPackage["storyboard"][number]) {
  return panel.imageStatus !== "generating" && videoImageSchema.safeParse(panel.imageUrl).success;
}
export const videoRequestSchema = z.object({
  quality: z.enum(["preview", "standard"]),
  seed: z.number().int().min(0).max(2147483637),
  shots: z.array(z.object({
    panelNumber: z.number().int().min(1).max(100),
    prompt: z.string().trim().min(1).max(6000),
    image: videoImageSchema,
  }).strict()).min(1).max(10),
}).strict().refine(value => new Set(value.shots.map(s => s.panelNumber)).size === value.shots.length,
  "Shot numbers must be unique.");
export type VideoRequest = z.infer<typeof videoRequestSchema>;
export type VideoJob = {
  id: string;
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  model: string;
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

/** Use each current panel image; history and dialogue are not sent to the video model. */
export function storyboardVideoShots(board: StoryboardPackage): VideoRequest["shots"] {
  return board.storyboard.map(panel => {
    if (!hasVideoImage(panel)) throw new Error(`Render an image for panel ${panel.panelNumber} before generating video.`);
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
      image: panel.imageUrl!,
      prompt: [
        `${panel.shotType}. ${panel.action}`,
        `Camera movement: ${panel.cameraDirection}. ${panel.shotInstructions ?? ""}`,
        `Setting: ${panel.setting}.`,
        characters ? `Visible characters: ${characters}.` : "",
        panel.visibleProps?.length ? `Props: ${panel.visibleProps.join(", ")}.` : "",
        `Visual style: ${bible ? visualBiblePrompt(bible) : board.visualStyle}. ${board.tone} atmosphere.`,
        "Animate the supplied starting image. Preserve its characters, clothing, composition and visual style.",
        "One continuous cinematic shot, natural movement, no cuts, no captions or titles.",
      ].filter(Boolean).join("\n").slice(0, 6000),
    };
  });
}
