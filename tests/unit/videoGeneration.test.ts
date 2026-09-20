import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCloudClip, replicateVideoInput } from "@/lib/video-generation/replicate";
import { storyboardVideoShots, videoRequestSchema } from "@/lib/video-generation/options";
import type { StoryboardPackage } from "@/types/storyboard";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const request = { provider: "replicate", quality: "preview", seed: 42, shots: [{ panelNumber: 1, prompt: "A cat walks." }] };
it("bounds settings and rejects duplicate panels or oversized prompts", () => {
  expect(videoRequestSchema.safeParse(request).success).toBe(true);
  for (const change of [{ seed: -1 }, { seed: 2 ** 32 }, { quality: "unknown" }, { provider: "unknown" },
    { shots: [] }, { shots: [request.shots[0], request.shots[0]] }, { shots: [{ panelNumber: 1, prompt: "x".repeat(6001) }] }]) {
    expect(videoRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
  }
});
it("uses actual Wan API field names and matched generation settings", () => {
  expect(replicateVideoInput("prompt", "preview", 8)).toEqual({ prompt: "prompt", seed: 8,
    frame_num: 33, resolution: "480p", aspect_ratio: "16:9", sample_steps: 10, sample_shift: 5, sample_guide_scale: 5 });
  expect(replicateVideoInput("prompt", "standard", 8)).toMatchObject({ frame_num: 81, sample_steps: 30 });
});
it("builds motion prompts in board order without image payloads or spoken dialogue", () => {
  const board = { visualStyle: "Noir", tone: "Tense", characters: [{ name: "Mina", visualDescription: "Red coat" }],
    storyboard: [{ panelNumber: 2, shotType: "wide shot", action: "Mina walks", cameraDirection: "Track left",
      setting: "Station", imageUrl: "data:image/png;base64,private", dialogueOrNarration: "Secret words" }] } as StoryboardPackage;
  const shots = storyboardVideoShots(board);
  expect(shots[0]).toMatchObject({ panelNumber: 2 });
  expect(shots[0].prompt).toContain("Mina walks");
  expect(shots[0].prompt).toContain("Track left");
  expect(shots[0].prompt).toContain("Red coat");
  expect(JSON.stringify(shots)).not.toMatch(/base64|Secret words/);
});

describe("cloud generation", () => {
  it("polls asynchronous jobs and downloads only from the delivery host", async () => {
    vi.useFakeTimers(); vi.stubEnv("REPLICATE_API_TOKEN", "test-secret");
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "abc", status: "processing" }))
      .mockResolvedValueOnce(Response.json({ id: "abc", status: "succeeded", output: "https://test.replicate.delivery/video.mp4" }));
    const result = generateCloudClip("A cat", "preview", 42, new AbortController().signal, fetcher);
    await vi.advanceTimersByTimeAsync(2100);
    await expect(result).resolves.toBe("https://test.replicate.delivery/video.mp4");
    expect(fetcher.mock.calls[1][0]).toBe("https://api.replicate.com/v1/predictions/abc");
  });
  it("cancels remote work when the user cancels during prediction creation", async () => {
    vi.stubEnv("REPLICATE_API_TOKEN", "test-secret");
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async () => {
      controller.abort(); return Response.json({ id: "abc", status: "starting" });
    }).mockResolvedValueOnce(Response.json({}));
    await expect(generateCloudClip("A cat", "preview", 42, controller.signal, fetcher)).rejects.toThrow();
    expect(fetcher.mock.calls[1][0]).toBe("https://api.replicate.com/v1/predictions/abc/cancel");
    expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(false);
  });
  it.each(["https://evil.test/video.mp4", "http://replicate.delivery/video.mp4", "https://replicate.delivery.evil.test/video.mp4"])("rejects unsafe output URL %s", async output => {
    vi.stubEnv("REPLICATE_API_TOKEN", "test-secret");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "abc", status: "succeeded", output }));
    await expect(generateCloudClip("A cat", "preview", 42, new AbortController().signal, fetcher)).rejects.toThrow("unsupported video location");
  });
  it.each([[401, "credentials"], [402, "billing credit"], [429, "busy"]])("reports actionable HTTP %i failures without leaking secrets", async (status, message) => {
    vi.stubEnv("REPLICATE_API_TOKEN", "test-secret");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private details", { status: Number(status) }));
    await expect(generateCloudClip("A cat", "preview", 42, new AbortController().signal, fetcher)).rejects.toThrow(String(message));
  });
});
