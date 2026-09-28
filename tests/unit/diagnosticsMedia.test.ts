import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runWithDiagnostics } from "@/lib/diagnostics/server";
import type { DiagnosticRecord } from "@/lib/diagnostics/types";
import { ReplicateImageGenerationService } from "@/lib/image-generation/replicateImageGeneration.service";
import { transcribe } from "@/lib/transcription/service";
import { generateCloudClip } from "@/lib/video-generation/replicate";

beforeEach(() => vi.stubEnv("WORKFLOW_DEBUG", "true"));
afterEach(() => vi.unstubAllEnvs());

it("captures the final image request after provider prompt rewriting", async () => {
  const records: DiagnosticRecord[] = [];
  const transport = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ latest_version: { id: "model-version" } }))
    .mockResolvedValueOnce(Response.json({ id: "prediction", status: "succeeded", output: ["https://replicate.delivery/frame.png"] }));
  const service = new ReplicateImageGenerationService({ apiToken: "private-api-key", model: "black-forest-labs/flux-2-klein-4b", timeoutMs: 1000, fetchImplementation: transport });
  await runWithDiagnostics(records, () => service.generateImage("A moonlit street", { negativePrompt: "text", seed: 42 }));
  const sent = JSON.parse(String(transport.mock.calls[1][1]?.body));
  expect(records[0]).toMatchObject({ status: "success", input: sent, output: { status: "succeeded", output: ["https://replicate.delivery/frame.png"] } });
  expect(sent.input.prompt).toContain("Avoid: text");
  expect(JSON.stringify(records)).not.toContain("private-api-key");
});

it("captures transcription text and audio metadata without credentials or audio bytes", async () => {
  vi.stubEnv("GROQ_API_KEY", "private-groq-key");
  const records: DiagnosticRecord[] = [];
  const result = await runWithDiagnostics(records, () => transcribe(new File(["audio"], "note.wav", { type: "audio/wav" }), "groq", new AbortController().signal,
    async () => Response.json({ text: "The astronaut enters the station." })));
  expect(records[0]).toMatchObject({ provider: "groq", model: "whisper-large-v3-turbo", status: "success",
    input: { file: { name: "note.wav", mediaType: "audio/wav", bytes: 5 } }, output: { text: result.text } });
  expect(JSON.stringify(records)).not.toContain("private-groq-key");
});

it("captures each video shot with the actual model settings and output URL", async () => {
  vi.stubEnv("REPLICATE_API_TOKEN", "private-video-key");
  const records: DiagnosticRecord[] = [];
  const result = await runWithDiagnostics(records, () => generateCloudClip({ panelNumber: 3, prompt: "Slow camera push", image: "data:image/jpeg;base64,aGVsbG8=" },
    "preview", 42, new AbortController().signal,
    async () => Response.json({ id: "prediction", status: "succeeded", output: "https://replicate.delivery/clip.mp4" })));
  expect(records[0]).toMatchObject({ operation: "video_generation_panel_3", provider: "replicate", status: "success",
    input: { input: { prompt: "Slow camera push", seed: 42, image: { mediaType: "image/jpeg", bytes: 5 } } }, output: { output: result } });
  expect(JSON.stringify(records)).not.toContain("private-video-key");
  expect(JSON.stringify(records)).not.toContain("aGVsbG8=");
});
