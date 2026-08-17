import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InvocationRecord } from "./schemas.ts";

export async function loadInvocationRecords(runDirectory: string) {
  const rawDirectory = join(runDirectory, "raw");
  const files = (await readdir(rawDirectory)).filter((file) => file.endsWith(".json")).sort();
  return Promise.all(files.map(async (file) =>
    JSON.parse(await readFile(join(rawDirectory, file), "utf8")) as InvocationRecord,
  ));
}

export async function generateReports(runDirectory: string, records: InvocationRecord[]) {
  const summaries = summariseRecords(records);
  await Promise.all([
    writeFile(join(runDirectory, "summary.csv"), toCsv(summaries), "utf8"),
    writeFile(join(runDirectory, "report.md"), toMarkdown(records[0]?.runId ?? "Evaluation", summaries), "utf8"),
    writeFile(join(runDirectory, "reviews", "human-review.md"), humanReview(records), "utf8"),
    writeFile(join(runDirectory, "review-key.json"), reviewKey(records), "utf8"),
  ]);
  return summaries;
}

export function summariseRecords(records: InvocationRecord[]) {
  const groups = Map.groupBy(records, (record) => record.model.id);
  return [...groups.entries()].map(([modelId, items]) => {
    const succeeded = items.filter((item) => !item.failure);
    return {
      modelId,
      displayName: items[0]?.model.displayName ?? modelId,
      execution: items[0]?.model.execution ?? "local",
      thinkingMode: describeThinkingMode(items[0]),
      thinkingJsonFallbackRate: average(items.map((item) =>
        item.outputChannel === "thinking_json_fallback" ? 1 : 0
      )),
      invocations: items.length,
      successRate: ratio(succeeded.length, items.length),
      jsonParseRate: average(items.map((item) => item.metrics.jsonParsed ? 1 : 0)),
      schemaValidity: average(items.map((item) => item.metrics.schemaValid ? 1 : 0)),
      completeness: average(items.map((item) => item.metrics.completeness)),
      entityRecall: average(items.map((item) => item.metrics.entityRecall).filter(isNumber)),
      attributeAccuracy: average(items.map((item) => item.metrics.attributeAccuracy).filter(isNumber)),
      relationshipAccuracy: average(items.map((item) => item.metrics.relationshipAccuracy).filter(isNumber)),
      instructionAdherence: average(items.map((item) => item.metrics.instructionAdherence).filter(isNumber)),
      panelCountRate: average(items.map((item) => item.metrics.panelCountCorrect).filter(isBoolean).map(Number)),
      deterministicScore: average(items.map((item) => item.metrics.deterministicEvaluationScore).filter(isNumber)),
      medianWallTimeMs: median(succeeded.map((item) => item.performance.wallTimeMs)),
      medianTokensPerSecond: median(succeeded.map((item) => item.performance.tokensPerSecond).filter(isNumber)),
      failures: items.length - succeeded.length,
    };
  }).sort((a, b) => a.modelId.localeCompare(b.modelId));
}

type Summary = ReturnType<typeof summariseRecords>[number];

function toCsv(summaries: Summary[]) {
  const headings: Array<keyof Summary> = [
    "modelId", "displayName", "execution", "thinkingMode", "thinkingJsonFallbackRate",
    "invocations", "successRate",
    "jsonParseRate", "schemaValidity", "completeness", "entityRecall",
    "attributeAccuracy", "relationshipAccuracy", "instructionAdherence", "panelCountRate",
    "deterministicScore", "medianWallTimeMs", "medianTokensPerSecond", "failures",
  ];
  return `${headings.join(",")}\n${summaries.map((item) =>
    headings.map((heading) => csvCell(item[heading])).join(","),
  ).join("\n")}\n`;
}

function toMarkdown(runId: string, summaries: Summary[]) {
  const rows = summaries.map((item) =>
    `| ${item.displayName} | ${item.execution} | ${item.thinkingMode} | ${percent(item.thinkingJsonFallbackRate)} | ${percent(item.successRate)} | ${percent(item.schemaValidity)} | ${percent(item.completeness)} | ${percent(item.entityRecall)} | ${percent(item.instructionAdherence)} | ${formatNumber(item.medianWallTimeMs)} | ${item.failures} |`,
  ).join("\n");
  return `# Evaluation report: ${runId}\n\n` +
    `Performance values are grouped by execution location and must not be compared as model-only inference speed across local and cloud environments.\n\n` +
    `| Model | Execution | Thinking | Thinking JSON fallback | Success | Schema valid | Completeness | Entity recall | Instruction adherence | Median wall time (ms) | Failures |\n` +
    `|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n`;
}

function describeThinkingMode(record: InvocationRecord | undefined) {
  if (!record) return "not configured";
  const legacyMode = (record.settings as unknown as { thinking?: boolean }).thinking;
  const mode = record.model.thinking ?? legacyMode;
  if (mode === true) return "enabled";
  if (mode === false) return "disabled";
  return mode ?? "not configured";
}

function humanReview(records: InvocationRecord[]) {
  const sections = records.map((record, index) => `## REVIEW-${String(index + 1).padStart(3, "0")}\n\n` +
    `- Scene: ${record.testId}\n` +
    `- Model identity: hidden until scoring is complete\n\n` +
    `### Source input\n\n\`\`\`json\n${JSON.stringify(record.input, null, 2)}\n\`\`\`\n\n` +
    `### Candidate output\n\n\`\`\`json\n${record.rawOutput}\n\`\`\`\n\n` +
    `| Criterion | Score |\n|---|---:|\n` +
    `| Source fidelity | /5 |\n| Instruction adherence | /5 |\n` +
    `| Hallucination avoidance | /5 |\n| Shot quality | /5 |\n` +
    `| Prompt usefulness | /5 |\n| Cross-shot consistency | /5 |\n\n` +
    `Comments:\n\n`);
  return `# Blind human review\n\nDo not open raw records until the scores are complete.\n\n${sections.join("\n")}`;
}

function reviewKey(records: InvocationRecord[]) {
  return `${JSON.stringify(Object.fromEntries(records.map((record, index) => [
    `REVIEW-${String(index + 1).padStart(3, "0")}`,
    { invocationId: record.invocationId, model: record.model },
  ])), null, 2)}\n`;
}

function average(values: number[]) {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2);
}

function ratio(numerator: number, denominator: number) {
  return denominator ? round(numerator / denominator) : null;
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function percent(value: number | null) {
  return value === null ? "N/A" : `${Math.round(value * 1000) / 10}%`;
}

function formatNumber(value: number | null) {
  return value === null ? "N/A" : String(value);
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}
