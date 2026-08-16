import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { inspectRequiredAssets, type LoadedScene } from "./dataset.ts";
import { captureEnvironment } from "./environment.ts";
import { hashValue, messageOf, writeJson } from "./files.ts";
import { evaluateOutput } from "./output.ts";
import { buildEvaluationPrompt, constrainedFormat } from "./prompts.ts";
import { generateReports } from "./report.ts";
import {
  cacheKey,
  createRunDirectory,
  readCache,
  saveInvocation,
  writeCache,
  writeRunManifest,
  type CachedInference,
} from "./storage.ts";
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
  onStatus?: (message: string) => void;
}) {
  const { config, configPath, scenes, force, onStatus = () => undefined } = options;
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
  const { runId, runDirectory } = await createRunDirectory(config);
  const startedAt = new Date().toISOString();
  const invocationFiles: string[] = [];
  const records: InvocationRecord[] = [];

  await Promise.all([
    copyFile(configPath, join(runDirectory, "config.json")),
    captureEnvironment(runDirectory, ollamaModels, config.modelStore),
    writeJson(join(runDirectory, "dataset-snapshot.json"), scenes.map((scene) => scene.record)),
  ]);

  for (const model of resolvedModels) {
    onStatus(`Model ${model.displayName}`);
    const warmupScene = scenes[0];
    if (!warmupScene) throw new Error("The selected dataset is empty.");
    for (let warmup = 0; warmup < config.settings.warmupRuns; warmup += 1) {
      onStatus(`  Warm-up ${warmup + 1}/${config.settings.warmupRuns}`);
      try {
        await invoke(config, model, warmupScene, false);
      } catch (error) {
        onStatus(`  Warm-up failed (${messageOf(error)}); continuing with measured runs.`);
      }
    }

    for (const scene of scenes) {
      for (let repetition = 1; repetition <= config.settings.measuredRuns; repetition += 1) {
        onStatus(`  ${scene.record.id}, run ${repetition}/${config.settings.measuredRuns}`);
        const prompt = buildEvaluationPrompt(config.category, scene.record);
        const promptHash = hashValue(prompt);
        const key = cacheKey({
          category: config.category,
          model,
          prompt,
          input: scene.record,
          settings: {
            promptMode: config.settings.promptMode,
            contextLength: config.settings.contextLength,
            temperature: config.settings.temperature,
            seed: config.settings.seed,
            maxOutputTokens: config.settings.maxOutputTokens,
            thinking: config.settings.thinking,
          },
          repetition,
        });
        const invocationId = `${scene.record.id}-${model.id}-r${repetition}`;
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
            inference = await invoke(config, model, scene, true);
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
          rawResponseEnvelope: inference.rawResponseEnvelope,
          parsedOutput: evaluated.parsedOutput,
          metrics: evaluated.metrics,
          performance: inference.performance,
          failure,
        };
        records.push(record);
        invocationFiles.push(await saveInvocation(runDirectory, record));
      }
    }

    if (config.settings.unloadAfterModel) await unloadOllamaModel(config, model.model);
  }

  const finishedAt = new Date().toISOString();
  await writeRunManifest(runDirectory, {
    runId,
    configFile: configPath,
    config,
    invocationFiles,
    startedAt,
    finishedAt,
  });
  const summary = await generateReports(runDirectory, records);
  return { runId, runDirectory, records, summary };
}

async function invoke(
  config: EvaluationConfig,
  model: EvaluationModel,
  scene: LoadedScene,
  capture: boolean,
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
  });
  return {
    rawOutput: capture ? result.rawOutput : "",
    rawThinking: capture ? result.rawThinking : undefined,
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

function classifyFailure(error: unknown): NonNullable<InvocationRecord["failure"]> {
  const message = messageOf(error);
  if (/timed out|abort/i.test(message)) return { code: "F03", message };
  if (/out of memory|allocate memory|oom/i.test(message)) return { code: "F02", message };
  if (/not found|pull model|model.*missing/i.test(message)) return { code: "F01", message };
  if (/Ollama returned|fetch failed|connect/i.test(message)) return { code: "F08", message };
  return { code: "F09", message };
}
