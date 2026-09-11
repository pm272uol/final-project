import { z } from "zod";
import type { StoryboardPackage } from "@/types/storyboard";

export const imageEstimateConfigSchema = z.object({
  provider: z.enum(["mock", "replicate"]), model: z.string().min(1), usdPerImage: z.number().nonnegative().nullable(), priceBasis: z.string(), batchIntervalMs: z.number().nonnegative(),
});
export type ImageEstimateConfig = z.infer<typeof imageEstimateConfigSchema>;
export function estimateConfig(provider: "mock" | "replicate", model: string, price: string | undefined, basis: string | undefined): ImageEstimateConfig {
  const number = price?.trim() ? Number(price) : NaN;
  const valid = Number.isFinite(number) && number >= 0 && Boolean(basis?.trim());
  return { provider, model, usdPerImage: provider === "mock" ? 0 : valid ? number : null,
    priceBasis: provider === "mock" ? "Local deterministic mock: no provider charge" : valid ? basis!.trim() : "No valid current per-image price and basis configured",
    batchIntervalMs: provider === "replicate" ? 12000 : 0,
  };
}
export function estimateGeneration(board: StoryboardPackage, config: ImageEstimateConfig, count: number) {
  const seen = new Set<string>();
  const samples = board.storyboard.flatMap(p => [p, ...(p.imageHistory ?? [])])
    .filter(p => {
      if (!p.imageUrl || !p.imageGeneratedAt || p.imageProvider !== config.provider || p.imageModel !== config.model || p.imageGenerationDurationMs === undefined || !Number.isFinite(p.imageGenerationDurationMs) || p.imageGenerationDurationMs < 0) return false;
      const key = `${p.imageProvider}/${p.imageModel}/${p.imageGeneratedAt}/${p.imageSeed}`;
      if (seen.has(key)) return false; seen.add(key); return true;
    }).sort((a, b) => b.imageGeneratedAt!.localeCompare(a.imageGeneratedAt!)).slice(0, 20).map(p => p.imageGenerationDurationMs!);
  const batchTime = (duration: number) => count ? (count - 1) * Math.max(config.batchIntervalMs, duration) + duration : 0;
  const average = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
  return {
    count, costUsd: count === 0 ? 0 : config.usdPerImage === null ? null : config.usdPerImage * count,
    expectedMs: count === 0 ? 0 : average === null ? null : batchTime(average),
    lowMs: samples.length ? batchTime(Math.min(...samples)) : null,
    highMs: samples.length ? batchTime(Math.max(...samples)) : null,
    samples: samples.length, observedTotalMs: samples.reduce((a, b) => a + b, 0),
  };
}
