import type { StoryboardInput } from "@/types/storyboard";

export const GENRES = [
  "Drama",
  "Comedy",
  "Sci-fi",
  "Fantasy",
  "Horror",
  "Thriller",
  "Romance",
  "Adventure",
  "Experimental",
] as const;

export const VISUAL_STYLES = [
  "Cinematic live action",
  "Indie short film",
  "Animated short",
  "Documentary style",
  "Noir",
  "Surreal",
  "Minimalist",
] as const;

export const DURATIONS = [
  "30 seconds",
  "60 seconds",
  "90 seconds",
  "2 minutes",
  "3 minutes",
] as const;

export const PANEL_COUNTS = [4, 6, 8, 10] as const;

export const TONES = [
  "Warm",
  "Tense",
  "Funny",
  "Melancholic",
  "Mysterious",
  "Hopeful",
  "Dark",
  "Dreamlike",
] as const;

export const TARGET_FORMATS = [
  "Storyboard panels",
  "Concept art prompts",
  "Shot list",
  "Storyboard + shot list",
] as const;

export const CHARACTER_ROLES = [
  "protagonist",
  "supporting",
  "antagonist",
  "background",
] as const;

export const SHOT_TYPES = [
  "establishing shot",
  "wide shot",
  "medium shot",
  "close-up",
  "extreme close-up",
  "over-the-shoulder",
  "point-of-view shot",
  "tracking shot",
] as const;

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
