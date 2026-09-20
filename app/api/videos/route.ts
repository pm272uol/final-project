import { NextResponse } from "next/server";
import { startVideoJob, videoConfiguration } from "@/lib/video-generation/jobs";
import { videoRequestSchema } from "@/lib/video-generation/options";
import { VideoError } from "@/lib/video-generation/replicate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await videoConfiguration(), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  // Stream a bounded body rather than buffering arbitrarily large image data.
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Missing video request." }, { status: 400 });
  let body: unknown;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 100_000) {
        await reader.cancel();
        return NextResponse.json({ error: "Video request is too large." }, { status: 413 });
      }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return NextResponse.json({ error: "Invalid video request JSON." }, { status: 400 }); }
  const parsed = videoRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid video settings or shot descriptions." }, { status: 400 });
  try {
    return NextResponse.json(await startVideoJob(parsed.data), { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof VideoError ? error.message : "Could not start video generation." },
      { status: error instanceof VideoError ? error.status : 500 });
  }
}
