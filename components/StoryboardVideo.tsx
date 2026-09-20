"use client";

import { useEffect, useRef, useState } from "react";
import type { StoryboardPackage } from "@/types/storyboard";
import { storyboardVideoShots, VIDEO_MODEL, VIDEO_PRESETS, type VideoJob, type VideoRequest } from "@/lib/video-generation/options";

export function StoryboardVideo({ storyboard }: { storyboard: StoryboardPackage }) {
  const [available, setAvailable] = useState<{ local: boolean; replicate: boolean } | null>(null);
  const [provider, setProvider] = useState<VideoRequest["provider"]>("replicate");
  const [quality, setQuality] = useState<VideoRequest["quality"]>("preview");
  const [seed, setSeed] = useState(42);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const currentJob = useRef<string | null>(null);
  const mounted = useRef(true);
  const busy = starting || job?.status === "queued" || job?.status === "running";
  const jobId = job?.id;
  const jobStatus = job?.status;

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void fetch("/api/videos", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load video configuration.");
      const config = await response.json();
      if (!controller.signal.aborted) {
        setAvailable(config);
        setProvider(config.replicate ? "replicate" : "local");
      }
    }).catch(() => { if (!controller.signal.aborted) setError("Could not load video configuration. Reload to retry."); });
    return () => {
      mounted.current = false;
      controller.abort();
      if (currentJob.current) void fetch(`/api/videos/${currentJob.current}`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!jobId || !jobStatus || !["queued", "running"].includes(jobStatus)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const id = jobId;
    async function poll() {
      try {
        const response = await fetch(`/api/videos/${id}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setJob(current => current ? { ...current, status: "failed", message: result.error } : current);
          currentJob.current = null;
          return;
        }
        if (!response.ok) throw new Error("Could not refresh video progress. Retrying…");
        setJob(result);
        setError("");
        if (!["queued", "running"].includes(result.status)) { currentJob.current = null; return; }
      } catch {
        if (controller.signal.aborted) return;
        setError("Could not refresh video progress. Retrying…");
      }
      timer = setTimeout(() => void poll(), 2000);
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, jobStatus]); // Progress changes do not restart the polling loop.

  async function generate(previewOnly: boolean) {
    if (busy) return;
    setStarting(true);
    setError("");
    try {
      const shots = storyboardVideoShots(storyboard);
      const response = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, quality, seed, shots: previewOnly ? shots.slice(0, 1) : shots }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not start video generation.");
      if (!mounted.current) { await fetch(`/api/videos/${result.id}`, { method: "DELETE" }); return; }
      currentJob.current = result.id;
      setJob(result);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not start video generation.");
    } finally { if (mounted.current) setStarting(false); }
  }

  async function cancel() {
    if (!job) return;
    try {
      const response = await fetch(`/api/videos/${job.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setJob(await response.json());
    } catch { setError("Could not cancel the video. Try Cancel again."); }
  }

  const preset = VIDEO_PRESETS[quality];
  return <section className="paper-card space-y-4 p-5" aria-label="Experimental storyboard video">
    <div className="flex flex-wrap items-baseline gap-3">
      <h2 className="display text-3xl">Storyboard to video</h2>
      <span className="mono border border-rust px-2 py-1 text-[10px] uppercase text-rust">Experimental</span>
    </div>
    <p className="text-sm leading-relaxed text-ink/70">
      {VIDEO_MODEL} generates silent motion from your shot descriptions. Panel images are not used as input,
      so appearances may differ. Each shot has a fixed length; the video does not follow the script’s timing.
    </p>
    <div className="flex flex-wrap items-end gap-4">
      <label className="grid gap-1 text-sm">Video backend
        <select value={provider} disabled={busy} onChange={event => setProvider(event.target.value as VideoRequest["provider"])} className="border border-ink bg-paper p-2">
          <option value="replicate">Cloud · Replicate{available && !available.replicate ? " (setup needed)" : ""}</option>
          <option value="local">Local · MLX{available && !available.local ? " (setup needed)" : ""}</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">Video quality
        <select value={quality} disabled={busy} onChange={event => setQuality(event.target.value as VideoRequest["quality"])} className="border border-ink bg-paper p-2">
          <option value="preview">Quick draft · 2 seconds per shot</option>
          <option value="standard">Standard · 5 seconds per shot</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">Video seed
        <input type="number" min={0} max={2147483637} value={seed} disabled={busy} onChange={event => setSeed(Number(event.target.value))} className="w-28 border border-ink bg-paper p-2" />
      </label>
    </div>
    <p className="text-sm text-ink/70">
      {provider === "replicate" ? "Cloud generation uses your Replicate credit." : "Local generation uses your Mac’s GPU and can take many minutes per shot. Keep the model drive connected."}
      {" "}Full storyboard: {storyboard.storyboard.length} shots, approximately {Math.round(storyboard.storyboard.length * preset.frames / preset.fps)} seconds at 480p.
      {quality === "preview" && " Quick drafts use fewer steps and may look rough."}
    </p>
    {available && !available[provider] && <p className="text-sm text-rust">
      {provider === "local" ? "Local setup needed: mount the model drive and follow docs/video-generation.md." : "Add REPLICATE_API_TOKEN to the server environment to enable cloud video."}
    </p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy || !available?.[provider]} onClick={() => void generate(true)} className="border border-ink px-3 py-2 text-sm disabled:opacity-50">Preview first shot</button>
      <button type="button" disabled={busy || !available?.[provider]} onClick={() => void generate(false)} className="border border-ink bg-acid px-3 py-2 text-sm font-bold disabled:opacity-50">Generate storyboard video</button>
      {busy && job && <button type="button" onClick={() => void cancel()} className="border border-ink px-3 py-2 text-sm">Cancel video</button>}
    </div>
    {starting && <p role="status" className="text-sm">Starting video generation…</p>}
    {error && <p role="alert" className="text-sm text-rust">{error}</p>}
    {job && <div className="space-y-3">
      <p role={job.status === "failed" ? "alert" : "status"} className="text-sm">{job.message} ({job.completedShots}/{job.totalShots} shots)</p>
      {busy && <progress value={job.completedShots} max={job.totalShots} aria-label="Video generation progress" className="w-full" />}
      {job.videoUrl && <>
        <video controls preload="metadata" src={job.videoUrl} className="max-h-[32rem] w-full bg-ink" aria-label="Generated storyboard video" />
        <a href={`${job.videoUrl}?download=1`} download="storyboard.mp4" className="inline-block border border-ink bg-paper px-3 py-2 text-sm">Download storyboard MP4</a>
        <p className="text-xs text-ink/60">Download to keep a copy. Generated videos may be removed after 24 hours.</p>
      </>}
      {job.clips.length > 0 && <details><summary className="cursor-pointer text-sm">Completed shot clips</summary>
        <div className="mt-2 flex flex-wrap gap-3">{job.clips.map(clip => <a key={clip.panelNumber} href={`${clip.url}&download=1`} className="text-sm underline">Download shot {clip.panelNumber}</a>)}</div>
      </details>}
    </div>}
  </section>;
}
