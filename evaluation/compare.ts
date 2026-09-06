import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getLLMConfig } from "../lib/llm/config.ts";
import { createLLMProvider } from "../lib/llm/create-provider.ts";
import { LLMStoryboardProvider } from "../lib/providers/llmStoryboardProvider.ts";
import { storyboardInputSchema } from "../lib/storyboardSchema.ts";
import type { LLMRunMetrics } from "../lib/llm/types.ts";
const args = process.argv.slice(2);
if (
  args.length !== 2 ||
  args[0] !== "--provider" ||
  !["ollama", "vercel"].includes(args[1])
) {
  console.error("Usage: npm run evaluate -- --provider ollama|vercel");
  process.exit(1);
}
const root = fileURLToPath(new URL(".", import.meta.url));
const config = getLLMConfig({ ...process.env, LLM_PROVIDER: args[1] });
const llm = createLLMProvider(config);
const metrics: LLMRunMetrics[] = [];
llm.metricsSink = (record) => metrics.push(record);
const planner = new LLMStoryboardProvider(llm);
const caseSchema = z.object({
  id: z.string(),
  input: storyboardInputSchema,
  expectedProperties: z.array(z.string()),
});
const cases = await Promise.all(
  (await readdir(join(root, "cases")))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map(async (name) =>
      caseSchema.parse(
        JSON.parse(await readFile(join(root, "cases", name), "utf8")),
      ),
    ),
);
const startedAt = new Date().toISOString();
const results: unknown[] = [];
const outputDirectory = join(root, "results", "comparison");
await mkdir(outputDirectory, { recursive: true });
const outputPath = join(
  outputDirectory,
  `${config.provider}-${config.model.replace(/[^a-zA-Z0-9-]/g, "-")}-${startedAt.replace(/[:.]/g, "-")}.json`,
);
for (const test of cases) {
  const started = performance.now();
  try {
    const result = await planner.generate(test.input);
    const missingProperties = test.expectedProperties.filter(
      (key) => !(key in result.storyboard),
    );
    const success = missingProperties.length === 0;
    if (!success) process.exitCode = 1;
    results.push({
      case: test.id,
      durationMs: Math.round(performance.now() - started),
      success,
      missingProperties,
      output: result.storyboard,
      metadata: result.metadata,
    });
  } catch {
    process.exitCode = 1;
    results.push({
      case: test.id,
      durationMs: Math.round(performance.now() - started),
      success: false,
      error: metrics.at(-1)?.error ?? "GENERATION_FAILED",
    });
  }
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        provider: config.provider,
        model: config.model,
        deployment: config.provider === "ollama" ? "local machine" : "cloud",
        startedAt,
        methodology:
          "Deployment environment and model scale both differ. This comparison does not isolate cloud versus local performance. Quality requires manual review of exported outputs.",
        settings: {
          timeoutMs: config.timeoutMs,
          temperature: 0.2,
          pricing: config.pricing,
        },
        cases,
        tests: results,
        metrics,
      },
      null,
      2,
    ) + "\n",
  );
  console.info(`${test.id}: recorded`);
}
console.info(`Results: ${outputPath}`);
