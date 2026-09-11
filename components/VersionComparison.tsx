"use client";
import { useState } from "react";
import type { GenerationMetadata, StoryboardInput, StoryboardPackage } from "@/types/storyboard";
import { captureVersion, inputCondition, MAX_VERSIONS, type StoryboardVersion } from "@/lib/versions";
import { sequenceTiming } from "@/lib/timing";

export function VersionComparison({ input, data, metadata, versions, busy, onChange, onRestore }: {
  input: StoryboardInput; data: StoryboardPackage; metadata: GenerationMetadata | null; versions: StoryboardVersion[]; busy: boolean;
  onChange: (versions: StoryboardVersion[]) => void; onRestore: (version: StoryboardVersion) => void;
}) {
  const [label, setLabel] = useState(""), [condition, setCondition] = useState("");
  const [left, setLeft] = useState("current"), [right, setRight] = useState(""), [error, setError] = useState("");
  const current = { id: "current", label: "Current workspace", input, storyboard: data, metadata, condition: inputCondition(input), createdAt: "" };
  const choices = [current, ...versions];
  const a = choices.find(v => v.id === left) ?? current, b = choices.find(v => v.id === right);
  return <section className="paper-card p-5 space-y-4" aria-label="Storyboard versions">
    <h2 className="display text-3xl">Compare versions</h2>
    <p className="text-xs">Capture a revision before editing. Successful new generations also preserve the previous output and its exact generation input. Label audio conditions explicitly because transcripts are merged into the scene text.</p>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block">Version name<input className="block w-full border p-2" aria-label="Version name" maxLength={200} value={label} onChange={e => setLabel(e.target.value)} /></label>
      <label className="block">Input condition label<input className="block w-full border p-2" aria-label="Input condition label" placeholder="For example: text only, text + sketch, text + voice note" maxLength={500} value={condition} onChange={e => setCondition(e.target.value)} /></label>
      <button className="border p-2" disabled={versions.length >= MAX_VERSIONS} onClick={() => {
        try { const version = captureVersion(input, data, metadata, label.trim() || `Version ${versions.length + 1}`, condition.trim() || inputCondition(input)); onChange([...versions, version]); setRight(version.id); setLabel(""); setCondition(""); setError(""); }
        catch { setError("This version could not be captured. Check the scene input and storyboard fields."); }
      }}>Capture version</button>
      <p className="text-xs">{versions.length} / {MAX_VERSIONS} snapshots. Snapshots include images and are saved with the project and recovery workspace.</p>
    </fieldset>
    <div className="flex flex-wrap gap-3">
      <label>Left version<select aria-label="Left version" value={a.id} onChange={e => setLeft(e.target.value)}>{choices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
      <label>Right version<select aria-label="Right version" value={b?.id ?? ""} onChange={e => setRight(e.target.value)}><option value="">Choose a version</option>{choices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
    </div>
    {b && <div className="grid gap-4 md:grid-cols-2" data-testid="version-comparison">{[a, b].map((v, i) => <div key={i} className="min-w-0 border p-3 space-y-3">
      <h3 className="font-bold">{v.label}</h3>
      <p>{v.condition}</p><p className="text-xs">{v.createdAt && new Date(v.createdAt).toLocaleString()} · {v.metadata ? `${v.metadata.provider} / ${v.metadata.model}` : "Generation metadata unavailable"}</p>
      <details><summary>Generation input and settings</summary><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify({ input: v.input, metadata: v.metadata }, null, 2)}</pre></details>
      <p className="font-bold">{v.storyboard.title}</p><p>{v.storyboard.logline}</p>
      <p>{v.storyboard.storyboard.length} shots · {sequenceTiming(v.storyboard, v.input.duration).total.toFixed(1)}s</p>
      {v.storyboard.storyboard.map(p => <article className="border-t pt-3 space-y-2" key={p.panelNumber}>
        <p>Shot {p.panelNumber} · {p.shotType}</p>
        {p.imageUrl && <>{/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="w-full aspect-video object-contain" src={p.imageUrl} alt={`${v.label}, shot ${p.panelNumber}`} /></>}
        <p>{p.storyBeat}</p><p>{p.action}</p><p>{p.dialogueOrNarration}</p>{p.sound && <p>Sound: {p.sound}</p>}
        <details><summary>Full shot details</summary><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify({ camera: p.cameraDirection, setting: p.setting, production: p.productionNote, duration: p.durationSeconds, prompt: p.imagePrompt }, null, 2)}</pre></details>
      </article>)}
      {v.id !== "current" && <div className="flex flex-wrap gap-2">
        <button className="border p-2" disabled={busy || versions.length >= MAX_VERSIONS} onClick={() => { if (window.confirm(`Restore ${v.label}? The current workspace will be captured first.`)) onRestore(v); }}>Restore {v.label}</button>
        <button className="border p-2" disabled={busy} onClick={() => { if (window.confirm(`Delete snapshot ${v.label}?`)) onChange(versions.filter(entry => entry.id !== v.id)); }}>Delete {v.label}</button>
      </div>}
    </div>)}</div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
