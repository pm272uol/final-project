import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";

export function resolveFrom(baseFile: string, target: string) {
  return isAbsolute(target) ? target : resolve(dirname(baseFile), target);
}

export async function readJsonFile<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read JSON file ${path}: ${messageOf(error)}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid JSON structure in ${path}:\n${issues}`);
  }
  return result.data;
}

export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashValue(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function slug(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
