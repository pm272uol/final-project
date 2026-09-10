import { afterEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { transcribe } from "@/lib/transcription/service";
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
const audio = () => new File(["test audio"], "private-name.wav", { type: "audio/wav" });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("Whisper providers", () => {
  it("sends English Turbo multipart to Groq without exposing the original filename", async () => {
    vi.stubEnv("GROQ_API_KEY", "secret-key");
    const fetcher = vi.fn(async () => Response.json({ text: " A film scene. " }));
    const result = await transcribe(audio(), "groq", new AbortController().signal, fetcher);
    expect(result).toMatchObject({ text: "A film scene.", provider: "groq", model: "whisper-large-v3-turbo", language: "en" });
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const form = options.body as FormData;
    expect(form.get("language")).toBe("en");
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect((form.get("file") as File).name).toBe("voice-note.wav");
  });
  it.each([[401, 503], [403, 503], [429, 429], [500, 502]])("sanitizes Groq status %s", async (status, expected) => {
    vi.stubEnv("GROQ_API_KEY", "secret-key");
    await expect(transcribe(audio(), "groq", new AbortController().signal,
      vi.fn(async () => new Response("secret-key private provider details", { status }))))
      .rejects.toMatchObject({ status: expected });
  });
  it.each([{ text: " " }, { text: 123 }, {}])("rejects empty or malformed content", async payload => {
    vi.stubEnv("GROQ_API_KEY", "secret-key");
    await expect(transcribe(audio(), "groq", new AbortController().signal,
      vi.fn(async () => Response.json(payload)))).rejects.toThrow("No usable transcript");
  });
  it("does not call Groq without credentials", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const fetcher = vi.fn();
    await expect(transcribe(audio(), "groq", new AbortController().signal, fetcher)).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("honors cancellation before sending audio", async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn();
    await expect(transcribe(audio(), "groq", controller.signal, fetcher)).rejects.toMatchObject({ status: 499 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("times out stalled cloud requests", async () => {
    vi.stubEnv("GROQ_API_KEY", "key"); vi.stubEnv("ASR_TIMEOUT_MS", "10");
    const fetcher: typeof fetch = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    await expect(transcribe(audio(), "groq", new AbortController().signal, fetcher)).rejects.toMatchObject({ status: 504 });
  });
  it.each([false, true])("removes local temporary audio on failure=%s and never calls cloud", async fail => {
    let audioPath = "";
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const argv = args[1] as string[];
      audioPath = argv[1];
      const options = args[2] as { env: Record<string, string> };
      expect(options.env.HF_HUB_OFFLINE).toBe("1");
      const callback = args[3] as (error: Error | null, stdout: string) => void;
      void readFile(audioPath, "utf8").then(contents => {
        expect(contents).toBe("test audio");
        callback(fail ? new Error("private path") : null, JSON.stringify({ text: "Local scene." }));
      });
      return {} as ReturnType<typeof execFile>;
    });
    const fetcher = vi.fn();
    const pending = transcribe(audio(), "local", new AbortController().signal, fetcher);
    if (fail) await expect(pending).rejects.toThrow("Local transcription failed");
    else expect(await pending).toMatchObject({ text: "Local scene.", provider: "local" });
    await expect(access(audioPath)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
