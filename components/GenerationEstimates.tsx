"use client";
import { useState } from "react";
import type { GenerationMetadata, StoryboardPackage } from "@/types/storyboard";
import { estimateGeneration, type ImageEstimateConfig } from "@/lib/generationEstimates";
import { pendingPanels } from "@/lib/panelRevision";

const cost = (value: number | null) => value === null ? "Unknown" : `$${value.toFixed(4)}`;
const seconds = (value: number | null) => value === null ? "Unknown" : `${(value / 1000).toFixed(1)}s`;
export function GenerationEstimates({ data, config, metadata }: { data: StoryboardPackage; config: ImageEstimateConfig | null; metadata: GenerationMetadata | null }) {
  const [selected, setSelected] = useState(1);
  const number = data.storyboard.some(p => p.panelNumber === selected) ? selected : 1;
  const panel = data.storyboard.find(p => p.panelNumber === number)!;
  const rows = [
    { label: `Only panel ${number}`, count: panel.imageApproved || panel.imageStatus === "generating" ? 0 : 1 },
    { label: "Missing images", count: pendingPanels(data.storyboard, "missing").length },
    { label: "Selected regeneration", count: pendingPanels(data.storyboard, "selected").length },
    { label: "All unlocked images", count: data.storyboard.filter(p => !p.imageApproved && p.imageStatus !== "generating").length },
  ];
  const observations = config ? estimateGeneration(data, config, 1) : null;
  return <section className="paper-card p-5 space-y-3" aria-label="Generation estimates">
    <h2 className="display text-3xl">Generation estimates</h2>
    <p className="text-sm">{config ? `${config.provider} / ${config.model}` : "Provider configuration unavailable; estimates unknown."}</p>
    <label>Compare one panel<select aria-label="Estimate panel" value={number} onChange={e => setSelected(Number(e.target.value))}>{data.storyboard.map(p => <option key={p.panelNumber} value={p.panelNumber}>Panel {p.panelNumber}</option>)}</select></label>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Scope</th><th className="p-2">Images</th><th className="p-2">Estimated USD</th><th className="p-2">Estimated time</th></tr></thead>
      <tbody>{rows.map(row => { const estimate = config ? estimateGeneration(data, config, row.count) : null; return <tr className="border-t" key={row.label}><th className="p-2">{row.label}</th><td className="p-2">{row.count}</td><td className="p-2">{cost(estimate?.costUsd ?? null)}</td><td className="p-2">{seconds(estimate?.expectedMs ?? null)}</td></tr>; })}</tbody>
    </table></div>
    <p className="text-xs">Price basis: {config?.priceBasis ?? "Unavailable"}. Cost figures are estimates, not billed usage. They exclude retries, reference generation and other services.</p>
    <p className="text-xs">Time basis: {observations?.samples ?? 0} distinct successful retained renders for this provider and model (up to 20). Observed per-image range: {seconds(observations?.lowMs ?? null)}–{seconds(observations?.highMs ?? null)}. Batch estimates include {seconds(config?.batchIntervalMs ?? null)} minimum spacing between request starts. Network overhead, failed attempts and provider queues can increase elapsed time.</p>
    {metadata && <p className="text-xs">Last storyboard generation: measured {(metadata.durationMs / 1000).toFixed(1)}s; reported tokens {metadata.promptTokens ?? "unknown"} input / {metadata.completionTokens ?? "unknown"} output; token-based cost estimate {cost(metadata.estimatedCostUsd ?? null)}.</p>}
  </section>;
}
