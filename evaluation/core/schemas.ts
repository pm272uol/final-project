import { z } from "zod";
import { storyboardInputSchema } from "../../lib/storyboardSchema.ts";

export const requiredEntitySchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["character", "object", "environment", "action", "other"]),
  aliases: z.array(z.string().trim().min(1)).min(1),
  required: z.boolean().default(true),
});

export const expectedAttributeSchema = z.object({
  entityId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  acceptedValues: z.array(z.string().trim().min(1)).min(1),
  required: z.boolean().default(true),
});

export const expectedRelationshipSchema = z.object({
  subject: z.string().trim().min(1),
  relation: z.string().trim().min(1),
  object: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
  required: z.boolean().default(true),
});

export const sceneSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^SCENE-\d{2}$/),
  title: z.string().trim().min(1),
  complexity: z.enum(["simple", "medium", "complex"]),
  storyboardInput: storyboardInputSchema,
  assets: z.object({
    audio: z.string().trim().min(1).optional(),
    referenceImage: z.string().trim().min(1).optional(),
  }),
  groundTruth: z.object({
    transcript: z.string().trim().min(1).optional(),
    criticalDetails: z.array(z.object({
      id: z.string().trim().min(1),
      aliases: z.array(z.string().trim().min(1)).min(1),
    })).default([]),
    entities: z.array(requiredEntitySchema).default([]),
    attributes: z.array(expectedAttributeSchema).default([]),
    relationships: z.array(expectedRelationshipSchema).default([]),
    exclusions: z.array(z.string().trim().min(1)).default([]),
    expectedPanelCount: z.number().int().positive(),
    requiredShotTypes: z.array(z.string().trim().min(1)).default([]),
  }),
});

export const datasetManifestSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1),
  scenes: z.array(z.string().trim().min(1)).min(1),
});

export const thinkingModeSchema = z.union([
  z.boolean(),
  z.enum(["low", "medium", "high", "max"]),
]);

const modelSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  displayName: z.string().trim().min(1),
  model: z.string().trim().min(1),
  version: z.string().trim().min(1).optional(),
  execution: z.enum(["local", "cloud"]).default("local"),
  thinking: thinkingModeSchema.optional(),
});

export const evaluationConfigSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  category: z.enum(["llm", "vlm"]),
  stage: z.enum(["stage1", "stage3"]),
  dataset: z.string().trim().min(1),
  modelStore: z.string().trim().min(1).optional(),
  sceneIds: z.array(z.string().regex(/^SCENE-\d{2}$/)).optional(),
  outputRoot: z.string().trim().min(1).default("evaluation/results"),
  cacheRoot: z.string().trim().min(1).default("evaluation/.cache"),
  provider: z.object({
    type: z.literal("ollama"),
    baseUrl: z.string().url().default("http://127.0.0.1:11434"),
  }),
  models: z.array(modelSchema).min(1),
  settings: z.object({
    promptMode: z.enum(["prompt_only", "constrained"]).default("prompt_only"),
    runMode: z.enum(["quality", "performance"]).default("quality"),
    contextLength: z.number().int().positive().default(8192),
    temperature: z.number().min(0).max(2).default(0),
    seed: z.number().int().nonnegative().default(42),
    maxOutputTokens: z.number().int().positive().optional(),
    warmupRuns: z.number().int().nonnegative().default(1),
    measuredRuns: z.number().int().positive().default(3),
    timeoutMs: z.number().int().positive().default(300_000),
    hardTimeoutMs: z.number().int().positive().default(3_600_000),
    progressIntervalMs: z.number().int().positive().default(30_000),
    repetitionGuard: z.boolean().default(true),
    useCache: z.boolean().default(true),
    unloadAfterModel: z.boolean().default(true),
  }),
}).superRefine((config, context) => {
  if (config.settings.runMode === "performance" && config.settings.useCache) {
    context.addIssue({
      code: "custom",
      path: ["settings", "useCache"],
      message: "Performance runs must set useCache to false.",
    });
  }
});

export const visionOutputSchema = z.object({
  characters: z.array(z.string()),
  objects: z.array(z.string()),
  environment: z.string(),
  actions: z.array(z.string()),
  attributes: z.array(z.string()),
  spatialRelationships: z.array(z.string()),
  lighting: z.string(),
  camera: z.string(),
  style: z.string(),
}).strict();

export type EvaluationConfig = z.infer<typeof evaluationConfigSchema>;
export type EvaluationModel = EvaluationConfig["models"][number];
export type Scene = z.infer<typeof sceneSchema>;
export type DatasetManifest = z.infer<typeof datasetManifestSchema>;

export type AutomaticMetrics = {
  jsonParsed: boolean;
  schemaValid: boolean;
  schemaIssues: string[];
  completeness: number;
  entityCorrect: number;
  entityTotal: number;
  entityRecall: number | null;
  attributeCorrect: number;
  attributeTotal: number;
  attributeAccuracy: number | null;
  relationshipCorrect: number;
  relationshipTotal: number;
  relationshipAccuracy: number | null;
  sourceConstraintCorrect?: number;
  sourceConstraintTotal?: number;
  sourceConstraintAccuracy?: number | null;
  requiredShotCorrect?: number;
  requiredShotTotal?: number;
  requiredShotCoverage?: number | null;
  instructionAdherence?: number | null;
  panelCountCorrect?: boolean;
  generatedPanelCount?: number;
  deterministicEvaluationScore?: number;
};

export type InvocationRecord = {
  version: 1;
  runId: string;
  invocationId: string;
  testId: string;
  category: "llm" | "vlm";
  stage: "stage1" | "stage3";
  repetition: number;
  model: EvaluationModel;
  provider: "ollama";
  promptMode: "prompt_only" | "constrained";
  promptHash: string;
  settings: EvaluationConfig["settings"];
  cache: { key: string; hit: boolean };
  startedAt: string;
  finishedAt: string;
  input: unknown;
  rawOutput: string;
  rawThinking?: string;
  outputChannel?: "response" | "thinking_json_fallback";
  rawResponseEnvelope?: unknown;
  parsedOutput: unknown;
  metrics: AutomaticMetrics;
  performance: {
    wallTimeMs: number;
    providerTotalMs?: number;
    loadMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    tokensPerSecond?: number;
  };
  failure?: {
    code: "F01" | "F02" | "F03" | "F04" | "F05" | "F06" | "F08" | "F09";
    message: string;
  };
};
