export type StoryboardInput = {
  sceneIdea: string;
  genre:
    | "Drama"
    | "Comedy"
    | "Sci-fi"
    | "Fantasy"
    | "Horror"
    | "Thriller"
    | "Romance"
    | "Adventure"
    | "Experimental";
  visualStyle:
    | "Cinematic live action"
    | "Indie short film"
    | "Animated short"
    | "Documentary style"
    | "Noir"
    | "Surreal"
    | "Minimalist";
  duration: "30 seconds" | "60 seconds" | "90 seconds" | "2 minutes" | "3 minutes";
  panelCount: 4 | 6 | 8 | 10;
  tone:
    | "Warm"
    | "Tense"
    | "Funny"
    | "Melancholic"
    | "Mysterious"
    | "Hopeful"
    | "Dark"
    | "Dreamlike";
  targetFormat:
    | "Storyboard panels"
    | "Concept art prompts"
    | "Shot list"
    | "Storyboard + shot list";
};

export type Character = {
  name: string;
  role: "protagonist" | "supporting" | "antagonist" | "background";
  visualDescription: string;
  personality: string;
};

export type Location = {
  name: string;
  description: string;
  mood: string;
};

export type ShotType =
  | "establishing shot"
  | "wide shot"
  | "medium shot"
  | "close-up"
  | "extreme close-up"
  | "over-the-shoulder"
  | "point-of-view shot"
  | "tracking shot";

export type StoryboardPanel = {
  panelNumber: number;
  storyBeat: string;
  shotType: ShotType;
  cameraDirection: string;
  action: string;
  setting: string;
  imagePrompt: string;
  negativePrompt: string;
  dialogueOrNarration: string;
  productionNote: string;
};

export type StoryboardPackage = {
  title: string;
  logline: string;
  genre: string;
  tone: string;
  visualStyle: string;
  estimatedDuration: string;
  characters: Character[];
  locations: Location[];
  storyboard: StoryboardPanel[];
  continuityNotes: string[];
  productionNotes: string[];
};

export type EvaluationCheck = {
  id: string;
  label: string;
  passed: boolean;
  message: string;
};

export type EvaluationResult = {
  score: number;
  passed: boolean;
  checks: EvaluationCheck[];
};

export type GenerationMode = "ollama" | "mock";

export type GenerationMetadata = {
  mode: GenerationMode;
  provider: "ollama" | "mock";
  model: string;
  durationMs: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  promptTokens?: number;
  completionTokens?: number;
};

export type StoryboardGenerationResponse = {
  mode: GenerationMode;
  storyboard: StoryboardPackage;
  metadata: GenerationMetadata;
};
