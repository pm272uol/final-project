import { resolve } from "node:path";
import { evaluationConfigSchema, type EvaluationConfig } from "./schemas.ts";
import { readJsonFile, resolveFrom } from "./files.ts";

export async function loadConfig(configArgument: string) {
  const configPath = resolve(configArgument);
  const config = await readJsonFile(configPath, evaluationConfigSchema);
  return {
    configPath,
    config: {
      ...config,
      dataset: resolveFrom(configPath, config.dataset),
      modelStore: config.modelStore ? resolveFrom(configPath, config.modelStore) : undefined,
      outputRoot: resolveFrom(configPath, config.outputRoot),
      cacheRoot: resolveFrom(configPath, config.cacheRoot),
    } satisfies EvaluationConfig,
  };
}
