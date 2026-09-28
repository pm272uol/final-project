import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { DiagnosticRecord } from "./types.ts";

const storage = new AsyncLocalStorage<DiagnosticRecord[]>();
export const diagnosticsEnabled = () => process.env.WORKFLOW_DEBUG === "true";

// Capture only explicitly selected inputs/outputs, never config objects or headers.
// Hash binary media so report readers can identify reused assets without base64 dumps.
export function sanitizeDiagnostic(value: unknown, key = ""): unknown {
  if (/^(authorization|api[-_]?key|api[-_]?token|access[-_]?token|secret|password)$/i.test(key)) return "[redacted]";
  if (typeof value === "string") {
    const media = value.match(/^data:([^;,]+);base64,([\s\S]*)$/);
    const binary = media?.[2] ?? (/^(images|image)$/i.test(key) && /^[A-Za-z0-9+/=\r\n]+$/.test(value) ? value : undefined);
    if (binary !== undefined) {
      const bytes = Buffer.from(binary, "base64");
      return { mediaType: media?.[1] ?? "image", bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"), omitted: "Binary media" };
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(item => sanitizeDiagnostic(item, key));
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && typeof item !== "function")
      .map(([name, item]) => [name, sanitizeDiagnostic(item, name)]),
  );
  return value;
}

export function runWithDiagnostics<T>(records: DiagnosticRecord[], callback: () => T): T {
  return storage.run(records, callback);
}

type DiagnosticCapture = {
  input: (value: unknown) => void;
  output: (value: unknown) => void;
  finish: (error?: unknown) => void;
};

export function beginDiagnostic(operation: string, provider: string, model: string, input: unknown): DiagnosticCapture {
  const records = diagnosticsEnabled() ? storage.getStore() : undefined;
  if (!records) return { input: () => {}, output: () => {}, finish: () => {} };
  const start = performance.now();
  const record: DiagnosticRecord = {
    id: randomUUID(), operation, provider, model, startedAt: new Date().toISOString(),
    durationMs: 0, status: "running", input: sanitizeDiagnostic(input),
  };
  records.push(record);
  return {
    input: (value: unknown) => { record.input = sanitizeDiagnostic(value); },
    output: (value: unknown) => { record.output = sanitizeDiagnostic(value); },
    finish: (error?: unknown) => {
      record.durationMs = Math.round(performance.now() - start);
      record.status = error === undefined ? "success" : "error";
      if (error !== undefined) record.error = error instanceof Error ? error.message : String(error);
    },
  };
}

export async function diagnosticCall<T>(operation: string, provider: string, model: string, input: unknown, callback: () => Promise<T> | T): Promise<T> {
  const trace = beginDiagnostic(operation, provider, model, input);
  try {
    const output = await callback();
    trace.output(output);
    trace.finish();
    return output;
  } catch (error) { trace.finish(error); throw error; }
}

// Each request owns its records, including concurrent requests. Disabled responses
// retain their original shape and do not collect prompts or model output.
export function withDiagnosticResponse<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    if (!diagnosticsEnabled()) return handler(...args);
    const records: DiagnosticRecord[] = [];
    return runWithDiagnostics(records, async () => {
      const response = await handler(...args);
      const payload = await response.json();
      return new Response(JSON.stringify({ ...payload, diagnostics: records }), {
        status: response.status, headers: { ...Object.fromEntries(response.headers), "Cache-Control": "no-store", "X-Workflow-Debug": "true" },
      });
    });
  };
}
