"use client";
import { useState } from "react";
import type { VisualBible } from "@/lib/visualBible";

export function VisualBibleReview({ bible, busy, onSave, onApprove }: {
  bible: VisualBible; busy: boolean; onSave: (draft: VisualBible) => void; onApprove: () => void;
}) {
  const [draft, setDraft] = useState(bible);
  const dirty = JSON.stringify(draft) !== JSON.stringify(bible);
  function field(label: string, value: string, change: (value: string) => void) {
    return <label className="block text-sm" key={label}>{label}<textarea aria-label={label} className="mt-1 w-full border border-ink bg-paper p-2" value={value} onChange={e => change(e.target.value)} required={label !== "reference Direction"} maxLength={2000} /></label>;
  }
  return <form className="space-y-4 border border-ink bg-paper p-5" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
    <h2 className="display text-3xl">Review visual bible</h2>
    <p role="status">Version {bible.version} · {bible.approvedVersion === bible.version ? "Approved" : "Awaiting approval"}</p>
    <p className="text-sm">Review shared visual direction before generating images. Defaults come from the storyboard descriptions; refine any unspecified details here. Saving changes requires approval again and marks existing images for review.</p>
    <fieldset disabled={busy} className="space-y-4 disabled:opacity-50">
      <p>Selected style: {bible.selectedStyle}</p>
      {(["referenceDirection", "medium", "palette", "linework", "texture", "renderingTreatment", "lightingRules"] as const).map(key => field(key.replace(/([A-Z])/g, " $1"), draft[key], value => setDraft({ ...draft, [key]: value })))}
      {(["characters", "locations"] as const).map(group => <div key={group} className="space-y-3"><h3 className="font-bold capitalize">{group}</h3>{draft[group].map((entry, index) => <details key={entry.id}><summary>{entry.name} ({entry.id})</summary>{Object.entries(entry).filter(([key]) => key !== "id").map(([key, value]) => field(`${entry.id} ${key}`, value, next => setDraft({ ...draft, [group]: draft[group].map((item, i) => i === index ? { ...item, [key]: next } : item) })))}</details>)}</div>)}
      <div className="flex flex-wrap gap-3">
        <button className="border border-ink px-3 py-2 disabled:opacity-50" disabled={!dirty} type="submit">Save visual bible</button>
        <button className="border border-ink bg-acid px-3 py-2 disabled:opacity-50" type="button" disabled={dirty || bible.approvedVersion === bible.version} onClick={onApprove}>Approve visual direction</button>
      </div>
    </fieldset>
  </form>;
}
