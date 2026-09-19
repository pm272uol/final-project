"use client";

import {
  DURATIONS,
  GENRES,
  PANEL_COUNTS,
  TARGET_FORMATS,
  TONES,
  VISUAL_STYLES,
} from "@/lib/storyboardOptions";
import {
  ReferenceImagePanel,
  type ReferenceImageDraft,
} from "@/components/ReferenceImagePanel";
import { VoiceNotePanel } from "@/components/VoiceNotePanel";
import type { StoryboardInput } from "@/types/storyboard";

type Props = {
  input: StoryboardInput;
  loading: boolean;
  onChange: (input: StoryboardInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  references: ReferenceImageDraft[];
  visualSummary: string;
  onReferencesChange: (references: ReferenceImageDraft[]) => void;
  onVisualSummaryChange: (summary: string) => void;
};

export function SceneInputForm({
  input,
  loading,
  onChange,
  onSubmit,
  onCancel,
  references,
  visualSummary,
  onReferencesChange,
  onVisualSummaryChange,
}: Props) {
  const update = <Key extends keyof StoryboardInput>(
    key: Key,
    value: StoryboardInput[Key],
  ) => onChange({ ...input, [key]: value });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-6"
    >
      <div>
        <label className="label" htmlFor="sceneIdea">
          01 / Scene idea
        </label>
        <textarea
          id="sceneIdea"
          className="field min-h-36 resize-y text-base leading-relaxed"
          value={input.sceneIdea}
          onChange={(event) => update("sceneIdea", event.target.value)}
          placeholder="Describe one visual moment, conflict, or discovery..."
          required
        />
        <div className="mt-2 flex justify-between gap-3 text-xs text-ink/55">
          <span>One clear scene works best.</span>
          <span className="mono">{input.sceneIdea.length} chars</span>
        </div>
        <VoiceNotePanel disabled={loading} remainingChars={1200 - input.sceneIdea.trim().length - (input.sceneIdea.trim() ? 2 : 0)} onAppend={(text) => update("sceneIdea", [input.sceneIdea.trim(), text].filter(Boolean).join("\n\n"))} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectField label="Visual style" value={input.visualStyle} options={VISUAL_STYLES} onChange={value => update("visualStyle", value as StoryboardInput["visualStyle"])} />
        <SelectField label="Panels" value={String(input.panelCount)} options={PANEL_COUNTS.map(String)} onChange={value => update("panelCount", Number(value) as StoryboardInput["panelCount"])} />
      </div>
      <fieldset>
        <legend className="text-sm font-bold">Scene settings</legend>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <SelectField label="Genre" value={input.genre} options={GENRES} onChange={value => update("genre", value as StoryboardInput["genre"])} />
          <SelectField label="Duration" value={input.duration} options={DURATIONS} onChange={value => update("duration", value as StoryboardInput["duration"])} />
          <SelectField label="Tone" value={input.tone} options={TONES} onChange={value => update("tone", value as StoryboardInput["tone"])} />
          <SelectField label="Deliverable" value={input.targetFormat} options={TARGET_FORMATS} onChange={value => update("targetFormat", value as StoryboardInput["targetFormat"])} />
        </div>
      </fieldset>
      <details>
        <summary className="cursor-pointer text-sm font-bold">Add visual references (optional)</summary>
        <div className="mt-4"><ReferenceImagePanel references={references} summary={visualSummary} disabled={loading} onReferencesChange={onReferencesChange} onSummaryChange={onVisualSummaryChange} /></div>
      </details>

      <button
        type="submit"
        data-testid="generate-button"
        disabled={
          loading ||
          !input.sceneIdea.trim() ||
          (references.length > 0 && !visualSummary.trim())
        }
        aria-disabled={
          loading ||
          !input.sceneIdea.trim() ||
          (references.length > 0 && !visualSummary.trim())
        }
        className="group flex w-full items-center justify-between border-[1.5px] border-ink bg-ink px-5 py-4 text-left text-paper shadow-[5px_5px_0_#d8ff52] transition hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#d8ff52] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="font-bold">
          {loading
            ? "Generating storyboard..."
            : "Generate storyboard"}
        </span>
        <span
          aria-hidden="true"
          className="mono text-xl transition-transform group-hover:translate-x-1"
        >
          {loading ? "•••" : "→"}
        </span>
      </button>
      {loading ? (
        <button
          type="button"
          onClick={onCancel}
          className="w-full border-[1.5px] border-ink bg-paper px-5 py-3 text-sm font-bold transition hover:bg-rust hover:text-white"
        >
          Cancel generation
        </button>
      ) : null}
    </form>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const id = `constraint-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div>
      <label
        className="mb-1.5 block text-xs font-bold"
        htmlFor={id}
      >
        {label}
      </label>
      <select
        id={id}
        className="field cursor-pointer text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}
