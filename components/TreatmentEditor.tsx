"use client";
import { useState } from "react";
import type { StoryboardPackage } from "@/types/storyboard";
import { storyboardPackageSchema } from "@/lib/storyboardSchema";
import { reviseVisualBible } from "@/lib/visualBible";

export function TreatmentEditor({ data, busy, onChange }: { data: StoryboardPackage; busy: boolean; onChange: (board: StoryboardPackage) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data);
  const [error, setError] = useState("");
  const field = (label: string, value: string, change: (value: string) => void) => <label className="block" key={label}>{label}<textarea aria-label={label} className="block w-full border p-2" value={value} onChange={e => change(e.target.value)} /></label>;
  return <section className="paper-card p-5 space-y-3" aria-label="Treatment editing">
    <button className="border p-2" disabled={busy} onClick={() => { setDraft(data); setError(""); setEditing(!editing); }}>{editing ? "Cancel treatment edits" : "Edit treatment and production bible text"}</button>
    {editing && <fieldset disabled={busy} className="space-y-3">
      {([ ["title", "Title"], ["logline", "Logline"], ["genre", "Treatment genre"], ["tone", "Treatment tone"], ["visualStyle", "Treatment visual style"], ["estimatedDuration", "Treatment duration"] ] as const).map(([key, label]) => field(label, draft[key], value => setDraft({ ...draft, [key]: value })))}
      {draft.characters.map((c, i) => <div key={i} className="border p-3 space-y-2">
        {(["name", "visualDescription", "personality"] as const).map(key => field(`Character ${i + 1} ${key}`, c[key], value => setDraft({ ...draft, characters: draft.characters.map((entry, n) => n === i ? { ...entry, [key]: value } : entry) })))}
        <label>Character {i + 1} role<select value={c.role} onChange={e => setDraft({ ...draft, characters: draft.characters.map((entry, n) => n === i ? { ...entry, role: e.target.value as typeof c.role } : entry) })}>{["protagonist", "supporting", "antagonist", "background"].map(role => <option key={role}>{role}</option>)}</select></label>
      </div>)}
      {draft.locations.map((l, i) => <div key={i} className="border p-3 space-y-2">{(["name", "description", "mood"] as const).map(key => field(`Location ${i + 1} ${key}`, l[key], value => setDraft({ ...draft, locations: draft.locations.map((entry, n) => n === i ? { ...entry, [key]: value } : entry) })))}</div>)}
      {field("Continuity notes (one per line)", draft.continuityNotes.join("\n"), value => setDraft({ ...draft, continuityNotes: value.split("\n") }))}
      {field("Production notes (one per line)", draft.productionNotes.join("\n"), value => setDraft({ ...draft, productionNotes: value.split("\n") }))}
      <p className="text-xs">Changes to visual style, cast or location descriptions update the visual bible and require renewed approval.</p>
      <button className="border p-2" onClick={() => {
        const parsed = storyboardPackageSchema.safeParse({ ...data, ...draft, storyboard: data.storyboard, visualBible: data.visualBible, visualReferences: data.visualReferences });
        if (!parsed.success) { setError(parsed.error.issues.map(i => i.message).join(" ")); return; }
        let next: StoryboardPackage = parsed.data;
        const changed = draft.visualStyle !== data.visualStyle || JSON.stringify(draft.characters) !== JSON.stringify(data.characters) || JSON.stringify(draft.locations) !== JSON.stringify(data.locations);
        if (changed && data.visualBible) next = reviseVisualBible(next, { ...data.visualBible, selectedStyle: draft.visualStyle, medium: draft.visualStyle,
          characters: data.visualBible.characters.map((c, i) => ({ ...c, name: draft.characters[i]?.name ?? c.name, appearance: draft.characters[i]?.visualDescription ?? c.appearance })),
          locations: data.visualBible.locations.map((l, i) => ({ ...l, name: draft.locations[i]?.name ?? l.name, architecture: draft.locations[i]?.description ?? l.architecture, visualDetails: draft.locations[i]?.mood ?? l.visualDetails })),
        });
        onChange(next); setEditing(false); setError("");
      }}>Save treatment edits</button>
      {error && <p role="alert">{error}</p>}
    </fieldset>}
  </section>;
}
