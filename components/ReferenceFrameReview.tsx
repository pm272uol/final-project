"use client";
import { useState } from "react";
import type { StoryboardPackage, VisualReference } from "@/types/storyboard";

export function ReferenceFrameReview({ data, busy, onChange, onGenerate, onUseUploads }: {
  onUseUploads?: () => void;
  data: StoryboardPackage; busy: boolean; onChange: (refs: VisualReference[]) => void; onGenerate: () => void;
}) {
  const [error, setError] = useState("");
  const refs = data.visualReferences ?? [];
  return <section className="paper-card p-5 space-y-3" aria-label="Reference frame review">
    <h2 className="display text-3xl">Reference frame</h2>
    <p className="text-sm">Generate panel 1, then select and approve a style reference before rendering the sequence. Approved images are sent to Replicate when hosted rendering is configured. Style conditioning does not guarantee character identity.</p>
    <button disabled={busy || data.visualBible?.approvedVersion !== data.visualBible?.version} onClick={onGenerate} className="border border-ink p-2">Generate reference frame</button>
    {onUseUploads && <button disabled={busy} className="border p-2" onClick={onUseUploads}>Use uploaded scene references</button>}
    <label className="block">Upload a style reference<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async event => {
      const file = event.target.files?.[0]; if (!file) return;
      if (file.size > 5_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Choose a PNG, JPEG or WebP under 5 MB."); return; }
      try { const imageUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      onChange([...refs, { id: crypto.randomUUID(), imageUrl, purpose: "style", approved: false, version: refs.length + 1 }]); setError(""); } catch { setError("Unable to read reference."); }
      event.target.value = "";
    }} /></label>
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-3">{refs.filter(r => r.purpose === "style").map(ref => <div key={ref.id} className="w-48 space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ref.imageUrl} alt={`Style reference ${ref.version}`} className="aspect-video object-cover" />
      <button disabled={busy} className="border border-ink p-2" onClick={() => onChange(refs.map(r => r.purpose === "style" ? { ...r, approved: r.id === ref.id } : r))}>{ref.approved ? "Active approved reference" : "Approve this reference"}</button>
    </div>)}</div>
  </section>;
}
