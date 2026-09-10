import { NextResponse } from "next/server";
import { getTranscriptionProvider } from "@/lib/transcription/config";
import { TranscriptionError } from "@/lib/transcription/service";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json({ provider: getTranscriptionProvider() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof TranscriptionError ? error.message : "Transcription is unavailable." }, { status: 503 });
  }
}
