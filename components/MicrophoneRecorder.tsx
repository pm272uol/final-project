"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_AUDIO_BYTES } from "@/lib/transcription/options";

const MAX_SECONDS = 120;
const FORMATS = [
  ["audio/webm;codecs=opus", "webm"],
  ["audio/mp4", "mp4"],
  ["audio/ogg;codecs=opus", "ogg"],
] as const;
type Session = {
  stream?: MediaStream;
  recorder?: MediaRecorder;
  timer?: ReturnType<typeof setInterval>;
};
function release(session: Session) {
  clearInterval(session.timer);
  if (session.recorder) {
    session.recorder.ondataavailable = null;
    session.recorder.onstop = null;
    session.recorder.onerror = null;
    if (session.recorder.state !== "inactive") session.recorder.stop();
  }
  session.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
}

export function MicrophoneRecorder({ disabled, cloud, onActiveChange, onRecorded }: {
  disabled: boolean;
  cloud: boolean;
  onActiveChange: (active: boolean) => void;
  onRecorded: (file: File) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "requesting" | "recording" | "stopping">("idle");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const current = useRef<Session | null>(null);
  const callbacks = useRef({ onActiveChange, onRecorded });
  useEffect(() => { callbacks.current = { onActiveChange, onRecorded }; }, [onActiveChange, onRecorded]);
  useEffect(() => () => {
    const session = current.current;
    current.current = null;
    if (session) release(session);
  }, []);
  useEffect(() => {
    if (disabled && current.current) {
      const session = current.current;
      current.current = null;
      release(session);
      setPhase("idle");
      setMessage("Recording cancelled.");
      callbacks.current.onActiveChange(false);
    }
  }, [disabled]);

  function cancel(message = "Recording cancelled. No audio was sent.") {
    const session = current.current;
    current.current = null;
    if (session) release(session);
    setPhase("idle");
    setMessage(message);
    callbacks.current.onActiveChange(false);
  }

  function stop() {
    const session = current.current;
    if (session?.recorder?.state === "recording") {
      setPhase("stopping");
      clearInterval(session.timer);
      session.recorder.stop();
      // Release the microphone immediately; the recorder's final data event follows.
      session.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    }
  }

  async function start() {
    if (disabled || current.current) return;
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("Microphone recording is unavailable. Use HTTPS or localhost in a supported browser, or upload an audio file.");
      return;
    }
    const format = FORMATS.find(([mime]) => MediaRecorder.isTypeSupported(mime));
    if (!format) { setMessage("This browser cannot record a supported audio format. Upload an audio file instead."); return; }
    const session: Session = {};
    current.current = session;
    setPhase("requesting");
    callbacks.current.onActiveChange(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission may arrive after cancel, unmount, or a newer recording request.
      if (current.current !== session) { stream.getTracks().forEach(track => track.stop()); return; }
      session.stream = stream;
      const recorder = new MediaRecorder(stream, { mimeType: format[0] });
      session.recorder = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = event => {
        if (current.current !== session) return;
        bytes += event.data.size;
        if (bytes > MAX_AUDIO_BYTES) { cancel("Recording exceeded 20 MB. Please record a shorter scene idea."); return; }
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => cancel("Microphone recording failed. Please try again or upload a file.");
      stream.getTracks().forEach(track => { track.onended = () => cancel("The microphone disconnected. Please record again."); });
      recorder.onstop = () => {
        if (current.current !== session) return;
        current.current = null;
        release(session);
        setPhase("idle");
        callbacks.current.onActiveChange(false);
        if (!bytes) { setMessage("No audio was captured. Please record again."); return; }
        const file = new File(chunks, `microphone.${format[1]}`, { type: recorder.mimeType });
        setMessage("Recording finished.");
        callbacks.current.onRecorded(file);
      };
      recorder.start(1000);
      setSeconds(0);
      setPhase("recording");
      const started = Date.now();
      session.timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(Math.min(elapsed, MAX_SECONDS));
        if (elapsed >= MAX_SECONDS) stop();
      }, 250);
    } catch (error) {
      if (current.current !== session) return;
      const name = error instanceof DOMException ? error.name : "";
      cancel(name === "NotAllowedError"
        ? "Microphone permission was denied. Allow microphone access in your browser and try again, or upload a file."
        : name === "NotFoundError"
          ? "No microphone was found. Connect a microphone or upload a file."
          : "The microphone could not start. Check that it is available and try again.");
    }
  }

  return <div className="space-y-2 border-b border-ink/20 pb-3">
    <p className="text-xs text-ink/65">Record your scene idea in English. Stops and transcribes at two minutes.
      {cloud ? " Stopping sends the recording to Groq." : " Transcription starts after you stop."}</p>
    {phase === "idle" ? <button type="button" disabled={disabled} onClick={start}
      className="border border-ink bg-ink px-3 py-2 text-sm font-bold text-paper disabled:opacity-50">Start recording</button> : <>
      <p role="status" className="text-sm font-bold">{phase === "requesting" ? "Waiting for microphone permission…"
        : phase === "stopping" ? "Finishing recording…" : `● Recording ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</p>
      {phase === "recording" && <button type="button" onClick={stop}
        className="border border-ink px-3 py-2 text-sm font-bold">Stop and transcribe</button>}
      <button type="button" onClick={() => cancel()} className="ml-3 text-sm underline">Cancel recording</button>
    </>}
    {message && <p role="status" className="text-xs">{message}</p>}
  </div>;
}
