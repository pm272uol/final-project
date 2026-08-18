import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { loadConfig } from "@/evaluation/core/config";
import { loadDataset } from "@/evaluation/core/dataset";
import { evaluateOutput } from "@/evaluation/core/output";
import { runEvaluation } from "@/evaluation/core/run";
import type { InvocationRecord } from "@/evaluation/core/schemas";
import { invocationFilename } from "@/evaluation/core/storage";
import { runOllama } from "@/evaluation/runners/ollama";

vi.mock("@/evaluation/runners/ollama", () => ({
  listOllamaModels: vi.fn(async () => [{
    name: "qwen3.5:9b",
    digest: "6488c96fa5fa",
    capabilities: ["completion", "thinking"],
  }]),
  runOllama: vi.fn(),
  unloadOllamaModel: vi.fn(async () => undefined),
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.mocked(runOllama).mockReset();
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("evaluation resume", () => {
  it("reconstructs missing state from raw records and runs only unfinished invocations", async () => {
    const fixture = await createInterruptedRun();
    const storyboard = createMockStoryboard(fixture.scene.record.storyboardInput);
    vi.mocked(runOllama).mockResolvedValue({
      rawOutput: JSON.stringify(storyboard),
      rawThinking: "reasoning",
      outputChannel: "response",
      rawResponseEnvelope: { model: "qwen3.5:9b", done: true },
      actualModel: "qwen3.5:9b",
      wallTimeMs: 25,
    });

    const result = await runEvaluation({
      config: fixture.config,
      configPath: fixture.configPath,
      scenes: [fixture.scene],
      force: true,
      resumeDirectory: fixture.runDirectory,
    });

    expect(runOllama).toHaveBeenCalledTimes(1);
    expect(result.completedBeforeResume).toBe(1);
    expect(result.records.map((record) => record.invocationId)).toEqual([
      "SCENE-01-qwen35-9b-r1",
      "SCENE-01-qwen35-9b-r2",
    ]);
    const state = JSON.parse(await readFile(join(fixture.runDirectory, "state.json"), "utf8"));
    expect(state).toMatchObject({
      status: "completed",
      totalInvocations: 2,
      remainingInvocations: 0,
      resumeCount: 1,
      pendingInvocationIds: [],
      completedInvocationIds: [
        "SCENE-01-qwen35-9b-r1",
        "SCENE-01-qwen35-9b-r2",
      ],
    });
    expect(JSON.parse(await readFile(join(fixture.runDirectory, "manifest.json"), "utf8")))
      .toMatchObject({ runId: basename(fixture.runDirectory) });
  });

  it("refuses to combine incompatible experiment configurations", async () => {
    const fixture = await createInterruptedRun();
    const incompatible = {
      ...fixture.config,
      settings: { ...fixture.config.settings, measuredRuns: 3 },
    };

    await expect(runEvaluation({
      config: incompatible,
      configPath: fixture.configPath,
      scenes: [fixture.scene],
      force: true,
      resumeDirectory: fixture.runDirectory,
    })).rejects.toThrow("saved experiment configuration does not match");
    expect(runOllama).not.toHaveBeenCalled();
  });
});

async function createInterruptedRun() {
  const root = await mkdtemp(join(tmpdir(), "evaluation-resume-"));
  temporaryDirectories.push(root);
  const runDirectory = join(root, "2026-08-18T12-00-00-000Z-llm-smoke-local");
  await mkdir(join(runDirectory, "raw"), { recursive: true });
  await mkdir(join(runDirectory, "reviews"), { recursive: true });

  const loaded = await loadConfig("evaluation/configs/smoke/llm.json");
  const dataset = await loadDataset(loaded.config);
  const scene = dataset.scenes[0]!;
  const config = {
    ...loaded.config,
    modelStore: undefined,
    outputRoot: root,
    cacheRoot: join(root, "cache"),
    settings: {
      ...loaded.config.settings,
      warmupRuns: 0,
      measuredRuns: 2,
      useCache: false,
      unloadAfterModel: false,
    },
  };
  const configPath = join(root, "resume-config.json");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await writeFile(join(runDirectory, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await writeFile(
    join(runDirectory, "dataset-snapshot.json"),
    `${JSON.stringify([scene.record], null, 2)}\n`,
    "utf8",
  );

  const storyboard = createMockStoryboard(scene.record.storyboardInput);
  const rawOutput = JSON.stringify(storyboard);
  const evaluated = evaluateOutput("llm", scene.record, rawOutput);
  const runId = basename(runDirectory);
  const record: InvocationRecord = {
    version: 1,
    runId,
    invocationId: "SCENE-01-qwen35-9b-r1",
    testId: "SCENE-01",
    category: "llm",
    stage: "stage1",
    repetition: 1,
    model: { ...config.models[0]!, version: "6488c96fa5fa" },
    provider: "ollama",
    promptMode: config.settings.promptMode,
    promptHash: "existing-prompt-hash",
    settings: config.settings,
    cache: { key: "existing-cache-key", hit: false },
    startedAt: "2026-08-18T12:00:00.000Z",
    finishedAt: "2026-08-18T12:00:01.000Z",
    input: { storyboardInput: scene.record.storyboardInput },
    rawOutput,
    rawThinking: "reasoning",
    outputChannel: "response",
    rawResponseEnvelope: { model: "qwen3.5:9b", done: true },
    parsedOutput: evaluated.parsedOutput,
    metrics: evaluated.metrics,
    performance: { wallTimeMs: 1_000 },
  };
  await writeFile(
    join(runDirectory, "raw", invocationFilename(record.testId, record.model.id, record.repetition)),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );

  return { config, configPath, runDirectory, scene };
}
