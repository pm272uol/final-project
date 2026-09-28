import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { diagnosticCall, runWithDiagnostics, sanitizeDiagnostic, withDiagnosticResponse } from "@/lib/diagnostics/server";
import { diagnosticsMarkdown, type DiagnosticRecord } from "@/lib/diagnostics/types";
import { clearDiagnostics, collectDiagnostics, getDiagnostics } from "@/lib/diagnostics/client";
import { OllamaProvider } from "@/lib/llm/providers/ollama-provider";

afterEach(() => { vi.unstubAllEnvs(); clearDiagnostics(); });

describe("workflow diagnostics", () => {
  it("requires the exact server opt-in and leaves disabled responses unchanged", async () => {
    for (const flag of [undefined, "false", "1", "true"]) {
      vi.stubEnv("WORKFLOW_DEBUG", flag);
      const response = await withDiagnosticResponse(async () => {
        await diagnosticCall("test", "mock", "test", { prompt: "private prompt" }, () => "output");
        return Response.json({ ok: true });
      })();
      const body = await response.json();
      if (flag === "true") {
        expect(body.diagnostics).toHaveLength(1);
        expect(response.headers.get("x-workflow-debug")).toBe("true");
      } else {
        expect(body).toEqual({ ok: true });
        expect(response.headers.get("x-workflow-debug")).toBeNull();
      }
    }
  });

  it("isolates overlapping requests and preserves failure status", async () => {
    vi.stubEnv("WORKFLOW_DEBUG", "true");
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const handler = withDiagnosticResponse(async (name: string) => {
      try {
        await diagnosticCall(name, "test", "model", { name }, async () => {
          if (name === "first") { await waiting; throw new Error("Provider unavailable"); }
          release();
          return { name };
        });
        return Response.json({ ok: true });
      } catch { return Response.json({ error: "Failed" }, { status: 502 }); }
    });
    const [first, second] = await Promise.all([handler("first"), handler("second")]);
    expect(first.status).toBe(502);
    const a = await first.json();
    const b = await second.json();
    expect(a.diagnostics).toEqual([expect.objectContaining({ operation: "first", status: "error", error: "Provider unavailable" })]);
    expect(b.diagnostics).toEqual([expect.objectContaining({ operation: "second", status: "success", output: { name: "second" } })]);
  });

  it("keeps full prompts while fingerprinting binary media and excluding credential fields", () => {
    const prompt = "A detailed scene ".repeat(2000);
    const output = sanitizeDiagnostic({ prompt, images: ["aGVsbG8="], imageUrl: "data:image/png;base64,aGVsbG8=", authorization: "Bearer hidden", apiKey: "hidden" });
    expect(output).toMatchObject({ prompt, authorization: "[redacted]", apiKey: "[redacted]",
      images: [{ bytes: 5, sha256: expect.any(String) }], imageUrl: { mediaType: "image/png", bytes: 5 } });
    expect(JSON.stringify(output)).not.toContain("aGVsbG8=");
    expect(JSON.stringify(output)).not.toContain("hidden");
  });

  it("records invalid output and correction prompts as separate model attempts", async () => {
    vi.stubEnv("WORKFLOW_DEBUG", "true");
    const records: DiagnosticRecord[] = [];
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ model: "test-model", response: '{"wrong":true}', done: true }))
      .mockResolvedValueOnce(Response.json({ model: "test-model", response: '{"answer":"fixed"}', done: true }));
    const llm = new OllamaProvider({ baseUrl: "http://localhost", model: "test-model", timeoutMs: 1000, fetchImplementation: fetcher });
    llm.metricsSink = vi.fn();
    const result = await runWithDiagnostics(records, () => llm.generateStructured({
      operation: "scene_generation", messages: [{ role: "user", content: "Original report prompt" }],
      schema: z.object({ answer: z.string() }), repairAttempts: 1,
    }));
    expect(result.data).toEqual({ answer: "fixed" });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ status: "error", output: { text: '{"wrong":true}' }, input: { attempt: 1, schema: { type: "object" } } });
    expect(records[1]).toMatchObject({ status: "success", output: { text: '{"answer":"fixed"}', data: { answer: "fixed" } }, input: { attempt: 2 } });
    expect(JSON.stringify(records[1].input)).toContain("The previous JSON failed validation");
    expect(JSON.stringify(records[1].input)).toContain("Original report prompt");
    expect(diagnosticsMarkdown(records)).toContain("### Input and prompts");
  });

  it("updates polled video records by ID instead of duplicating them", () => {
    const record: DiagnosticRecord = { id: "video-1", operation: "video", provider: "replicate", model: "wan", startedAt: "2026-09-26T12:00:00Z", durationMs: 0, status: "running", input: {} };
    collectDiagnostics({ diagnostics: [record] });
    collectDiagnostics({ diagnostics: [{ ...record, status: "success", output: "clip.mp4" }] });
    expect(getDiagnostics()).toEqual([{ ...record, status: "success", output: "clip.mp4" }]);
    clearDiagnostics();
    collectDiagnostics({ diagnostics: [record, { ...record, id: "video-2" }] });
    expect(getDiagnostics().map(item => item.id)).toEqual(["video-2"]);
  });
});
