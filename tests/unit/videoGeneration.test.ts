import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCloudClip, replicateVideoInput } from "@/lib/video-generation/replicate";
import { storyboardVideoShots, videoRequestSchema } from "@/lib/video-generation/options";
import type { StoryboardPackage } from "@/types/storyboard";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const shot = { panelNumber: 1, prompt: "A cat", image };
const request = { quality: "preview", seed: 42, shots: [{ panelNumber: 1, prompt: "A cat walks.", image }] };
it("bounds settings and rejects duplicate panels or oversized prompts", () => {
  expect(videoRequestSchema.safeParse(request).success).toBe(true);
  for (const change of [{ seed: -1 }, { seed: 2 ** 32 }, { quality: "unknown" }, { provider: "unknown" },
    { shots: [] }, { shots: [request.shots[0], request.shots[0]] }, { shots: [{ panelNumber: 1, prompt: "x".repeat(6001) }] }]) {
    expect(videoRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
  }
});
it("uses Wan 2.2 image-to-video settings for both resolutions", () => {
  expect(replicateVideoInput(shot, "preview", 8)).toEqual({ prompt: "A cat", image, seed: 8,
    num_frames: 121, resolution: "480p", aspect_ratio: "16:9", frames_per_second: 24,
    go_fast: true, sample_shift: 12 });
  expect(replicateVideoInput(shot, "standard", 8)).toMatchObject({ num_frames: 121, resolution: "720p" });
});
it("requires embedded images and rejects legacy local providers and URL inputs", () => {
  for (const image of [undefined, "", "/api/mock-panel-image?seed=1", "http://localhost/private", "https://example.com/image.png", "data:image/svg+xml;base64,YQ=="]) {
    expect(videoRequestSchema.safeParse({ ...request, shots: [{ ...shot, image }] }).success).toBe(false);
  }
  expect(videoRequestSchema.safeParse({ ...request, provider: "local" }).success).toBe(false);
});
it("builds ordered motion prompts with the current images but no history or dialogue", () => {
  const board = { visualStyle: "Noir", tone: "Tense", characters: [{ name: "Mina", visualDescription: "Red coat" }],
    storyboard: [{ panelNumber: 2, shotType: "wide shot", action: "Mina walks", cameraDirection: "Track left",
      setting: "Station", imageUrl: image, imageHistory: [{ imageUrl: "old-image" }], dialogueOrNarration: "Secret words" }] } as StoryboardPackage;
  const shots = storyboardVideoShots(board);
  expect(shots[0]).toMatchObject({ panelNumber: 2, image });
  expect(shots[0].prompt).toContain("Mina walks");
  expect(shots[0].prompt).toContain("Track left");
  expect(shots[0].prompt).toContain("Red coat");
  expect(JSON.stringify(shots)).not.toMatch(/old-image|Secret words/);
  board.storyboard[0].imageUrl = undefined;
  expect(() => storyboardVideoShots(board)).toThrow("panel 2");
});

describe("cloud generation", () => {
  it("polls asynchronous jobs and downloads only from the delivery host", async () => {
    vi.useFakeTimers(); vi.stubEnv("REPLICATE_API_TOKEN", "test-secret");
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "abc", status: "processing" }))
      .mockResolvedValueOnce(Response.json({ id: "abc", status: "succeeded", output: "https://test.replicate.delivery/video.mp4" }));
    const result = generateCloudClip(shot, "preview", 42, new AbortController().signal, fetcher);
    await vi.advanceTimersByTimeAsync(2100);
    await expect(result).resolves.toBe("https://test.replicate.delivery/video.mp4");
    expect(fetcher.mock.calls[0][0]).toBe("https://api.replicate.com/v1/models/wan-video/wan-2.2-5b-fast/predictions");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ input: replicateVideoInput(shot, "preview", 42) });
    expect(fetcher.mock.calls[1][0]).toBe("https://api.replicate.com/v1/predictions/abc");
  });
  it("cancels remote work when the user cancels during prediction creation", async () => {
    vi.stubEnv("REPLICATE_API_TOKEN", "test-secret");
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async () => {
      controller.abort(); return Response.json({ id: "abc", status: "starting" });
    }).mockResolvedValueOnce(Response.json({}));
    await expect(generateCloudClip(shot, "preview", 42, controller.signal, fetcher)).rejects.toThrow();
    expect(fetcher.mock.calls[1][0]).toBe("https://api.replicate.com/v1/predictions/abc/cancel");
    expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(false);
  });
  it.each(["https://evil.test/video.mp4", "http://replicate.delivery/video.mp4", "https://replicate.delivery.evil.test/video.mp4"])("rejects unsafe output URL %s", async output => {
    vi.stubEnv("REPLICATE_API_TOKEN", "test-secret");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "abc", status: "succeeded", output }));
    await expect(generateCloudClip(shot, "preview", 42, new AbortController().signal, fetcher)).rejects.toThrow("unsupported video location");
  });
  it.each([[401, "credentials"], [402, "billing credit"], [429, "busy"]])("reports actionable HTTP %i failures without leaking secrets", async (status, message) => {
    vi.stubEnv("REPLICATE_API_TOKEN", "test-secret");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private details", { status: Number(status) }));
    await expect(generateCloudClip(shot, "preview", 42, new AbortController().signal, fetcher)).rejects.toThrow(String(message));
  });
});
