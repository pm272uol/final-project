import type { DiagnosticRecord } from "./types";

let records: DiagnosticRecord[] = [];
const listeners = new Set<() => void>();
const clearedIds = new Set<string>();
export const getDiagnostics = () => records;
export function subscribeDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function collectDiagnostics(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("diagnostics" in payload) || !Array.isArray(payload.diagnostics)) return;
  const incoming = payload.diagnostics.filter((item): item is DiagnosticRecord =>
    item && typeof item.id === "string" && !clearedIds.has(item.id) && typeof item.operation === "string" && typeof item.startedAt === "string");
  if (!incoming.length) return;
  const merged = new Map(records.map(item => [item.id, item]));
  incoming.forEach(item => merged.set(item.id, item));
  records = [...merged.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  listeners.forEach(listener => listener());
}
export function clearDiagnostics() {
  records.forEach(record => clearedIds.add(record.id));
  records = [];
  listeners.forEach(listener => listener());
}

export async function diagnosticFetch(...args: Parameters<typeof fetch>): Promise<Response> {
  const response = await fetch(...args);
  if (response.headers.get("x-workflow-debug") === "true" && response.headers.get("content-type")?.includes("application/json")) {
    try { collectDiagnostics(await response.clone().json()); } catch { /* Diagnostics must not break the workflow. */ }
  }
  return response;
}
