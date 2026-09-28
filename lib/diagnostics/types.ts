export type DiagnosticRecord = {
  id: string;
  operation: string;
  provider: string;
  model: string;
  startedAt: string;
  durationMs: number;
  status: "running" | "success" | "error";
  input: unknown;
  output?: unknown;
  error?: string;
};

export function diagnosticPrompts(input: unknown): { role: string; content: string }[] {
  if (!input || typeof input !== "object") return [];
  if ("messages" in input && Array.isArray(input.messages)) {
    return input.messages.filter((message): message is { role: string; content: string } =>
      message && typeof message.role === "string" && typeof message.content === "string");
  }
  if ("prompt" in input && typeof input.prompt === "string") return [{ role: "prompt", content: input.prompt }];
  if ("input" in input) return diagnosticPrompts(input.input);
  return [];
}

export function diagnosticsMarkdown(records: DiagnosticRecord[]) {
  const fence = (value: unknown, plainText = false) => {
    const content = plainText ? String(value) : JSON.stringify(value, null, 2) ?? "null";
    const delimiter = "`".repeat(Math.max(3, ...Array.from(content.matchAll(/`+/g), match => match[0].length + 1)));
    return `${delimiter}${plainText ? "text" : "json"}\n${content}\n${delimiter}`;
  };
  return ["# Workflow model diagnostics", "Binary media is represented by metadata. Mock records are deterministic placeholders, not model inference.",
    ...records.map((record, index) => [
      `## ${index + 1}. ${record.operation}`,
      `Provider: ${record.provider} | Model: ${record.model} | Status: ${record.status}`,
      `Started: ${record.startedAt} | Duration: ${record.durationMs} ms | ID: ${record.id}`,
      ...diagnosticPrompts(record.input).flatMap(prompt => [`### ${prompt.role === "prompt" ? "Prompt" : `${prompt.role} prompt`}`, fence(prompt.content, true)]),
      "### Input and prompts", fence(record.input),
      "### Output", fence(record.output ?? null),
      ...(record.error ? ["### Error", fence(record.error)] : []),
    ].join("\n\n")),
  ].join("\n\n");
}
