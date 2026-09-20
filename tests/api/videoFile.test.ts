import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET } from "@/app/api/videos/[id]/file/route";
import { videoFile } from "@/lib/video-generation/jobs";
vi.mock("@/lib/video-generation/jobs", () => ({ videoFile: vi.fn() }));
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "wan-video-range-"));
  const file = path.join(directory, "test.mp4");
  await writeFile(file, "0123456789");
  vi.mocked(videoFile).mockResolvedValue(file);
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
const context = { params: Promise.resolve({ id: "job" }) };
function request(range?: string) {
  return new Request("http://localhost/api/videos/job/file", { headers: range ? { Range: range } : {} });
}
it("serves full videos and byte ranges for seeking", async () => {
  const full = await GET(request(), context);
  expect(full.status).toBe(200);
  expect(await full.text()).toBe("0123456789");
  const partial = await GET(request("bytes=2-5"), context);
  expect(partial.status).toBe(206);
  expect(partial.headers.get("content-range")).toBe("bytes 2-5/10");
  expect(await partial.text()).toBe("2345");
  const suffix = await GET(request("bytes=-3"), context);
  expect(await suffix.text()).toBe("789");
});
it.each(["bytes=10-", "bytes=6-2", "bytes=-0", "bytes=0-1,3-4", "bytes=-", "bad"])("rejects invalid range %s", async range => {
  const response = await GET(request(range), context);
  expect(response.status).toBe(416);
  expect(response.headers.get("content-range")).toBe("bytes */10");
});
