import { z } from "zod";
import { evaluateStoryboard } from "../../lib/evaluator.ts";
import {
  generatedStoryboardPackageSchema,
  validateStoryboardPackage,
} from "../../lib/storyboardSchema.ts";
import {
  visionOutputSchema,
  type AutomaticMetrics,
  type Scene,
} from "./schemas.ts";

export function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Model returned an empty response.");
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch (firstError) {
    const start = Math.min(...[unfenced.indexOf("{"), unfenced.indexOf("[")].filter((value) => value >= 0));
    const end = Math.max(unfenced.lastIndexOf("}"), unfenced.lastIndexOf("]"));
    if (Number.isFinite(start) && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        // Preserve the original parsing error below.
      }
    }
    throw new Error(`Response is not valid JSON: ${errorMessage(firstError)}`);
  }
}

export function evaluateOutput(
  category: "llm" | "vlm",
  scene: Scene,
  rawOutput: string,
): { parsedOutput: unknown; metrics: AutomaticMetrics } {
  let parsedOutput: unknown;
  try {
    parsedOutput = parseModelJson(rawOutput);
  } catch (error) {
    return {
      parsedOutput: null,
      metrics: emptyMetrics(scene, [errorMessage(error)]),
    };
  }

  const schema = category === "llm" ? generatedStoryboardPackageSchema : visionOutputSchema;
  const schemaResult = schema.safeParse(parsedOutput);
  const schemaIssues = schemaResult.success ? [] : formatZodIssues(schemaResult.error);
  const searchable = normaliseText(JSON.stringify(parsedOutput));
  const entities = scoreAliases(
    scene.groundTruth.entities.filter((item) => item.required).map((item) => item.aliases),
    searchable,
  );
  const attributes = scoreAliases(
    scene.groundTruth.attributes.filter((item) => item.required).map((item) => item.acceptedValues),
    searchable,
  );
  const relationships = scoreAliases(
    scene.groundTruth.relationships.filter((item) => item.required).map((item) => [
      ...item.aliases,
      `${item.subject} ${item.relation} ${item.object}`,
    ]),
    searchable,
  );

  const metrics: AutomaticMetrics = {
    jsonParsed: true,
    schemaValid: schemaResult.success,
    schemaIssues,
    completeness: calculateCompleteness(schema, parsedOutput),
    entityCorrect: entities.correct,
    entityTotal: entities.total,
    entityRecall: ratioOrNull(entities.correct, entities.total),
    attributeCorrect: attributes.correct,
    attributeTotal: attributes.total,
    attributeAccuracy: ratioOrNull(attributes.correct, attributes.total),
    relationshipCorrect: relationships.correct,
    relationshipTotal: relationships.total,
    relationshipAccuracy: ratioOrNull(relationships.correct, relationships.total),
  };

  if (category === "llm") {
    const panels = getPanels(parsedOutput);
    metrics.generatedPanelCount = panels?.length;
    metrics.panelCountCorrect = panels?.length === scene.groundTruth.expectedPanelCount;
    const sourceConstraints = scoreSourceConstraints(parsedOutput, scene);
    metrics.sourceConstraintCorrect = sourceConstraints.correct;
    metrics.sourceConstraintTotal = sourceConstraints.total;
    metrics.sourceConstraintAccuracy = ratioOrNull(sourceConstraints.correct, sourceConstraints.total);
    const requiredShots = scoreRequiredShots(panels, scene.groundTruth.requiredShotTypes);
    metrics.requiredShotCorrect = requiredShots.correct;
    metrics.requiredShotTotal = requiredShots.total;
    metrics.requiredShotCoverage = ratioOrNull(requiredShots.correct, requiredShots.total);
    const instructionCorrect = sourceConstraints.correct + requiredShots.correct + Number(metrics.panelCountCorrect);
    const instructionTotal = sourceConstraints.total + requiredShots.total + 1;
    metrics.instructionAdherence = ratioOrNull(instructionCorrect, instructionTotal);
    const validation = validateStoryboardPackage(parsedOutput, scene.groundTruth.expectedPanelCount);
    if (validation.success) {
      metrics.deterministicEvaluationScore = evaluateStoryboard(
        validation.data,
        scene.groundTruth.expectedPanelCount,
      ).score;
    }
  }

  return { parsedOutput, metrics };
}

function emptyMetrics(scene: Scene, schemaIssues: string[]): AutomaticMetrics {
  const entityTotal = scene.groundTruth.entities.filter((item) => item.required).length;
  const attributeTotal = scene.groundTruth.attributes.filter((item) => item.required).length;
  const relationshipTotal = scene.groundTruth.relationships.filter((item) => item.required).length;
  return {
    jsonParsed: false,
    schemaValid: false,
    schemaIssues,
    completeness: 0,
    entityCorrect: 0,
    entityTotal,
    entityRecall: entityTotal ? 0 : null,
    attributeCorrect: 0,
    attributeTotal,
    attributeAccuracy: attributeTotal ? 0 : null,
    relationshipCorrect: 0,
    relationshipTotal,
    relationshipAccuracy: relationshipTotal ? 0 : null,
  };
}

function calculateCompleteness(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) return 1;
  const requiredPaths = collectRequiredPaths(schema);
  if (!requiredPaths.length) return 0;
  const present = requiredPaths.filter((path) => getPath(value, path) !== undefined).length;
  return round(present / requiredPaths.length);
}

function collectRequiredPaths(schema: z.ZodType, prefix: string[] = []): string[][] {
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, child]) =>
      collectRequiredPaths(child as z.ZodType, [...prefix, key]),
    );
  }
  if (schema instanceof z.ZodArray) return prefix.length ? [prefix] : [];
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) return [];
  return prefix.length ? [prefix] : [];
}

function getPath(value: unknown, path: string[]) {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function scoreAliases(aliasGroups: string[][], searchable: string) {
  const correct = aliasGroups.filter((aliases) =>
    aliases.some((alias) => searchable.includes(normaliseText(alias))),
  ).length;
  return { correct, total: aliasGroups.length };
}

function normaliseText(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function ratioOrNull(correct: number, total: number) {
  return total ? round(correct / total) : null;
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function getPanels(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const storyboard = (value as Record<string, unknown>).storyboard;
  return Array.isArray(storyboard) ? storyboard : undefined;
}

function scoreSourceConstraints(value: unknown, scene: Scene) {
  if (!value || typeof value !== "object") return { correct: 0, total: 4 };
  const output = value as Record<string, unknown>;
  const expected = scene.storyboardInput;
  const exactChecks = [
    [output.genre, expected.genre],
    [output.tone, expected.tone],
    [output.estimatedDuration, expected.duration],
  ];
  const exactCorrect = exactChecks.filter(([actual, target]) =>
    typeof actual === "string" && normaliseText(actual) === normaliseText(String(target)),
  ).length;
  const styleCorrect = typeof output.visualStyle === "string" &&
    normaliseText(output.visualStyle).includes(normaliseText(expected.visualStyle));
  return { correct: exactCorrect + Number(styleCorrect), total: 4 };
}

function scoreRequiredShots(panels: unknown[] | undefined, requiredShots: string[]) {
  const actual = new Set(
    (panels ?? []).flatMap((panel) =>
      panel && typeof panel === "object" && typeof (panel as Record<string, unknown>).shotType === "string"
        ? [normaliseText((panel as Record<string, string>).shotType)]
        : [],
    ),
  );
  const correct = requiredShots.filter((shot) => actual.has(normaliseText(shot))).length;
  return { correct, total: requiredShots.length };
}

function formatZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
