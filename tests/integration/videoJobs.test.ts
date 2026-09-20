import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cancelVideoJob, getVideoJob, startVideoJob, videoFile } from "@/lib/video-generation/jobs";
import { generateCloudClip } from "@/lib/video-generation/replicate";
import type { VideoJob, VideoRequest } from "@/lib/video-generation/options";

vi.mock("@/lib/video-generation/replicate", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/video-generation/replicate")>(), generateCloudClip: vi.fn(),
}));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
describe.skipIf(!hasFfmpeg)("persistent video jobs with real FFmpeg", () => {
  let directory: string;
  let sample: Buffer;
  const input: VideoRequest = { provider: "replicate", quality: "preview", seed: 42,
    shots: [{ panelNumber: 1, prompt: "First shot" }, { panelNumber: 2, prompt: "Second shot" }] };
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "wan-jobs-"));
    const file = path.join(directory, "sample.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32:r=16",
      "-frames:v", "33", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
    sample = await readFile(file);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
  function setup() {
    vi.stubEnv("VIDEO_OUTPUT_DIR", path.join(directory, "jobs"));
    vi.stubEnv("REPLICATE_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(new Uint8Array(sample))));
    vi.mocked(generateCloudClip).mockResolvedValue("https://replicate.delivery/clip.mp4");
  }
  async function finished(id: string) {
    await vi.waitFor(() => expect(["complete", "failed", "cancelled"]).toContain(getVideoJob(id)?.status), { timeout: 10000, interval: 20 });
    return getVideoJob(id)!;
  }
  it("assembles the entire sequence and retains playable per-shot downloads", async () => {
    setup();
    const job = await startVideoJob(input);
    const result = await finished(job.id);
    expect(result.status).toBe("complete");
    expect(result.completedShots).toBe(2);
    expect(result.clips.map(c => c.panelNumber)).toEqual([1, 2]);
    const file = await videoFile(job.id, null);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=nb_frames", "-of", "json", file!], { encoding: "utf8" }));
    expect(probe.streams[0].nb_frames).toBe("66");
    expect(await videoFile(job.id, "1")).toBeTruthy();
    expect(await videoFile(job.id, "2")).toBeUndefined();
    expect(await videoFile("../../private", null)).toBeUndefined();
    expect(await videoFile(job.id, "../request.json")).toBeUndefined();
  });
  it("rejects simultaneous work and releases the slot only after cancellation", async () => {
    setup();
    vi.mocked(generateCloudClip).mockImplementationOnce((_prompt, _quality, _seed, signal) => new Promise((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const job = await startVideoJob(input);
    await vi.waitFor(() => expect(generateCloudClip).toHaveBeenCalled());
    await expect(startVideoJob(input)).rejects.toThrow("Another video is running");
    cancelVideoJob(job.id);
    expect((await finished(job.id)).status).toBe("cancelled");
    const next = await startVideoJob({ ...input, shots: input.shots.slice(0, 1) });
    expect((await finished(next.id)).status).toBe("complete");
  });
  it("keeps the first clip downloadable if a later shot fails", async () => {
    setup();
    vi.mocked(generateCloudClip).mockResolvedValueOnce("https://replicate.delivery/clip.mp4").mockRejectedValueOnce(new Error("private failure"));
    const result: VideoJob = await finished((await startVideoJob(input)).id);
    expect(result.status).toBe("failed");
    expect(result.completedShots).toBe(1);
    expect(result.message).not.toContain("private failure");
    expect(await videoFile(result.id, "0")).toBeTruthy();
    expect(await videoFile(result.id, null)).toBeUndefined();
  });
});
