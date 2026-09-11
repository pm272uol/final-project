import type { VisualBible } from "../lib/visualBible";
export type StoryboardInput = {
  sceneIdea: string;
  visualReferenceSummary?: string;
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

export type VisualReference = { id: string; imageUrl: string; purpose: "style" | "character" | "location" | "composition"; entityId?: string; approved: boolean; version: number };

export type StoryboardPanel = {
  panelId?: string;
  sound?: string;
  shotInstructions?: string;
  imageApproved?: boolean;
  imageSelected?: boolean;
  imageHistory?: Omit<StoryboardPanel, "imageHistory">[];
  characterIds?: string[];
  locationIds?: string[];
  visibleProps?: string[];
  shotNegativePrompts?: ("extra people" | "duplicate props" | "motion blur" | "cluttered background")[];
  continuityChanges?: { characterId: string; reason: string; appearance: string; clothing?: string; accessories?: string }[];
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
  imageReferenceIds?: string[];
  imageModelVersion?: string;
  imageSettings?: Record<string, string | number>;
  imageBibleVersion?: number;
  imageNeedsReview?: boolean;
  imageStatus?: ImageGenerationStatus;
  imageUrl?: string;
  imageError?: string;
  imageGenerationPrompt?: string;
  imageGenerationNegativePrompt?: string;
  imageProvider?: ImageProviderName;
  imageModel?: string;
  imageSeed?: number;
  imageWidth?: number;
  imageHeight?: number;
  imageGeneratedAt?: string;
  imageGenerationDurationMs?: number;
};

export type ImageGenerationStatus =
  | "not_started"
  | "generating"
  | "complete"
  | "failed";

export type ImageProviderName = "mock" | "replicate";

export type StoryboardImageContext = {
  visualBible?: VisualBible;
  visualStyle: string;
  characterContinuity: string;
  locationContinuity?: string;
  continuityNotes?: string[];
};

export type ImageGenerationOptions = {
  references?: VisualReference[];

  width?: number;
  height?: number;
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  guidanceScale?: number;
  outputFormat?: "png" | "jpg" | "webp";
};

export type ImageGenerationResult = {
  modelVersion?: string;
  settings?: Record<string, string | number>;
  imageUrl: string;
  provider: ImageProviderName;
  model: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  width: number;
  height: number;
  generatedAt: string;
  durationMs: number;
};

export type PanelImageGenerationRequest = {
  references?: VisualReference[];
  seed?: number;
  panel: StoryboardPanel;
  imageContext: StoryboardImageContext;
};

export type PanelImageGenerationResponse = {
  imageReferenceIds?: string[];
  imageModelVersion?: string;
  imageSettings?: Record<string, string | number>;
  imageBibleVersion: number;
  panelNumber: number;
  imagePrompt: string;
  negativePrompt: string;
  imageUrl: string;
  imageStatus: "complete";
  imageProvider: ImageProviderName;
  imageModel: string;
  imageSeed?: number;
  imageWidth: number;
  imageHeight: number;
  imageGeneratedAt: string;
  imageGenerationDurationMs: number;
};

export type StoryboardPackage = {
  visualReferences?: VisualReference[];
  visualBible?: VisualBible;
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

export type GenerationMode = "ollama" | "vercel" | "mock";

export type GenerationMetadata = {
  estimatedCostUsd?: number;
  mode: GenerationMode;
  provider: "ollama" | "vercel" | "mock";
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

export type StoryboardGenerationStreamEvent =
  | {
      type: "status";
      message: string;
    }
  | {
      type: "output";
      text: string;
    }
  | {
      type: "complete";
      data: StoryboardGenerationResponse;
    }
  | {
      type: "error";
      error: string;
      code?: string;
      validationIssues?: string[];
    };
