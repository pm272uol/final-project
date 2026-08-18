import type { EvaluationConfig } from "./schemas.ts";

export type ModelSelection = {
  include: string[];
  exclude: string[];
};

export function parseModelSelectionFlags(flags: string[]): ModelSelection {
  const selection: ModelSelection = { include: [], exclude: [] };

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    const target = flag === "--include-model"
      ? selection.include
      : flag === "--exclude-model"
        ? selection.exclude
        : undefined;
    if (!target) continue;

    const value = flags[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires one or more model IDs.`);
    const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
    if (!ids.length) throw new Error(`${flag} requires one or more model IDs.`);
    target.push(...ids);
    index += 1;
  }

  return selection;
}

export function selectModels(
  config: EvaluationConfig,
  selection: ModelSelection,
): EvaluationConfig {
  const configuredIds = new Set(config.models.map((model) => model.id));
  const requestedIds = [...selection.include, ...selection.exclude];
  const unknownIds = [...new Set(requestedIds.filter((id) => !configuredIds.has(id)))];
  if (unknownIds.length) {
    throw new Error(
      `Unknown model ID${unknownIds.length === 1 ? "" : "s"}: ${unknownIds.join(", ")}. ` +
      `Configured IDs: ${[...configuredIds].join(", ")}.`,
    );
  }

  const included = new Set(selection.include);
  const excluded = new Set(selection.exclude);
  const models = config.models.filter((model) =>
    (!included.size || included.has(model.id)) && !excluded.has(model.id)
  );
  if (!models.length) throw new Error("Model selection excluded every configured model.");

  return { ...config, models };
}
