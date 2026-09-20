import { afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/videos/route";
import { GET as getJob, DELETE } from "@/app/api/videos/[id]/route";
import { startVideoJob, videoConfiguration, getVideoJob, cancelVideoJob } from "@/lib/video-generation/jobs";
import { VideoError } from "@/lib/video-generation/replicate";
vi.mock("@/lib/video-generation/jobs", () => ({ startVideoJob: vi.fn(), videoConfiguration: vi.fn(), getVideoJob: vi.fn(), cancelVideoJob: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const body = { quality: "preview", seed: 42, shots: [{ panelNumber: 1, prompt: "A cat walks.", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=" }] };
const req = (data: unknown) => new Request("http://localhost/api/videos", { method: "POST", body: JSON.stringify(data) });
it("validates before starting work", async () => {
  expect((await POST(req({ ...body, shots: [] }))).status).toBe(400);
  expect((await POST(req({ ...body, seed: -1 }))).status).toBe(400);
  expect(startVideoJob).not.toHaveBeenCalled();
});
it("rejects oversized requests even without content-length", async () => {
  expect((await POST(new Request("http://localhost/api/videos", { method: "POST", duplex: "half", body: new ReadableStream({
    start(controller) { for (let i = 0; i < 82; i++) controller.enqueue(new Uint8Array(1_000_000)); controller.close(); }
  }) } as RequestInit))).status).toBe(413);
  expect(startVideoJob).not.toHaveBeenCalled();
});
it("returns accepted jobs without waiting for inference", async () => {
  vi.mocked(startVideoJob).mockResolvedValue({ id: "new-job", status: "queued" } as Awaited<ReturnType<typeof startVideoJob>>);
  const response = await POST(req(body));
  expect(response.status).toBe(202);
  expect(startVideoJob).toHaveBeenCalledWith(body);
});
it("reports busy and setup errors", async () => {
  vi.mocked(startVideoJob).mockRejectedValue(new VideoError("Another video is running", 409));
  expect((await POST(req(body))).status).toBe(409);
});
it("does not expose internal exception details", async () => {
  vi.mocked(startVideoJob).mockRejectedValue(new Error("private-secret"));
  const response = await POST(req(body));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private-secret");
});
it("exposes availability without credentials or filesystem paths", async () => {
  vi.mocked(videoConfiguration).mockResolvedValue({ replicate: false });
  const response = await GET();
  expect(await response.json()).toEqual({ replicate: false });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("returns 404 for missing jobs and delegates cancellation", async () => {
  const context = { params: Promise.resolve({ id: "missing" }) };
  expect((await getJob(req(body), context)).status).toBe(404);
  expect(getVideoJob).toHaveBeenCalledWith("missing");
  expect((await DELETE(req(body), context)).status).toBe(404);
  expect(cancelVideoJob).toHaveBeenCalledWith("missing");
});
