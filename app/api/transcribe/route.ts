import { withDiagnosticResponse } from "@/lib/diagnostics/server";
import { getTranscriptionProvider } from "@/lib/transcription/config";
import { NextResponse } from "next/server";
import { MAX_AUDIO_BYTES } from "@/lib/transcription/options";
import { transcribe, TranscriptionError } from "@/lib/transcription/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
export const POST = withDiagnosticResponse(handlePost);

async function handlePost(request: Request) {
  try {
    const provider = getTranscriptionProvider();
    if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
      throw new TranscriptionError("Audio upload exceeds the 20 MB limit.", 413);
    }
    // Bound the body even when content-length is missing or incorrect.
    const reader = request.body?.getReader();
    if (!reader) throw new TranscriptionError("Choose an audio file.", 400);
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_REQUEST_BYTES) {
          await reader.cancel();
          throw new TranscriptionError("Audio upload exceeds the 20 MB limit.", 413);
        }
        chunks.push(new Uint8Array(value));
      }
    } finally { reader.releaseLock(); }
    let form: FormData;
    try {
      form = await new Response(new Blob(chunks), { headers: {
        "content-type": request.headers.get("content-type") ?? "",
      } }).formData();
    } catch { throw new TranscriptionError("The audio upload could not be read.", 400); }
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1 || file.size === 0) throw new TranscriptionError("Choose one non-empty audio file.", 400);
    if (file.size > MAX_AUDIO_BYTES) throw new TranscriptionError("Audio upload exceeds the 20 MB limit.", 413);
    if (!/\.(wav|mp3|m4a|ogg|flac|webm|mp4)$/i.test(file.name)) throw new TranscriptionError("Use WAV, MP3, M4A, OGG, FLAC, WebM or MP4 audio.", 415);
    return NextResponse.json(await transcribe(file, provider, request.signal));
  } catch (error) {
    return NextResponse.json({ error: error instanceof TranscriptionError ? error.message : "Transcription failed. Please try again." },
      { status: error instanceof TranscriptionError ? error.status : 500 });
  }
}
