"use client";

import { MicrophoneRecorder } from "@/components/MicrophoneRecorder";
import { useEffect, useRef, useState } from "react";
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, type TranscriptionProvider, type TranscriptionResult } from "@/lib/transcription/options";

export function VoiceNotePanel({ disabled, remainingChars, onAppend }: {
  disabled: boolean;
  remainingChars: number;
  onAppend: (text: string) => void;
}) {
  const [provider, setProvider] = useState<TranscriptionProvider>("local");
  const [file, setFile] = useState<File>();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<TranscriptionResult>();
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function transcribe(audio = file) {
    if (!audio || controller.current || disabled) return;
    if (audio.size > MAX_AUDIO_BYTES) { setError("Choose an audio file smaller than 20 MB."); return; }
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", audio);
      body.append("provider", provider);
      const response = await fetch("/api/transcribe", { method: "POST", body, signal: active.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Transcription failed.");
      setText(data.text);
      setResult(data);
    } catch (failure) {
      setError(active.signal.aborted ? "Transcription cancelled." : failure instanceof Error ? failure.message : "Transcription failed.");
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }

  return <details className="mt-4 border border-ink/20 p-3" onToggle={event => { if (recording) event.currentTarget.open = true; }}>
    <summary className="cursor-pointer text-sm font-bold">Use an English voice note</summary>
    <div className="mt-3 space-y-3">
      <label className="block text-sm" htmlFor="transcription-provider">Transcribe with</label>
      <select id="transcription-provider" className="field text-sm" value={provider}
        disabled={disabled || busy || recording} onChange={event => setProvider(event.target.value as TranscriptionProvider)}>
        <option value="local">Whisper Turbo — local</option>
        <option value="groq">Whisper Turbo — Groq cloud</option>
      </select>
      <p className="text-xs text-ink/65">{provider === "local"
        ? "Audio is processed on the machine running this app. Local Whisper setup is required."
        : "Transcribing sends this audio to Groq. Your server needs a Groq API key."}</p>
      <MicrophoneRecorder disabled={disabled || busy} cloud={provider === "groq"}
        onActiveChange={setRecording} onRecorded={(audio) => { if (uploadInput.current) uploadInput.current.value = ""; setFile(audio); void transcribe(audio); }} />
      <p className="text-xs font-bold">Or upload a saved voice note</p>
      <label className="block text-sm" htmlFor="voice-note">Audio file (up to 20 MB)</label>
      <input ref={uploadInput} id="voice-note" type="file" accept={AUDIO_ACCEPT} disabled={disabled || busy || recording}
        className="block w-full text-sm" onChange={event => { setFile(event.target.files?.[0]); setError(""); }} />
      <button type="button" className="border border-ink px-3 py-2 text-sm font-bold disabled:opacity-50"
        disabled={disabled || busy || recording || !file} onClick={() => void transcribe()}>
        {busy ? "Transcribing…" : provider === "groq" ? "Transcribe with Groq" : "Transcribe locally"}
      </button>
      {file?.name.startsWith("microphone.") && <p className="text-xs">Microphone recording ready. You can retry transcription if needed.</p>}
      {busy && <button type="button" className="ml-3 text-sm underline" onClick={() => controller.current?.abort()}>Cancel transcription</button>}
      <p role="status" className="text-xs">{busy ? "Transcribing your English voice note…" : result ? `Transcript ready from ${result.provider === "local" ? "local Whisper Turbo" : "Groq Whisper Turbo"}. Review it before adding.` : ""}</p>
      {error && <p role="alert" className="text-sm text-rust">{error}</p>}
      {result && <>
        <label htmlFor="voice-transcript" className="block text-sm font-bold">Review transcript</label>
        <textarea id="voice-transcript" className="field min-h-28 text-sm" value={text}
          disabled={disabled || busy || recording} onChange={event => setText(event.target.value)} />
        <p className="text-xs">{text.trim().length} transcript characters; {Math.max(0, remainingChars)} available in the scene idea.</p>
        {text.trim().length > remainingChars && <p className="text-sm text-rust">Shorten the transcript or scene idea to fit the 1,200 character scene limit.</p>}
        <button type="button" className="border border-ink px-3 py-2 text-sm font-bold disabled:opacity-50"
          disabled={disabled || busy || recording || !text.trim() || text.trim().length > remainingChars} onClick={() => { onAppend(text.trim()); setText(""); setResult(undefined); }}>
          Add to scene idea
        </button>
      </>}
    </div>
  </details>;
}
