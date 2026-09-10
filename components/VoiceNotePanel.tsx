"use client";

import { MicrophoneRecorder } from "@/components/MicrophoneRecorder";
import { useEffect, useRef, useState } from "react";
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, type TranscriptionProvider, type TranscriptionResult } from "@/lib/transcription/options";

type Props = { disabled: boolean; remainingChars: number; onAppend: (text: string) => void };

export function VoiceNotePanel(props: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return <div className="mt-3">
    <button ref={trigger} type="button" disabled={props.disabled} onClick={() => setOpen(true)}
      className="border border-ink/30 px-3 py-2 text-sm font-bold transition hover:bg-ink/5 disabled:opacity-50">
      Record scene idea
    </button>
    {open && <VoiceNoteDialog {...props} onClose={() => setOpen(false)} />}
  </div>;
}

function VoiceNoteDialog({ disabled, remainingChars, onAppend, onClose }: Props & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [provider, setProvider] = useState<TranscriptionProvider>();
  const [file, setFile] = useState<File>();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<TranscriptionResult>();
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const configController = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/transcribe/config", { cache: "no-store", signal: configController.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Transcription is unavailable.");
        if (data.provider !== "local" && data.provider !== "groq") throw new Error("Transcription is unavailable.");
        if (!configController.signal.aborted) setProvider(data.provider);
      } catch (failure) {
        if (!configController.signal.aborted) setError(failure instanceof Error ? failure.message : "Transcription is unavailable.");
      }
    })();
    return () => {
      configController.abort();
      controller.current?.abort();
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  async function transcribe(audio = file) {
    if (!audio || controller.current || disabled || !provider) return;
    if (audio.size > MAX_AUDIO_BYTES) { setError("Choose an audio file smaller than 20 MB."); return; }
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", audio);
      const response = await fetch("/api/transcribe", { method: "POST", body, signal: active.signal });
      const data = await response.json();
      if (active.signal.aborted) return;
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

  const locked = disabled || busy || recording || !provider;
  return <dialog ref={dialog} aria-labelledby="voice-dialog-title" aria-describedby="voice-dialog-description"
    onCancel={event => { event.preventDefault(); onClose(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto border-[1.5px] border-ink bg-paper p-5 text-ink shadow-xl backdrop:bg-black/50 sm:p-6">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 id="voice-dialog-title" className="text-xl font-bold">Record your scene idea</h2>
        <p id="voice-dialog-description" className="mt-1 text-sm text-ink/65">Speak, stop, then review the words before adding them to your brief.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close voice recorder" className="px-2 py-1 text-xl">×</button>
    </div>
    <div className="space-y-4">
      <p className="text-xs text-ink/65">{provider === "local"
        ? "Audio is transcribed locally on the machine running this app."
        : provider === "groq" ? "Audio is sent to Groq for transcription when you stop."
        : error ? "Transcription could not be configured." : "Preparing voice input…"}</p>
      <MicrophoneRecorder disabled={disabled || busy || !provider} cloud={provider === "groq"}
        onActiveChange={setRecording} onRecorded={audio => { if (uploadInput.current) uploadInput.current.value = ""; setFile(audio); void transcribe(audio); }} />
      <details>
        <summary className="cursor-pointer text-xs font-bold">Upload a saved voice note instead</summary>
        <div className="mt-3 space-y-2">
          <label className="block text-sm" htmlFor="voice-note">Audio file (up to 20 MB)</label>
          <input ref={uploadInput} id="voice-note" type="file" accept={AUDIO_ACCEPT} disabled={locked}
            className="block w-full text-sm" onChange={event => { setFile(event.target.files?.[0]); setError(""); }} />
        </div>
      </details>
      {file && !busy && <button type="button" className="border border-ink px-3 py-2 text-sm font-bold disabled:opacity-50"
        disabled={locked} onClick={() => void transcribe()}>{file.name.startsWith("microphone.") ? "Retry transcription" : "Transcribe audio"}</button>}
      {busy && <button type="button" className="text-sm underline" onClick={() => controller.current?.abort()}>Cancel transcription</button>}
      <p role="status" className="text-xs">{busy ? "Transcribing your English voice note…" : result ? "Transcript ready. Review it before adding." : ""}</p>
      {error && <p role="alert" className="text-sm text-rust">{error}</p>}
      {result && <>
        <label htmlFor="voice-transcript" className="block text-sm font-bold">Review transcript</label>
        <textarea id="voice-transcript" className="field min-h-28 text-sm" value={text}
          disabled={locked} onChange={event => setText(event.target.value)} />
        <p className="text-xs">{text.trim().length} transcript characters; {Math.max(0, remainingChars)} available in the scene idea.</p>
        {text.trim().length > remainingChars && <p className="text-sm text-rust">Shorten the transcript or scene idea to fit the 1,200 character scene limit.</p>}
        <button type="button" className="w-full border border-ink bg-ink px-3 py-3 text-sm font-bold text-paper disabled:opacity-50"
          disabled={locked || !text.trim() || text.trim().length > remainingChars} onClick={() => { onAppend(text.trim()); onClose(); }}>
          Add to scene idea
        </button>
      </>}
    </div>
  </dialog>;
}
