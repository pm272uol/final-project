import { diagnosticsEnabled } from "@/lib/diagnostics/server";
import { NextResponse } from "next/server";
import { cancelVideoJob, getVideoJob } from "@/lib/video-generation/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const job = getVideoJob((await params).id);
  return NextResponse.json(job ?? { error: "Video job not found. The server may have restarted." },
    { status: job ? 200 : 404, headers: { "Cache-Control": "no-store", ...(diagnosticsEnabled() ? { "X-Workflow-Debug": "true" } : {}) } });
}
export async function DELETE(_request: Request, { params }: Context) {
  const job = cancelVideoJob((await params).id);
  return NextResponse.json(job ?? { error: "Video job not found." }, { status: job ? 200 : 404, headers: { "Cache-Control": "no-store", ...(diagnosticsEnabled() ? { "X-Workflow-Debug": "true" } : {}) } });
}
