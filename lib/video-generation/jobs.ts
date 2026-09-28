import { diagnosticsEnabled, runWithDiagnostics } from "../diagnostics/server";
import type { DiagnosticRecord } from "../diagnostics/types";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { VIDEO_MODEL, VIDEO_PRESETS, type VideoJob, type VideoRequest } from "./options";
import { generateCloudClip, VideoError } from "./replicate";
import { runVideoProcess } from "./process";

type InternalJob = { diagnostics?: DiagnosticRecord[]; view: VideoJob; controller: AbortController; directory: string };
const globalJobs = globalThis as typeof globalThis & { storyboardVideoJobs?: Map<string, InternalJob> };
const jobs = globalJobs.storyboardVideoJobs ??= new Map<string, InternalJob>();
const root = () => path.resolve(process.env.VIDEO_OUTPUT_DIR ?? ".cache/videos");
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const active = (job: VideoJob) => job.status === "queued" || job.status === "running";
export async function videoConfiguration() {
  return { replicate: Boolean(process.env.REPLICATE_API_TOKEN?.trim()) };
}

export function getVideoJob(id: string): VideoJob | undefined {
  const job = jobs.get(id);
  return job ? structuredClone({ ...job.view, ...(diagnosticsEnabled() && job.diagnostics ? { diagnostics: job.diagnostics } : {}) }) : undefined;
}

export function cancelVideoJob(id: string): VideoJob | undefined {
  const job = jobs.get(id);
  if (job && active(job.view)) {
    job.view.message = "Cancelling video generation…";
    job.controller.abort();
  }
  return getVideoJob(id);
}

export async function startVideoJob(input: VideoRequest): Promise<VideoJob> {
  if ([...jobs.values()].some(job => active(job.view))) throw new VideoError("Another video is running. Wait for it or cancel it first.", 409);
  const available = await videoConfiguration();
  if (!available.replicate) throw new VideoError("Cloud video needs REPLICATE_API_TOKEN on the server.", 503);
  // Check again after async preflight, before reserving the only job slot.
  if ([...jobs.values()].some(job => active(job.view))) throw new VideoError("Another video is running. Wait for it or cancel it first.", 409);
  const id = randomUUID();
  const preset = VIDEO_PRESETS[input.quality];
  const job: InternalJob = { controller: new AbortController(), directory: path.join(root(), id), view: {
    id, status: "queued", model: VIDEO_MODEL, quality: input.quality, seed: input.seed,
    completedShots: 0, totalShots: input.shots.length, clips: [], message: "Preparing video…",
    createdAt: new Date().toISOString(), durationSeconds: input.shots.length * preset.frames / preset.fps,
  } };
  jobs.set(id, job);
  // This prototype requires one persistent Node server, not a serverless runtime.
  if (diagnosticsEnabled()) {
    job.diagnostics = [];
    void runWithDiagnostics(job.diagnostics, () => runJob(job, input));
  } else {
    void runJob(job, input);
  }
  return structuredClone(job.view);
}

async function pruneOldVideos() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  await mkdir(root(), { recursive: true });
  for (const name of await readdir(root())) {
    if (!idPattern.test(name) || (jobs.has(name) && active(jobs.get(name)!.view))) continue;
    const directory = path.join(root(), name);
    if ((await stat(directory)).mtimeMs < cutoff) {
      await rm(directory, { recursive: true, force: true });
      jobs.delete(name);
    }
  }
  for (const [id, job] of jobs) {
    if (!active(job.view) && Date.parse(job.view.createdAt) < cutoff) jobs.delete(id);
  }
}

async function downloadClip(url: string, destination: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, redirect: "error" });
  if (!response.ok || !response.body) throw new VideoError("Could not download the generated video.");
  const maxBytes = 100 * 1024 * 1024;
  let bytes = 0;
  const limit = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    callback(bytes > maxBytes ? new VideoError("Generated clip exceeds the 100 MB limit.") : null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body as never), limit, createWriteStream(destination, { mode: 0o600 }), { signal });
  if (!bytes) throw new VideoError("The generated video was empty.");
}

async function runJob(job: InternalJob, input: VideoRequest) {
  const clipTimeout = 15 * 60_000;
  const userSignal = job.controller.signal;
  const ffmpeg = process.env.VIDEO_FFMPEG ?? "ffmpeg";
  let timedOut = false;
  try {
    await runVideoProcess(ffmpeg, ["-version"], userSignal);
    // Validate and normalize every starting image before creating any paid prediction.
    const preset = VIDEO_PRESETS[input.quality];
    const shots: VideoRequest["shots"] = [];
    for (const shot of input.shots) {
      userSignal.throwIfAborted();
      try {
        const bytes = await sharp(Buffer.from(shot.image.split(",")[1], "base64"), { limitInputPixels: 20_000_000 })
          .rotate().resize(preset.width, preset.height, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
        shots.push({ ...shot, image: `data:image/jpeg;base64,${bytes.toString("base64")}` });
      } catch { throw new VideoError(`Panel ${shot.panelNumber} has an unreadable image. Render it again before generating video.`, 400); }
    }
    await pruneOldVideos();
    await mkdir(job.directory, { recursive: true });
    await writeFile(path.join(job.directory, "request.json"), JSON.stringify({ ...input, shots }, null, 2), { mode: 0o600 });
    job.view.status = "running";
    for (const [index, shot] of shots.entries()) {
      const timeout = AbortSignal.timeout(clipTimeout);
      const signal = AbortSignal.any([userSignal, timeout]);
      const destination = path.join(job.directory, `shot-${index}.mp4`);
      job.view.message = `Generating shot ${index + 1} of ${input.shots.length} (panel ${shot.panelNumber})…`;
      try {
        signal.throwIfAborted();
        const url = await generateCloudClip(shot, input.quality, input.seed + index, signal);
        await downloadClip(url, destination, signal);
        if ((await stat(destination)).size < 100) throw new VideoError("No playable video was generated.");
        // Decode once before accepting the clip; catches provider and encoder failures.
        await runVideoProcess(ffmpeg, ["-v", "error", "-i", destination, "-f", "null", "-"], signal);
      } finally { timedOut = timeout.aborted; }
      userSignal.throwIfAborted();
      job.view.completedShots++;
      job.view.clips.push({ panelNumber: shot.panelNumber, url: `/api/videos/${job.view.id}/file?clip=${index}` });
    }
    job.view.message = "Joining shots into your storyboard video…";
    await writeFile(path.join(job.directory, "clips.txt"), input.shots.map((_, index) => `file 'shot-${index}.mp4'`).join("\n"));
    const assemblySignal = AbortSignal.any([userSignal, AbortSignal.timeout(120_000)]);
    await runVideoProcess(ffmpeg, ["-v", "error", "-y", "-f", "concat", "-safe", "1",
      "-i", path.join(job.directory, "clips.txt"), "-an", "-c:v", "copy", "-movflags", "+faststart",
      path.join(job.directory, "storyboard.mp4")], assemblySignal);
    userSignal.throwIfAborted();
    job.view.videoUrl = `/api/videos/${job.view.id}/file`;
    job.view.status = "complete";
    job.view.message = "Storyboard video ready.";
  } catch (error) {
    job.view.status = userSignal.aborted ? "cancelled" : "failed";
    job.view.message = userSignal.aborted ? "Video generation cancelled. Completed shots are kept."
      : timedOut ? "Video generation timed out. Try a short preview."
      : error instanceof VideoError ? error.message
      : "Video generation failed. Check Replicate and FFmpeg, then retry.";
    console.error("[video] Generation stopped", { id: job.view.id, model: VIDEO_MODEL, status: job.view.status,
      diagnostic: error instanceof Error && typeof error.cause === "string" ? error.cause : undefined });
  } finally {
    // Keep a reproducibility manifest next to the assets, without API secrets.
    try { await writeFile(path.join(job.directory, "result.json"), JSON.stringify(job.view, null, 2), { mode: 0o600 }); }
    catch { /* Preflight may have failed before creating the directory. */ }
  }
}

export async function videoFile(id: string, clip: string | null): Promise<string | undefined> {
  if (!idPattern.test(id) || (clip !== null && !/^[0-9]$/.test(clip))) return;
  const view = getVideoJob(id);
  // Persisted completed assets remain readable after a server restart.
  let saved = view;
  if (!saved) {
    try { saved = JSON.parse(await readFile(path.join(root(), id, "result.json"), "utf8")) as VideoJob; }
    catch { return; }
  }
  if (clip === null ? saved.status !== "complete" : Number(clip) >= saved.completedShots) return;
  return path.join(root(), id, clip === null ? "storyboard.mp4" : `shot-${clip}.mp4`);
}
