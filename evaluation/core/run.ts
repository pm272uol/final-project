import { copyFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import { inspectRequiredAssets, type LoadedScene } from "./dataset.ts";
import { captureEnvironment } from "./environment.ts";
import { hashValue, messageOf, readJsonFile, writeJson } from "./files.ts";
import { evaluateOutput } from "./output.ts";
import { buildEvaluationPrompt, constrainedFormat } from "./prompts.ts";
import { generateReports, loadInvocationRecords } from "./report.ts";
import {
  cacheKey,
  createRunDirectory,
  invocationFilename,
  readCache,
  readRunState,
  saveInvocation,
  writeCache,
  writeRunManifest,
  writeRunState,
  type CachedInference,
  type RunState,
} from "./storage.ts";
import { evaluationConfigSchema, sceneSchema } from "./schemas.ts";
import type {
  EvaluationConfig,
  EvaluationModel,
  InvocationRecord,
} from "./schemas.ts";
import {
  listOllamaModels,
  runOllama,
  unloadOllamaModel,
} from "../runners/ollama.ts";

export async function runEvaluation(options: {
  config: EvaluationConfig;
  configPath: string;
  scenes: LoadedScene[];
  force: boolean;
  resumeDirectory?: string;
  onStatus?: (message: string) => void;
}) {
  const { config, configPath, scenes, force, resumeDirectory, onStatus = () => undefined } = options;
  const assetProblems = await inspectRequiredAssets(config, scenes);
  if (assetProblems.length) {
    throw new Error(`Required dataset assets are unavailable:\n${assetProblems.join("\n")}`);
  }

  const ollamaModels = await listOllamaModels(config.provider.baseUrl);
  const resolvedModels = config.models.map((configuredModel) => {
    const installedModel = ollamaModels.find((item) => item.name === configuredModel.model);
    if (!installedModel) throw new Error(`Ollama model ${configuredModel.model} is not installed.`);
    const requiredCapability = config.category === "vlm" ? "vision" : "completion";
    if (!installedModel.capabilities?.includes(requiredCapability)) {
      throw new Error(
        `Ollama model ${configuredModel.model} does not expose the required ${requiredCapability} capability.`,
      );
    }
    const supportsThinking = installedModel.capabilities?.includes("thinking") ?? false;
    if (supportsThinking && !configuredModel.thinking) {
      throw new Error(
        `Ollama model ${configuredModel.model} supports thinking, but thinking is not enabled in the evaluation config.`,
      );
    }
    if (!supportsThinking && configuredModel.thinking) {
      throw new Error(
        `Ollama model ${configuredModel.model} does not expose thinking capability.`,
      );
    }
    if (
      configuredModel.model.startsWith("gpt-oss") &&
      !["low", "medium", "high"].includes(String(configuredModel.thinking))
    ) {
      throw new Error(
        `GPT-OSS model ${configuredModel.model} requires thinking to be low, medium, or high.`,
      );
    }
    if (
      configuredModel.version &&
      installedModel.digest &&
      !installedModel.digest.startsWith(configuredModel.version)
    ) {
      throw new Error(
        `Configured digest ${configuredModel.version} does not match installed digest ${installedModel.digest} for ${configuredModel.model}.`,
      );
    }
    return {
      ...configuredModel,
      version: installedModel.digest ?? configuredModel.version,
    } satisfies EvaluationModel;
  });
  const plan = buildInvocationPlan(config, scenes);
  const prepared = resumeDirectory
    ? await prepareResumedRun({
        resumeDirectory,
        config,
        scenes,
        resolvedModels,
        plan,
      })
    : await prepareNewRun({ config, configPath, scenes, ollamaModels, plan });
  const { runId, runDirectory, startedAt, records, completedInvocationIds } = prepared;
  let state = prepared.state;
  const persistState = async (
    activeInvocationId?: string,
    status: RunState["status"] = "running",
  ) => {
    const completed = plan
      .map((item) => item.invocationId)
      .filter((invocationId) => completedInvocationIds.has(invocationId));
    const pending = plan
      .map((item) => item.invocationId)
      .filter((invocationId) => !completedInvocationIds.has(invocationId));
    state = {
      ...state,
      status,
      updatedAt: new Date().toISOString(),
      completedInvocationIds: completed,
      pendingInvocationIds: pending,
      activeInvocationId,
      remainingInvocations: plan.length - completed.length,
    };
    await writeRunState(runDirectory, state);
  };

  if (resumeDirectory) {
    onStatus(
      `Resuming ${runId}: ${completedInvocationIds.size}/${plan.length} invocations complete; ` +
      `${plan.length - completedInvocationIds.size} remaining.`,
    );
    await persistState();
  }

  for (const model of resolvedModels) {
    const modelHasPendingWork = plan.some((item) =>
      item.modelId === model.id && !completedInvocationIds.has(item.invocationId)
    );
    if (!modelHasPendingWork) {
      onStatus(`Model ${model.displayName} already complete; skipping.`);
      continue;
    }
    onStatus(`Model ${model.displayName}`);
    const warmupScene = scenes[0];
    if (!warmupScene) throw new Error("The selected dataset is empty.");
    for (let warmup = 0; warmup < config.settings.warmupRuns; warmup += 1) {
      onStatus(`  Warm-up ${warmup + 1}/${config.settings.warmupRuns}`);
      try {
        await invoke(config, model, warmupScene, false, onStatus);
      } catch (error) {
        onStatus(`  Warm-up failed (${messageOf(error)}); continuing with measured runs.`);
      }
    }

    for (const scene of scenes) {
      for (let repetition = 1; repetition <= config.settings.measuredRuns; repetition += 1) {
        const invocationId = makeInvocationId(scene.record.id, model.id, repetition);
        if (completedInvocationIds.has(invocationId)) continue;
        onStatus(`  ${scene.record.id}, run ${repetition}/${config.settings.measuredRuns}`);
        await persistState(invocationId);
        const prompt = buildEvaluationPrompt(config.category, scene.record);
        const promptHash = hashValue(prompt);
        const key = cacheKey({
          category: config.category,
          model,
          prompt,
          input: scene.record,
          settings: {
            streamGuardVersion: 1,
            promptMode: config.settings.promptMode,
            contextLength: config.settings.contextLength,
            temperature: config.settings.temperature,
            seed: config.settings.seed,
            maxOutputTokens: config.settings.maxOutputTokens,
            thinking: model.thinking ?? false,
            hardTimeoutMs: config.settings.hardTimeoutMs,
            repetitionGuard: config.settings.repetitionGuard,
          },
          repetition,
        });
        const invocationStarted = new Date().toISOString();
        const invocationTimerStarted = performance.now();
        let cached = false;
        let inference: CachedInference | undefined;
        let failure: InvocationRecord["failure"];

        if (config.settings.useCache && !force) {
          inference = await readCache(config.cacheRoot, key);
          cached = Boolean(inference);
        }

        if (!inference) {
          try {
            inference = await invoke(config, model, scene, true, onStatus);
            if (config.settings.useCache) await writeCache(config.cacheRoot, key, inference);
          } catch (error) {
            failure = classifyFailure(error);
            inference = {
              rawOutput: "",
              rawResponseEnvelope: null,
              actualModel: model.model,
              capturedAt: new Date().toISOString(),
              performance: { wallTimeMs: Math.round(performance.now() - invocationTimerStarted) },
            };
          }
        }

        const evaluated = evaluateOutput(config.category, scene.record, inference.rawOutput);
        if (!failure && !evaluated.metrics.jsonParsed) {
          failure = {
            code: inference.rawOutput.trim() ? "F04" : "F05",
            message: evaluated.metrics.schemaIssues[0] ?? "Model output could not be parsed.",
          };
        } else if (!failure && !evaluated.metrics.schemaValid) {
          failure = {
            code: "F04",
            message: evaluated.metrics.schemaIssues[0] ?? "Model output failed schema validation.",
          };
        }
        const record: InvocationRecord = {
          version: 1,
          runId,
          invocationId,
          testId: scene.record.id,
          category: config.category,
          stage: config.stage,
          repetition,
          model: { ...model, model: inference.actualModel },
          provider: "ollama",
          promptMode: config.settings.promptMode,
          promptHash,
          settings: config.settings,
          cache: { key, hit: cached },
          startedAt: invocationStarted,
          finishedAt: new Date().toISOString(),
          input: config.category === "llm"
            ? { storyboardInput: scene.record.storyboardInput, prompt }
            : { referenceImage: scene.referenceImagePath, prompt },
          rawOutput: inference.rawOutput,
          rawThinking: inference.rawThinking,
          outputChannel: inference.outputChannel,
          rawResponseEnvelope: inference.rawResponseEnvelope,
          parsedOutput: evaluated.parsedOutput,
          metrics: evaluated.metrics,
          performance: inference.performance,
          failure,
        };
        records.push(record);
        await saveInvocation(runDirectory, record);
        completedInvocationIds.add(invocationId);
        await persistState();
      }
    }

    if (config.settings.unloadAfterModel) await unloadOllamaModel(config, model.model);
  }

  const finishedAt = new Date().toISOString();
  const orderedRecords = orderRecords(records, plan);
  const invocationFiles = orderedRecords.map((record) =>
    join(runDirectory, "raw", invocationFilename(record.testId, record.model.id, record.repetition))
  );
  await writeRunManifest(runDirectory, {
    runId,
    configFile: configPath,
    config,
    invocationFiles,
    startedAt,
    finishedAt,
  });
  const summary = await generateReports(runDirectory, orderedRecords);
  await persistState(undefined, "completed");
  return {
    runId,
    runDirectory,
    records: orderedRecords,
    summary,
    resumed: Boolean(resumeDirectory),
    completedBeforeResume: prepared.completedBeforeResume,
  };
}

type PlannedInvocation = {
  invocationId: string;
  modelId: string;
  testId: string;
  repetition: number;
};

function buildInvocationPlan(config: EvaluationConfig, scenes: LoadedScene[]) {
  return config.models.flatMap((model) =>
    scenes.flatMap((scene) =>
      Array.from({ length: config.settings.measuredRuns }, (_, index) => {
        const repetition = index + 1;
        return {
          invocationId: makeInvocationId(scene.record.id, model.id, repetition),
          modelId: model.id,
          testId: scene.record.id,
          repetition,
        } satisfies PlannedInvocation;
      })
    )
  );
}

function makeInvocationId(testId: string, modelId: string, repetition: number) {
  return `${testId}-${modelId}-r${repetition}`;
}

async function prepareNewRun(options: {
  config: EvaluationConfig;
  configPath: string;
  scenes: LoadedScene[];
  ollamaModels: unknown[];
  plan: PlannedInvocation[];
}) {
  const { config, configPath, scenes, ollamaModels, plan } = options;
  const { runId, runDirectory } = await createRunDirectory(config);
  const startedAt = new Date().toISOString();
  const state: RunState = {
    version: 1,
    runId,
    status: "running",
    startedAt,
    updatedAt: startedAt,
    totalInvocations: plan.length,
    plannedInvocationIds: plan.map((item) => item.invocationId),
    completedInvocationIds: [],
    pendingInvocationIds: plan.map((item) => item.invocationId),
    remainingInvocations: plan.length,
    resumeCount: 0,
  };

  await Promise.all([
    copyFile(configPath, join(runDirectory, "config.json")),
    captureEnvironment(runDirectory, ollamaModels, config.modelStore),
    writeJson(join(runDirectory, "dataset-snapshot.json"), scenes.map((scene) => scene.record)),
    writeRunState(runDirectory, state),
  ]);

  return {
    runId,
    runDirectory,
    startedAt,
    records: [] as InvocationRecord[],
    completedInvocationIds: new Set<string>(),
    completedBeforeResume: 0,
    state,
  };
}

async function prepareResumedRun(options: {
  resumeDirectory: string;
  config: EvaluationConfig;
  scenes: LoadedScene[];
  resolvedModels: EvaluationModel[];
  plan: PlannedInvocation[];
}) {
  const runDirectory = resolve(options.resumeDirectory);
  const runId = basename(runDirectory);
  const savedConfig = await readJsonFile(
    join(runDirectory, "config.json"),
    evaluationConfigSchema,
  );
  if (hashValue(experimentIdentity(savedConfig)) !== hashValue(experimentIdentity(options.config))) {
    throw new Error(
      `Cannot resume ${runId}: its saved experiment configuration does not match the requested configuration.`,
    );
  }

  const savedScenes = await readJsonFile(
    join(runDirectory, "dataset-snapshot.json"),
    z.array(sceneSchema),
  );
  const currentScenes = options.scenes.map((scene) => scene.record);
  if (hashValue(savedScenes) !== hashValue(currentScenes)) {
    throw new Error(`Cannot resume ${runId}: dataset snapshot differs from the current selected scenes.`);
  }

  const records = await loadInvocationRecords(runDirectory);
  const plannedIds = new Set(options.plan.map((item) => item.invocationId));
  const completedInvocationIds = new Set<string>();
  for (const record of records) {
    if (record.runId !== runId) {
      throw new Error(`Cannot resume ${runId}: ${record.invocationId} belongs to run ${record.runId}.`);
    }
    if (!plannedIds.has(record.invocationId)) {
      throw new Error(`Cannot resume ${runId}: unexpected invocation ${record.invocationId}.`);
    }
    if (completedInvocationIds.has(record.invocationId)) {
      throw new Error(`Cannot resume ${runId}: duplicate invocation ${record.invocationId}.`);
    }
    completedInvocationIds.add(record.invocationId);
    const resolvedModel = options.resolvedModels.find((model) => model.id === record.model.id);
    if (record.model.version && resolvedModel?.version && record.model.version !== resolvedModel.version) {
      throw new Error(
        `Cannot resume ${runId}: model ${record.model.id} changed from ` +
        `${record.model.version} to ${resolvedModel.version}.`,
      );
    }
  }

  const previousState = await readRunState(runDirectory);
  const now = new Date().toISOString();
  const startedAt = previousState?.startedAt ?? earliestStart(records) ?? now;
  const state: RunState = {
    version: 1,
    runId,
    status: "running",
    startedAt,
    updatedAt: now,
    totalInvocations: options.plan.length,
    plannedInvocationIds: options.plan.map((item) => item.invocationId),
    completedInvocationIds: options.plan
      .map((item) => item.invocationId)
      .filter((invocationId) => completedInvocationIds.has(invocationId)),
    pendingInvocationIds: options.plan
      .map((item) => item.invocationId)
      .filter((invocationId) => !completedInvocationIds.has(invocationId)),
    remainingInvocations: options.plan.length - completedInvocationIds.size,
    resumeCount: (previousState?.resumeCount ?? 0) + 1,
    lastResumedAt: now,
  };

  await writeRunState(runDirectory, state);
  return {
    runId,
    runDirectory,
    startedAt,
    records,
    completedInvocationIds,
    completedBeforeResume: completedInvocationIds.size,
    state,
  };
}

function experimentIdentity(config: EvaluationConfig) {
  return {
    version: config.version,
    id: config.id,
    category: config.category,
    stage: config.stage,
    sceneIds: config.sceneIds,
    provider: config.provider,
    models: config.models,
    settings: config.settings,
  };
}

function earliestStart(records: InvocationRecord[]) {
  return records.map((record) => record.startedAt).sort()[0];
}

function orderRecords(records: InvocationRecord[], plan: PlannedInvocation[]) {
  const order = new Map(plan.map((item, index) => [item.invocationId, index]));
  return [...records].sort((left, right) =>
    (order.get(left.invocationId) ?? Number.MAX_SAFE_INTEGER) -
    (order.get(right.invocationId) ?? Number.MAX_SAFE_INTEGER)
  );
}

async function invoke(
  config: EvaluationConfig,
  model: EvaluationModel,
  scene: LoadedScene,
  capture: boolean,
  onStatus: (message: string) => void,
): Promise<CachedInference> {
  const prompt = buildEvaluationPrompt(config.category, scene.record);
  const result = await runOllama({
    config,
    model,
    prompt,
    imagePath: scene.referenceImagePath,
    format: config.settings.promptMode === "constrained"
      ? constrainedFormat(config.category)
      : undefined,
    onProgress: ({ elapsedMs, responseChars, thinkingChars, contentChunks }) => {
      onStatus(
        `    ${formatElapsed(elapsedMs)} elapsed; ${contentChunks.toLocaleString()} streamed chunks; ` +
        `${responseChars.toLocaleString()} response chars; ${thinkingChars.toLocaleString()} thinking chars`,
      );
    },
  });
  return {
    rawOutput: capture ? result.rawOutput : "",
    rawThinking: capture ? result.rawThinking : undefined,
    outputChannel: result.outputChannel,
    rawResponseEnvelope: capture ? result.rawResponseEnvelope : undefined,
    actualModel: result.actualModel,
    capturedAt: new Date().toISOString(),
    performance: {
      wallTimeMs: result.wallTimeMs,
      providerTotalMs: result.providerTotalMs,
      loadMs: result.loadMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      tokensPerSecond: result.tokensPerSecond,
    },
  };
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}h ${minutes}m ${seconds}s` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function classifyFailure(error: unknown): NonNullable<InvocationRecord["failure"]> {
  const message = messageOf(error);
  if (/repeated-output loop/i.test(message)) return { code: "F06", message };
  if (/timed out|inactive|abort/i.test(message)) return { code: "F03", message };
  if (/out of memory|allocate memory|oom/i.test(message)) return { code: "F02", message };
  if (/not found|pull model|model.*missing/i.test(message)) return { code: "F01", message };
  if (/Ollama returned|fetch failed|connect/i.test(message)) return { code: "F08", message };
  return { code: "F09", message };
}
