import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/transcribe/route";
import { transcribe } from "@/lib/transcription/service";
vi.mock("@/lib/transcription/service", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/transcription/service")>(), transcribe: vi.fn(),
}));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
function request(name = "note.wav", provider = "local", content = "audio") {
  const form = new FormData(); form.append("file", new File([content], name)); form.append("provider", provider);
  return new Request("http://localhost/api/transcribe", { method: "POST", body: form });
}
it("uses the server provider and returns metadata", async () => {
  vi.mocked(transcribe).mockResolvedValue({ text: "Scene", provider: "groq", model: "whisper-large-v3-turbo", language: "en", durationMs: 12 });
  vi.stubEnv("ASR_PROVIDER", "groq");
  const response = await POST(request("note.m4a", "local"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ text: "Scene", provider: "groq", language: "en" });
  expect(transcribe).toHaveBeenCalledWith(expect.any(File), "groq", expect.any(AbortSignal));
});
it.each([["note.exe", "local", "audio", 415], ["note.wav", "local", "", 400]])("validates upload %s %s", async (name, provider, content, status) => {
  expect((await POST(request(name as string, provider as string, content as string))).status).toBe(status);
  expect(transcribe).not.toHaveBeenCalled();
});
it("rejects oversized bodies without content-length", async () => {
  const response = await POST(request("note.wav", "local", "a".repeat(21 * 1024 * 1024)));
  expect(response.status).toBe(413);
  expect(transcribe).not.toHaveBeenCalled();
});
it("rejects malformed multipart", async () => {
  expect((await POST(new Request("http://localhost/api/transcribe", { method: "POST", body: "bad" }))).status).toBe(400);
});
it("does not expose unexpected internal errors", async () => {
  vi.mocked(transcribe).mockRejectedValue(new Error("private secret"));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private secret");
});

it("does not allow an upload to override the server's local provider", async () => {
  vi.stubEnv("ASR_PROVIDER", "local");
  vi.mocked(transcribe).mockResolvedValue({ text: "Scene", provider: "local", model: "whisper", language: "en", durationMs: 1 });
  await POST(request("note.wav", "groq"));
  expect(transcribe).toHaveBeenCalledWith(expect.any(File), "local", expect.any(AbortSignal));
});
it("rejects invalid server configuration before invoking a provider", async () => {
  vi.stubEnv("ASR_PROVIDER", "invalid");
  expect((await POST(request())).status).toBe(503);
  expect(transcribe).not.toHaveBeenCalled();
});
it("exposes only the configured provider, never credentials", async () => {
  const { GET } = await import("@/app/api/transcribe/config/route");
  vi.stubEnv("ASR_PROVIDER", "groq"); vi.stubEnv("GROQ_API_KEY", "private-key");
  const response = await GET();
  expect(await response.json()).toEqual({ provider: "groq" });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
