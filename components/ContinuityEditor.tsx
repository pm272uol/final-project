"use client";
import { useState } from "react";
import type { StoryboardPackage } from "@/types/storyboard";
import { resolveShotReferences } from "@/lib/image-generation/promptBuilder";

export function ContinuityEditor({ data, busy, onChange }: { data: StoryboardPackage; busy: boolean; onChange: (data: StoryboardPackage) => void }) {
  const [error, setError] = useState("");
  const bible = data.visualBible;
  if (!bible) return null;
  return <details className="paper-card p-5"><summary className="cursor-pointer font-bold">Character and location continuity</summary>
    <fieldset disabled={busy} className="space-y-4 mt-4">
      <p className="text-sm">Active character sheets, locations and the style frame are sent as separate reference images. Klein may still blend identities or introduce extra subjects; inspect every frame. At most five relevant references can be sent per shot.</p>
      {([ ...bible.characters.map(c => ({ ...c, purpose: "character" as const })), ...bible.locations.map(l => ({ ...l, purpose: "location" as const })) ]).map(entity => <div key={entity.id} className="border p-3">
        <label>{entity.name} reference<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          if (file.size > 5_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Choose a PNG, JPEG or WebP under 5 MB."); return; }
          const reader = new FileReader(); reader.onerror = () => setError("Unable to read reference.");
          reader.onload = () => onChange({ ...data, visualReferences: [...(data.visualReferences ?? []).filter(r => r.entityId !== entity.id), { id: crypto.randomUUID(), imageUrl: String(reader.result), purpose: entity.purpose, entityId: entity.id, approved: false, version: (data.visualReferences?.find(r => r.entityId === entity.id)?.version ?? 0) + 1 }], storyboard: data.storyboard.map(p => ({ ...p, imageNeedsReview: Boolean(p.imageUrl) })) });
          reader.readAsDataURL(file);
        }} /></label>
        {data.visualReferences?.filter(r => r.entityId === entity.id).map(ref => <div key={ref.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ref.imageUrl} alt={`${entity.name} reference`} className="w-40" />
          <label><input type="checkbox" checked={ref.approved} onChange={e => onChange({ ...data, visualReferences: data.visualReferences?.map(r => r.id === ref.id ? { ...r, approved: e.target.checked } : r), storyboard: data.storyboard.map(p => ({ ...p, imageNeedsReview: Boolean(p.imageUrl) })) })} />Use {entity.name} reference for image generation</label>
        </div>)}
      </div>)}
      {data.storyboard.map(original => {
        const panel = resolveShotReferences(original, { visualBible: bible, visualStyle: data.visualStyle, characterContinuity: "" });
        const update = (values: Partial<typeof panel>) => onChange({ ...data, storyboard: data.storyboard.map(p => p.panelNumber === panel.panelNumber ? { ...panel, ...values, imageNeedsReview: Boolean(p.imageUrl) } : p) });
        return <div key={panel.panelNumber} className="border p-3 space-y-2"><h3>Panel {panel.panelNumber} · {panel.characterIds?.length ?? 0} visible characters</h3>
          {bible.characters.map(c => <label key={c.id} className="block"><input type="checkbox" checked={panel.characterIds?.includes(c.id) ?? false} onChange={e => update({ characterIds: e.target.checked ? [...(panel.characterIds ?? []), c.id] : panel.characterIds?.filter(id => id !== c.id), continuityChanges: panel.continuityChanges?.filter(change => change.characterId !== c.id) })} />{c.name}</label>)}
          <label className="block">Panel {panel.panelNumber} location<select value={panel.locationIds?.[0] ?? ""} onChange={e => update({ locationIds: e.target.value ? [e.target.value] : [] })}><option value="">No recurring location</option>{bible.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="block">Panel {panel.panelNumber} visible props<input className="w-full border p-2" value={panel.visibleProps?.join(", ") ?? ""} onChange={e => update({ visibleProps: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} /></label>
          {bible.characters.filter(c => panel.characterIds?.includes(c.id)).map(c => <label className="block" key={c.id}>{c.name}: intentional appearance and wardrobe change for panel {panel.panelNumber}<input className="w-full border p-2" placeholder="Full replacement appearance, including wardrobe; blank keeps defaults" value={panel.continuityChanges?.find(x => x.characterId === c.id)?.appearance ?? ""} onChange={e => update({ continuityChanges: [...(panel.continuityChanges ?? []).filter(x => x.characterId !== c.id), ...(e.target.value.trim() ? [{ characterId: c.id, appearance: e.target.value, reason: "User-directed appearance and wardrobe change in this shot" }] : [])] })} /></label>)}
          <p className="text-xs">Review character count, wardrobe, recurring props and location details against the rendered image.</p>
        </div>;
      })}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  </details>;
}
