import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  datasetManifestSchema,
  sceneSchema,
  type EvaluationConfig,
  type Scene,
} from "./schemas.ts";
import { readJsonFile } from "./files.ts";

export type LoadedScene = {
  record: Scene;
  sourcePath: string;
  audioPath?: string;
  referenceImagePath?: string;
};

export async function loadDataset(config: EvaluationConfig) {
  const manifest = await readJsonFile(config.dataset, datasetManifestSchema);
  const selected = new Set(config.sceneIds ?? manifest.scenes.map(sceneIdFromPath));
  const scenes: LoadedScene[] = [];

  for (const relativeScenePath of manifest.scenes) {
    const sourcePath = resolve(dirname(config.dataset), relativeScenePath);
    const record = await readJsonFile(sourcePath, sceneSchema);
    if (!selected.has(record.id)) continue;
    const sceneDirectory = dirname(sourcePath);
    scenes.push({
      record,
      sourcePath,
      audioPath: record.assets.audio ? resolve(sceneDirectory, record.assets.audio) : undefined,
      referenceImagePath: record.assets.referenceImage
        ? resolve(sceneDirectory, record.assets.referenceImage)
        : undefined,
    });
  }

  const missing = [...selected].filter((id) => !scenes.some((scene) => scene.record.id === id));
  if (missing.length) throw new Error(`Dataset does not contain selected scenes: ${missing.join(", ")}`);
  return { manifest, scenes };
}

export async function inspectRequiredAssets(config: EvaluationConfig, scenes: LoadedScene[]) {
  const problems: string[] = [];
  for (const scene of scenes) {
    const path = config.category === "vlm" ? scene.referenceImagePath : undefined;
    if (!path) {
      if (config.category === "vlm") problems.push(`${scene.record.id}: reference image is not configured`);
      continue;
    }
    try {
      await access(path);
    } catch {
      problems.push(`${scene.record.id}: missing ${path}`);
    }
  }
  return problems;
}

function sceneIdFromPath(path: string) {
  return path.match(/SCENE-\d{2}/)?.[0] ?? path;
}
