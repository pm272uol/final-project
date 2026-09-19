"use client";
import { MAX_PANELS, sequencePanels } from "@/lib/panelSequence";
import { useEffect, useState } from "react";
import type { StoryboardPackage, StoryboardPanel } from "@/types/storyboard";
import { SHOT_TYPES } from "@/lib/storyboardOptions";
import { generatedStoryboardPanelSchema } from "@/lib/storyboardSchema";
import { shotPromptIssues } from "@/lib/image-generation/promptBuilder";
import { restorePanelImage } from "@/lib/panelRevision";

export function PanelRevisionControls({ data, busy, onChange, onGenerate, onBatch, onReset }: {
  data: StoryboardPackage; busy: boolean; onChange: (data: StoryboardPackage) => void; onGenerate: (n: number, sameSeed: boolean) => void;
  onBatch: (mode: "missing" | "failed" | "selected") => void; onReset: () => void;
}) {
  const update = (panel: StoryboardPanel) => onChange({ ...data, storyboard: data.storyboard.map(p => p.panelNumber === panel.panelNumber ? panel : p) });
  return <section className="paper-card p-5 space-y-3" aria-label="Panel revisions">
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} className="border p-2" onClick={() => onBatch("failed")}>Retry failed images</button>
      <button disabled={busy || !data.storyboard.some(p => p.imageSelected && !p.imageApproved)} className="border p-2" onClick={() => onBatch("selected")}>Regenerate selected panels</button>
      <button disabled={busy} className="border p-2" onClick={onReset}>New scene</button>
    </div>
    {data.storyboard.map((panel, index) => <details key={panel.panelId ?? panel.panelNumber} className="border p-3"><summary>Edit panel {panel.panelNumber}</summary>
      <fieldset disabled={busy} className="space-y-3 mt-3">
        <div className="flex flex-wrap gap-2" aria-label={`Sequence panel ${panel.panelNumber}`}>
          <button className="border p-2" disabled={index === 0} onClick={() => onChange(sequencePanels(data, index, "up"))}>Move panel {panel.panelNumber} up</button>
          <button className="border p-2" disabled={index === data.storyboard.length - 1} onClick={() => onChange(sequencePanels(data, index, "down"))}>Move panel {panel.panelNumber} down</button>
          <button className="border p-2" disabled={data.storyboard.length >= MAX_PANELS} onClick={() => onChange(sequencePanels(data, index, "insert"))}>Insert after panel {panel.panelNumber}</button>
          <button className="border p-2" disabled={data.storyboard.length >= MAX_PANELS} onClick={() => onChange(sequencePanels(data, index, "duplicate"))}>Duplicate panel {panel.panelNumber}</button>
          <button className="border p-2" disabled={data.storyboard.length === 1} onClick={() => { if (window.confirm(`Delete panel ${panel.panelNumber} and its image history?`)) onChange(sequencePanels(data, index, "delete")); }}>Delete panel {panel.panelNumber}</button>
        </div>
        <label className="block"><input type="checkbox" disabled={!panel.imageUrl} checked={panel.imageApproved ?? false} onChange={e => update({ ...panel, imageApproved: e.target.checked })} />Lock image for panel {panel.panelNumber}</label>
        {panel.imageNeedsReview && <button className="border p-2" onClick={() => update({ ...panel, imageNeedsReview: false })}>Keep current image</button>}
        <fieldset disabled={panel.imageApproved} className="space-y-3">
          <label className="block"><input type="checkbox" checked={panel.imageSelected ?? false} onChange={e => update({ ...panel, imageSelected: e.target.checked })} />Select panel {panel.panelNumber} for regeneration</label>
          <ShotEditor key={`${panel.panelNumber}-${panel.imageGeneratedAt}`} panel={panel} data={data} onSave={update} />
          <button disabled={panel.imageSeed === undefined} className="border p-2" onClick={() => onGenerate(panel.panelNumber, true)}>Retry panel {panel.panelNumber} with same seed</button>
          <p className="text-xs">Seed: {panel.imageSeed ?? "not generated"}. Same seed reuses current settings; it does not guarantee continuity.</p>
          <div className="flex flex-wrap gap-2">{panel.imageHistory?.map((image, index) => <div key={index} className="w-40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.imageUrl} alt={`Panel ${panel.panelNumber} alternative ${index + 1}`} />
            <button className="border p-2" onClick={() => update(restorePanelImage(panel, index))}>Restore alternative {index + 1}</button>
          </div>)}</div>
        </fieldset>
      </fieldset>
    </details>)}
  </section>;
}
function ShotEditor({ panel, data, onSave }: { panel: StoryboardPanel; data: StoryboardPackage; onSave: (p: StoryboardPanel) => void }) {
  const [draft, setDraft] = useState(panel), [error, setError] = useState("");
  useEffect(() => { setDraft(panel); }, [panel]);
  return <div className="space-y-2">
    <label className="block">Shot type for panel {panel.panelNumber}<select value={draft.shotType} onChange={e => setDraft({ ...draft, shotType: e.target.value as StoryboardPanel["shotType"] })}>{SHOT_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
    {([ ["storyBeat", "Story beat"], ["dialogueOrNarration", "Dialogue or narration"], ["sound", "Sound"], ["productionNote", "Production note"], ["imagePrompt", "Draft image prompt"], ["negativePrompt", "Draft negative prompt"], ["action", "Action"], ["cameraDirection", "Framing and camera"], ["setting", "Setting"], ["shotInstructions", "Image instructions"] ] as const).map(([key, label]) => <label key={key} className="block">{label} for panel {panel.panelNumber}<textarea aria-label={`${label} for panel ${panel.panelNumber}`} className="w-full border p-2" value={draft[key] ?? ""} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}
    <button className="border p-2" onClick={() => {
      const fields = { storyBeat: draft.storyBeat, dialogueOrNarration: draft.dialogueOrNarration, sound: draft.sound, productionNote: draft.productionNote, imagePrompt: draft.imagePrompt, negativePrompt: draft.negativePrompt, action: draft.action, cameraDirection: draft.cameraDirection, setting: draft.setting, shotInstructions: draft.shotInstructions, shotType: draft.shotType };
      const candidate = { ...panel, ...fields };
      const parsed = generatedStoryboardPanelSchema.strip().safeParse(candidate);
      const issues = shotPromptIssues(candidate, { visualBible: data.visualBible, visualStyle: data.visualStyle, characterContinuity: "" });
      if (!parsed.success || issues.length) { setError(issues.join(" ") || "Complete all shot fields."); return; }
      onSave({ ...candidate, imageNeedsReview: panel.imageNeedsReview || (Boolean(panel.imageUrl) && ["storyBeat", "action", "cameraDirection", "setting", "shotInstructions", "shotType", "imagePrompt", "negativePrompt"].some(key => panel[key as keyof StoryboardPanel] !== candidate[key as keyof StoryboardPanel])) }); setError("");
    }}>Save panel {panel.panelNumber} edits</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
