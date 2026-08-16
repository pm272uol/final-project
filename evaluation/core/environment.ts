import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeJson } from "./files.ts";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export async function captureEnvironment(
  runDirectory: string,
  ollamaModels: unknown[],
  configuredModelStore?: string,
) {
  const [macos, hardware, ollamaVersion] = await Promise.all([
    safeExec("sw_vers", []),
    safeExec("system_profiler", ["SPHardwareDataType"]),
    safeExec("ollama", ["--version"]),
  ]);
  const environment = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    macos,
    hardware: sanitiseHardware(hardware),
    ollamaVersion,
    ollamaModels,
    modelStore: configuredModelStore ?? process.env.OLLAMA_MODELS ?? null,
  };
  await writeJson(join(runDirectory, "environment.json"), environment);
  return environment;
}

function sanitiseHardware(value: string) {
  return value
    .split("\n")
    .filter((line) => !/Serial Number|Hardware UUID|Provisioning UDID/i.test(line))
    .join("\n");
}

async function safeExec(command: string, args: string[]) {
  try {
    return (await execFileAsync(command, args, { timeout: 10_000 })).stdout.trim();
  } catch (error) {
    return `Unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}
