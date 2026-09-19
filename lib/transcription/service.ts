import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { TranscriptionProvider, TranscriptionResult } from "./options";

export class TranscriptionError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
const responseSchema = z.object({ text: z.string().trim().min(1).max(50_000) });
// Bound local memory use in this single-server prototype.
let localBusy = false;
export async function transcribe(
  file: File,
  provider: TranscriptionProvider,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<TranscriptionResult> {
  const timeoutMs = Number(process.env.ASR_TIMEOUT_MS ?? 180000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) {
    throw new TranscriptionError("ASR_TIMEOUT_MS must be between 1 and 600000.", 503);
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = AbortSignal.any([signal, timeout]);
  const start = Date.now();
  try {
    combined.throwIfAborted();
    let payload: unknown;
    if (provider === "groq") {
      const key = process.env.GROQ_API_KEY?.trim();
      if (!key) throw new TranscriptionError("Groq transcription needs GROQ_API_KEY on the server.", 503);
      const body = new FormData();
      body.append("file", file, `voice-note${path.extname(file.name).toLowerCase()}`);
      body.append("model", "whisper-large-v3-turbo");
      body.append("language", "en");
      body.append("temperature", "0");
      body.append("response_format", "json");
      const response = await fetcher("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body, signal: combined,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new TranscriptionError("Groq rejected the server credentials or model access.", 503);
        if (response.status === 429) throw new TranscriptionError("Groq is rate limited. Try again shortly.", 429);
        throw new TranscriptionError("Groq could not transcribe this audio. Check the recording and try again.");
      }
      payload = await response.json();
    } else {
      payload = await transcribeLocal(file, combined);
    }
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) throw new TranscriptionError("No usable transcript was returned. Try a clearer recording.");
    return {
      text: parsed.data.text, provider, language: "en", durationMs: Date.now() - start,
      model: provider === "local" ? "mlx-community/whisper-large-v3-turbo" : "whisper-large-v3-turbo",
    };
  } catch (error) {
    if (signal.aborted) throw new TranscriptionError("Transcription cancelled.", 499);
    if (timeout.aborted) throw new TranscriptionError("Transcription timed out. Try a shorter recording.", 504);
    if (error instanceof TranscriptionError) throw error;
    throw new TranscriptionError(provider === "local"
      ? "Local transcription failed. Check the Python environment, mlx-whisper, FFmpeg and downloaded model. See the transcription setup guide."
      : "Groq transcription failed. Please try again.");
  }
}
async function transcribeLocal(file: File, signal: AbortSignal): Promise<unknown> {
  if (localBusy) throw new TranscriptionError("Another local transcription is running. Try again shortly.", 429);
  localBusy = true;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(tmpdir(), "concept-art-storyboard-orchestrator-audio-"));
    const audioPath = path.join(directory, `audio${path.extname(file.name).toLowerCase()}`);
    await writeFile(audioPath, Buffer.from(await file.arrayBuffer()), { mode: 0o600, signal });
    const output = await new Promise<string>((resolve, reject) => {
      execFile(process.env.ASR_PYTHON ?? path.join(process.cwd(), ".venv-asr/bin/python"),
        [path.join(process.cwd(), "scripts/transcribe.py"), audioPath],
        { signal, killSignal: "SIGKILL", maxBuffer: 1024 * 1024,
          env: { ...process.env, HF_HOME: process.env.HF_HOME ?? path.join(process.cwd(), ".cache/whisper"), HF_HUB_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1" } },
        (error, stdout) => error ? reject(error) : resolve(stdout));
    });
    return JSON.parse(output);
  } finally {
    try { if (directory) await rm(directory, { recursive: true, force: true }); }
    finally { localBusy = false; }
  }
}
