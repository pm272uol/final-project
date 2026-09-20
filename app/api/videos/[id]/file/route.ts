import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { videoFile } from "@/lib/video-generation/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const file = await videoFile((await params).id, url.searchParams.get("clip"));
  if (!file) return new Response("Video not found.", { status: 404 });
  let size: number;
  try { size = (await stat(file)).size; } catch { return new Response("Video not found.", { status: 404 }); }
  const range = request.headers.get("range");
  let start = 0;
  let end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return invalidRange(size);
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    } else start = Math.max(0, size - Number(match[2]));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return invalidRange(size);
  }
  const headers: Record<string, string> = {
    "Content-Type": "video/mp4", "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes", "Cache-Control": "private, no-store",
    "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="storyboard.mp4"`,
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  const stream = createReadStream(file, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers });
}
function invalidRange(size: number) { return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } }); }
