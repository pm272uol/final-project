import { beginDiagnostic } from "../diagnostics/server";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { VIDEO_PRESETS, type VideoRequest } from "./options";

export const REPLICATE_VIDEO_MODEL = "wan-video/wan-2.2-5b-fast";
export class VideoError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
const predictionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  status: z.enum(["starting", "processing", "succeeded", "failed", "canceled"]),
  output: z.string().nullable().optional(),
});

export function replicateVideoInput(shot: VideoRequest["shots"][number], quality: VideoRequest["quality"], seed: number) {
  const preset = VIDEO_PRESETS[quality];
  return { prompt: shot.prompt, image: shot.image, seed, num_frames: preset.frames,
    resolution: preset.resolution, aspect_ratio: "16:9", frames_per_second: preset.fps,
    go_fast: true, sample_shift: 12 };
}

export async function generateCloudClip(shot: VideoRequest["shots"][number], quality: VideoRequest["quality"], seed: number,
  signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) throw new VideoError("Cloud video needs REPLICATE_API_TOKEN on the server.", 503);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const trace = beginDiagnostic(`video_generation_panel_${shot.panelNumber}`, "replicate", REPLICATE_VIDEO_MODEL,
    { input: replicateVideoInput(shot, quality, seed) });
  let predictionId: string | undefined;
  let terminal = false;
  async function read(response: Response) {
    if (!response.ok) {
      if (response.status === 402) throw new VideoError("Replicate needs billing credit before generating video.", 402);
      if (response.status === 429) throw new VideoError("Replicate is busy. Try again shortly.", 429);
      if ([401, 403].includes(response.status)) throw new VideoError("Replicate rejected the server credentials.", 503);
      throw new VideoError(`Replicate video request failed (HTTP ${response.status}).`);
    }
    const parsed = predictionSchema.safeParse(await response.json());
    if (!parsed.success) throw new VideoError("Replicate returned an invalid video response.");
    return parsed.data;
  }
  try {
    signal.throwIfAborted();
    // Creation uses its own short timeout so an immediate cancellation can still
    // obtain the prediction ID and cancel the paid remote work.
    let prediction = await read(await fetcher(`https://api.replicate.com/v1/models/${REPLICATE_VIDEO_MODEL}/predictions`, {
      method: "POST", headers, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ input: replicateVideoInput(shot, quality, seed) }),
    }));
    predictionId = prediction.id;
    for (;;) {
      signal.throwIfAborted();
      trace.output(prediction);
      terminal = ["succeeded", "failed", "canceled"].includes(prediction.status);
      if (prediction.status === "succeeded") {
        if (!prediction.output) throw new VideoError("Replicate returned no video.");
        const url = new URL(prediction.output);
        if (url.protocol !== "https:" || url.port || url.username || url.password ||
          !(url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"))) {
          throw new VideoError("Replicate returned an unsupported video location.");
        }
        trace.finish();
        return url.href;
      }
      if (terminal) throw new VideoError(prediction.status === "canceled" ? "Cloud video was cancelled." : "Replicate could not generate this shot. Retry the preview.");
      await delay(2000, undefined, { signal });
      prediction = await read(await fetcher(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers, signal }));
    }
  } catch (error) {
    trace.finish(error);
    throw error;
  } finally {
    if (predictionId && !terminal) {
      try {
        const response = await fetcher(`https://api.replicate.com/v1/predictions/${predictionId}/cancel`, {
          method: "POST", headers, signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) console.error("[video] Remote cancellation failed", { predictionId, status: response.status });
      } catch { console.error("[video] Remote cancellation could not be confirmed", { predictionId }); }
    }
  }
}
