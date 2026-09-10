import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/transcribe/route";
import { transcribe } from "@/lib/transcription/service";
vi.mock("@/lib/transcription/service", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/transcription/service")>(), transcribe: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
function request(name = "note.wav", provider = "local", content = "audio") {
  const form = new FormData(); form.append("file", new File([content], name)); form.append("provider", provider);
  return new Request("http://localhost/api/transcribe", { method: "POST", body: form });
}
it("passes the explicitly selected provider and returns metadata", async () => {
  vi.mocked(transcribe).mockResolvedValue({ text: "Scene", provider: "groq", model: "whisper-large-v3-turbo", language: "en", durationMs: 12 });
  const response = await POST(request("note.m4a", "groq"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ text: "Scene", provider: "groq", language: "en" });
  expect(transcribe).toHaveBeenCalledWith(expect.any(File), "groq", expect.any(AbortSignal));
});
it.each([["note.exe", "local", "audio", 415], ["note.wav", "invalid", "audio", 400], ["note.wav", "local", "", 400]])("validates upload %s %s", async (name, provider, content, status) => {
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
