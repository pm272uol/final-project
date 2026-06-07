import { describe, expect, it } from "vitest";
import { evaluateStoryboard } from "@/lib/evaluator";
import { OllamaStoryboardProvider } from "@/lib/providers/ollamaProvider";
import type { StoryboardInput } from "@/types/storyboard";

const enabled = process.env.OLLAMA_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;

const provider = new OllamaStoryboardProvider({
  baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  model: process.env.OLLAMA_MODEL ?? "gemma4:latest",
  timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 300_000),
});

const representativeInputs: StoryboardInput[] = [
  {
    sceneIdea:
      "A night-shift projectionist finds a frame of tomorrow hidden in an old film reel.",
    genre: "Thriller",
    visualStyle: "Noir",
    duration: "60 seconds",
    panelCount: 4,
    tone: "Mysterious",
    targetFormat: "Storyboard + shot list",
  },
  {
    sceneIdea:
      "Two estranged sisters shelter from a storm in the seaside arcade they loved as children.",
    genre: "Drama",
    visualStyle: "Indie short film",
    duration: "90 seconds",
    panelCount: 4,
    tone: "Melancholic",
    targetFormat: "Storyboard panels",
  },
  {
    sceneIdea:
      "A courier on a floating market must return a singing compass before sunrise.",
    genre: "Fantasy",
    visualStyle: "Animated short",
    duration: "60 seconds",
    panelCount: 4,
    tone: "Dreamlike",
    targetFormat: "Concept art prompts",
  },
];

describeIntegration("real Ollama storyboard generation", () => {
  for (const input of representativeInputs) {
    it(
      `generates valid ${input.genre.toLowerCase()} output`,
      async () => {
        const result = await provider.generate(input);
        const evaluation = evaluateStoryboard(
          result.storyboard,
          input.panelCount,
        );

        expect(result.metadata.provider).toBe("ollama");
        expect(result.metadata.model).toContain("gemma4");
        expect(result.storyboard.storyboard).toHaveLength(input.panelCount);
        expect(evaluation.passed).toBe(true);
      },
      360_000,
    );
  }
});
