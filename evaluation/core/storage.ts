import { link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { EvaluationConfig, InvocationRecord } from "./schemas.ts";
import { hashValue, slug, writeJson } from "./files.ts";

export async function createRunDirectory(config: EvaluationConfig) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runId = `${timestamp}-${config.id}`;
  const runDirectory = join(config.outputRoot, runId);
  await Promise.all([
    mkdir(join(runDirectory, "raw"), { recursive: true }),
    mkdir(join(runDirectory, "reviews"), { recursive: true }),
  ]);
  return { runId, runDirectory };
}

export function cacheKey(value: unknown) {
  return hashValue(value);
}

export async function readCache(cacheRoot: string, key: string): Promise<CachedInference | undefined> {
  try {
    return JSON.parse(await readFile(join(cacheRoot, `${key}.json`), "utf8")) as CachedInference;
  } catch {
    return undefined;
  }
}

export async function writeCache(cacheRoot: string, key: string, value: CachedInference) {
  await writeJson(join(cacheRoot, `${key}.json`), value);
}

export async function saveInvocation(runDirectory: string, record: InvocationRecord) {
  const filename = invocationFilename(record.testId, record.model.id, record.repetition);
  const path = join(runDirectory, "raw", filename);
  const temporaryPath = join(
    runDirectory,
    "raw",
    `.${filename}-${process.pid}-${Date.now()}.tmp`,
  );
  await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  try {
    await link(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
  return path;
}

export function invocationFilename(testId: string, modelId: string, repetition: number) {
  return `${testId}-${slug(modelId)}-r${repetition}.json`;
}

export type RunState = {
  version: 1;
  runId: string;
  status: "running" | "completed";
  startedAt: string;
  updatedAt: string;
  totalInvocations: number;
  plannedInvocationIds: string[];
  completedInvocationIds: string[];
  pendingInvocationIds: string[];
  activeInvocationId?: string;
  remainingInvocations: number;
  resumeCount: number;
  lastResumedAt?: string;
};

export async function readRunState(runDirectory: string): Promise<RunState | undefined> {
  try {
    return JSON.parse(await readFile(join(runDirectory, "state.json"), "utf8")) as RunState;
  } catch {
    return undefined;
  }
}

export async function writeRunState(runDirectory: string, state: RunState) {
  const path = join(runDirectory, "state.json");
  const temporaryPath = join(
    runDirectory,
    `.state-${process.pid}-${Date.now()}.tmp`,
  );
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export async function writeRunManifest(
  runDirectory: string,
  value: {
    runId: string;
    configFile: string;
    config: EvaluationConfig;
    invocationFiles: string[];
    startedAt: string;
    finishedAt: string;
  },
) {
  await writeJson(join(runDirectory, "manifest.json"), {
    ...value,
    invocationFiles: value.invocationFiles.map((path) => `raw/${basename(path)}`),
  });
}

export type CachedInference = {
  rawOutput: string;
  rawThinking?: string;
  outputChannel?: "response" | "thinking_json_fallback";
  rawResponseEnvelope?: unknown;
  actualModel: string;
  capturedAt: string;
  performance: {
    wallTimeMs: number;
    providerTotalMs?: number;
    loadMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    tokensPerSecond?: number;
  };
};
