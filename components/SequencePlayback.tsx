"use client";
import { useEffect, useRef, useState } from "react";
import type { StoryboardPackage } from "@/types/storyboard";
import { activeShotIndex, sequenceTiming } from "@/lib/timing";

export function SequencePlayback({ data, target, busy, onChange }: { data: StoryboardPackage; target: string; busy: boolean; onChange: (board: StoryboardPackage) => void }) {
  const timing = sequenceTiming(data, target);
  const [playing, setPlaying] = useState(false), [elapsed, setElapsed] = useState(0), [error, setError] = useState("");
  const position = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const index = activeShotIndex(timing.shots.map(s => s.end), elapsed), shot = timing.shots[index];
  useEffect(() => { setPlaying(false); setElapsed(0); position.current = 0; form.current?.reset(); }, [data.storyboard, target]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - position.current * 1000;
    const timer = window.setInterval(() => {
      const next = Math.min(timing.total, (performance.now() - start) / 1000);
      position.current = next; setElapsed(next);
      if (next >= timing.total) setPlaying(false);
    }, 50);
    return () => clearInterval(timer);
  }, [playing, timing.total]);
  const seek = (seconds: number) => { setPlaying(false); position.current = seconds; setElapsed(seconds); };
  return <section className="paper-card p-5 space-y-4" aria-label="Sequence playback">
    <h2 className="display text-3xl">Timing and playback</h2>
    <p data-testid="sequence-total">Sequence: {timing.total.toFixed(1)}s · Target: {timing.targetSeconds ?? "unknown"}s{timing.targetSeconds !== null && ` · ${(timing.total - timing.targetSeconds).toFixed(1)}s from target`}</p>
    <p className="text-xs">Untimed shots share the target duration equally. Save timings to fix each shot’s duration. Preview uses still images and displays dialogue and sound cues.</p>
    <form ref={form} onSubmit={event => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      const durations = data.storyboard.map((_, i) => Number(values.get(`shot-${i}`)));
      if (durations.some(n => !Number.isFinite(n) || n < 0.1 || n > 600)) { setError("Each shot must last between 0.1 and 600 seconds."); return; }
      onChange({ ...data, storyboard: data.storyboard.map((p, i) => ({ ...p, durationSeconds: durations[i] })) }); setError("");
    }}>
      <fieldset disabled={busy} className="flex flex-wrap items-end gap-3">
        {timing.shots.map((s, i) => <label key={s.panel.panelId ?? i}>Shot {i + 1} seconds<input aria-label={`Shot ${i + 1} seconds`} name={`shot-${i}`} className="block w-24 border p-2" type="number" min="0.1" max="600" step="0.1" required defaultValue={s.duration} /></label>)}
        <button className="border p-2" type="submit">Save timings</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
    <div className="bg-ink text-paper p-4 space-y-3" data-testid="playback-frame">
      {shot.panel.imageUrl ? <>{/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="aspect-video w-full max-h-96 object-contain" src={shot.panel.imageUrl} alt={`Playback shot ${index + 1}`} /></> : <div className="aspect-video grid place-items-center border border-paper/30">Shot {index + 1}: image not generated</div>}
      <p>Shot {index + 1} / {timing.shots.length} · {shot.panel.storyBeat}</p>
      <p>{shot.panel.dialogueOrNarration}</p>
      {shot.panel.sound && <p>Sound: {shot.panel.sound}</p>}
    </div>
    <label className="block">Playback position: {elapsed.toFixed(1)}s<input className="w-full" aria-label="Playback position" type="range" min="0" max={timing.total} step="0.1" value={elapsed} onChange={e => seek(Number(e.target.value))} /></label>
    <div className="flex flex-wrap gap-3">
      <button className="border p-2" onClick={() => { if (elapsed >= timing.total) { position.current = 0; setElapsed(0); } setPlaying(!playing); }}>{playing ? "Pause sequence" : "Play sequence"}</button>
      <button className="border p-2" onClick={() => seek(0)}>Restart sequence</button>
      <button className="border p-2" disabled={index === 0} onClick={() => seek(timing.shots[index - 1].start)}>Previous shot</button>
      <button className="border p-2" disabled={index === timing.shots.length - 1} onClick={() => seek(timing.shots[index + 1].start)}>Next shot</button>
    </div>
  </section>;
}
