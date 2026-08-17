#!/usr/bin/env node
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { loadConfig } from "../core/config.ts";
import { inspectRequiredAssets, loadDataset } from "../core/dataset.ts";
import { messageOf, readJsonFile, writeJson } from "../core/files.ts";
import { evaluateOutput } from "../core/output.ts";
import { generateReports, loadInvocationRecords } from "../core/report.ts";
import { runEvaluation } from "../core/run.ts";
import { listOllamaModels } from "../runners/ollama.ts";
import { sceneSchema } from "../core/schemas.ts";

const [, , command, argument, ...flags] = process.argv;

try {
  if (command === "doctor") {
    await doctor(argument ?? "evaluation/configs/stage1/llm.json");
  } else if (command === "run") {
    if (!argument) usage("run requires a configuration file.");
    await run(argument, flags.includes("--force"));
  } else if (command === "report") {
    if (!argument) usage("report requires a run directory.");
    const runDirectory = resolve(argument);
    const records = await loadInvocationRecords(runDirectory);
    const scenes = await readJsonFile(
      join(runDirectory, "dataset-snapshot.json"),
      z.array(sceneSchema),
    );
    const rescored = records.map((record) => {
      const scene = scenes.find((item) => item.id === record.testId);
      if (!scene) throw new Error(`Dataset snapshot has no ${record.testId}.`);
      const evaluation = evaluateOutput(record.category, scene, record.rawOutput);
      return { ...record, parsedOutput: evaluation.parsedOutput, metrics: evaluation.metrics };
    });
    await writeJson(join(runDirectory, "rescored-metrics.json"), rescored.map((record) => ({
      invocationId: record.invocationId,
      metrics: record.metrics,
    })));
    const summaries = await generateReports(runDirectory, rescored);
    console.log(`Regenerated report for ${records.length} invocations across ${summaries.length} models.`);
  } else {
    usage();
  }
} catch (error) {
  console.error(`Evaluation failed: ${messageOf(error)}`);
  process.exitCode = 1;
}

async function run(configArgument: string, force: boolean) {
  const { config, configPath } = await loadConfig(configArgument);
  const { scenes } = await loadDataset(config);
  console.log(`Starting ${config.id}: ${config.models.length} models × ${scenes.length} scenes × ${config.settings.measuredRuns} measured runs.`);
  const result = await runEvaluation({
    config,
    configPath,
    scenes,
    force,
    onStatus: (message) => console.log(message),
  });
  console.log(`Completed ${result.records.length} invocations.`);
  console.log(`Results: ${result.runDirectory}`);
}

async function doctor(configArgument: string) {
  const { config } = await loadConfig(configArgument);
  const { scenes } = await loadDataset(config);
  const checks: Array<{ label: string; status: "PASS" | "FAIL"; detail: string }> = [];

  if (config.modelStore) {
    try {
      await access(config.modelStore);
      checks.push({ label: "Model store", status: "PASS", detail: config.modelStore });
    } catch {
      checks.push({ label: "Model store", status: "FAIL", detail: `Unavailable: ${config.modelStore}` });
    }
  }

  let installed: Awaited<ReturnType<typeof listOllamaModels>> = [];
  try {
    installed = await listOllamaModels(config.provider.baseUrl);
    checks.push({ label: "Ollama API", status: "PASS", detail: `${installed.length} models visible` });
  } catch (error) {
    checks.push({ label: "Ollama API", status: "FAIL", detail: messageOf(error) });
  }

  for (const model of config.models) {
    const installedModel = installed.find((item) => item.name === model.model);
    const present = Boolean(installedModel);
    const digestMismatch = Boolean(
      model.version && installedModel?.digest && !installedModel.digest.startsWith(model.version),
    );
    const requiredCapability = config.category === "vlm" ? "vision" : "completion";
    const capabilityMissing = Boolean(
      installedModel && !installedModel.capabilities?.includes(requiredCapability),
    );
    const supportsThinking = installedModel?.capabilities?.includes("thinking") ?? false;
    const thinkingMissing = supportsThinking && !model.thinking;
    const unsupportedThinking = !supportsThinking && Boolean(model.thinking);
    const invalidGptOssThinking = model.model.startsWith("gpt-oss") &&
      !["low", "medium", "high"].includes(String(model.thinking));
    checks.push({
      label: model.displayName,
      status: present && !digestMismatch && !capabilityMissing && !thinkingMissing &&
          !unsupportedThinking && !invalidGptOssThinking
        ? "PASS"
        : "FAIL",
      detail: !present
        ? `${model.model} requires download`
        : digestMismatch
          ? `expected ${model.version}, found ${installedModel?.digest}`
          : capabilityMissing
            ? `${model.model} lacks required ${requiredCapability} capability`
          : thinkingMissing
            ? `${model.model} supports thinking but it is not enabled`
            : unsupportedThinking
              ? `${model.model} does not support configured thinking mode`
              : invalidGptOssThinking
                ? `${model.model} requires thinking low, medium, or high`
                : `${model.model} @ ${installedModel?.digest?.slice(0, 12) ?? "unknown digest"}; thinking ${supportsThinking ? String(model.thinking) : "not supported"}`,
    });
  }
  const assetProblems = await inspectRequiredAssets(config, scenes);
  checks.push({
    label: "Dataset",
    status: assetProblems.length ? "FAIL" : "PASS",
    detail: assetProblems.length ? assetProblems.join("; ") : `${scenes.length} scenes ready`,
  });

  const width = Math.max(...checks.map((check) => check.label.length));
  for (const check of checks) {
    console.log(`${check.status.padEnd(4)}  ${check.label.padEnd(width)}  ${check.detail}`);
  }
  if (checks.some((check) => check.status === "FAIL")) process.exitCode = 1;
}

function usage(error?: string): never {
  if (error) console.error(error);
  console.error(`Usage:
  npm run eval -- doctor [config.json]
  npm run eval -- run <config.json> [--force]
  npm run eval -- report <run-directory>`);
  process.exit(error ? 1 : 0);
}
