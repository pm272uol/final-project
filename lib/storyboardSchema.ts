import type { StoryboardInput } from "@/types/storyboard";

export const GENRES: StoryboardInput["genre"][] = [
  "Drama", "Comedy", "Sci-fi", "Fantasy", "Horror", "Thriller",
  "Romance", "Adventure", "Experimental",
];

export const VISUAL_STYLES: StoryboardInput["visualStyle"][] = [
  "Cinematic live action", "Indie short film", "Animated short",
  "Documentary style", "Noir", "Surreal", "Minimalist",
];

export const DURATIONS: StoryboardInput["duration"][] = [
  "30 seconds", "60 seconds", "90 seconds", "2 minutes", "3 minutes",
];

export const PANEL_COUNTS: StoryboardInput["panelCount"][] = [4, 6, 8, 10];

export const TONES: StoryboardInput["tone"][] = [
  "Warm", "Tense", "Funny", "Melancholic", "Mysterious",
  "Hopeful", "Dark", "Dreamlike",
];

export const TARGET_FORMATS: StoryboardInput["targetFormat"][] = [
  "Storyboard panels", "Concept art prompts", "Shot list", "Storyboard + shot list",
];

export const DEFAULT_INPUT: StoryboardInput = {
  sceneIdea:
    "A tired astronaut discovers a tiny plant growing inside an abandoned space station.",
  genre: "Sci-fi",
  visualStyle: "Cinematic live action",
  duration: "60 seconds",
  panelCount: 6,
  tone: "Hopeful",
  targetFormat: "Storyboard + shot list",
};

export function isStoryboardInput(value: unknown): value is StoryboardInput {
  if (!value || typeof value !== "object") return false;
  const input = value as StoryboardInput;
  return (
    typeof input.sceneIdea === "string" &&
    input.sceneIdea.trim().length > 0 &&
    GENRES.includes(input.genre) &&
    VISUAL_STYLES.includes(input.visualStyle) &&
    DURATIONS.includes(input.duration) &&
    PANEL_COUNTS.includes(input.panelCount) &&
    TONES.includes(input.tone) &&
    TARGET_FORMATS.includes(input.targetFormat)
  );
}
