"use client";

import { useEffect, useRef, useState } from "react";
import {
  DURATIONS,
  GENRES,
  PANEL_COUNTS,
  TONES,
  VISUAL_STYLES,
} from "@/lib/storyboardOptions";
import { VoiceNotePanel } from "@/components/VoiceNotePanel";
import { ReferenceImagePanel, type ReferenceImageDraft } from "@/components/ReferenceImagePanel";
import type { StoryboardInput } from "@/types/storyboard";
import { sceneIdeaVariationSchema, type RecentSceneIdea } from "@/lib/sceneIdea";

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
  hasStoryboard: boolean;
  hasUnappliedChanges: boolean;
  onBusyChange?: (busy: boolean) => void;
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
  hasStoryboard,
  hasUnappliedChanges,
  onBusyChange,
}: Props) {
  const [generatingIdea, setGeneratingIdea] = useState(false);
  const [ideaError, setIdeaError] = useState("");
  const [referencesBusy, setReferencesBusy] = useState(false);
  const ideaRequest = useRef<AbortController | null>(null);
  const recentIdeas = useRef<RecentSceneIdea[]>([]);
  const [previousIdea, setPreviousIdea] = useState<{ before: string; generated: string } | null>(null);
  useEffect(() => {
    onBusyChange?.(generatingIdea || referencesBusy);
    return () => onBusyChange?.(false);
  }, [generatingIdea, referencesBusy, onBusyChange]);

  // A changed brief or an unmounted form must not receive a stale suggestion.
  useEffect(() => () => ideaRequest.current?.abort(), [input]);

  async function generateIdea() {
    if (loading || ideaRequest.current) return;
    const controller = new AbortController();
    ideaRequest.current = controller;
    setGeneratingIdea(true);
    setIdeaError("");
    try {
      const response = await fetch("/api/generate-scene-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recentSuggestions: recentIdeas.current }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "The scene idea could not be generated. Try again.");
      }
      if (typeof data.sceneIdea !== "string" || !data.sceneIdea.trim() || data.sceneIdea.trim().length > 1200) {
        throw new Error("The generated scene idea was invalid. Try again.");
      }
      if (!controller.signal.aborted) {
        const variation = sceneIdeaVariationSchema.safeParse(data.variation);
        recentIdeas.current = [...recentIdeas.current, {
          sceneIdea: data.sceneIdea.trim(), ...(variation.success ? { variation: variation.data } : {}),
        }].slice(-6);
        setPreviousIdea({ before: input.sceneIdea, generated: data.sceneIdea.trim() });
        onChange({ ...input, sceneIdea: data.sceneIdea.trim() });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setIdeaError(error instanceof Error ? error.message : "The scene idea could not be generated. Try again.");
      }
    } finally {
      ideaRequest.current = null;
      setGeneratingIdea(false);
    }
  }

  const update = <Key extends keyof StoryboardInput>(
    key: Key,
    value: StoryboardInput[Key],
  ) => onChange({ ...input, [key]: value });

  const remainingCharacters = 1200 - input.sceneIdea.trim().length;
  const overCharacterLimit = remainingCharacters < 0;
  const showCharacterHint = remainingCharacters <= 150;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!generatingIdea && !referencesBusy && !overCharacterLimit) onSubmit();
      }}
      className="space-y-6"
    >
      <fieldset disabled={loading} className="min-w-0 space-y-6">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label className="label" htmlFor="sceneIdea">
            01 / Scene idea
          </label>
          {previousIdea && input.sceneIdea === previousIdea.generated && <button type="button" disabled={loading || generatingIdea}
            className="text-xs font-bold text-ink/65 underline underline-offset-2 hover:text-ink disabled:opacity-50"
            onClick={() => { update("sceneIdea", previousIdea.before); setPreviousIdea(null); }}>Undo</button>}
        </div>
        <textarea
          id="sceneIdea"
          className="field min-h-36 resize-y text-base leading-relaxed"
          value={input.sceneIdea}
          onChange={(event) => update("sceneIdea", event.target.value)}
          placeholder="Describe one visual moment, conflict, or discovery..."
          aria-invalid={overCharacterLimit || undefined}
          aria-describedby={showCharacterHint ? "scene-idea-character-hint" : undefined}
          required
        />
        <p id="scene-idea-character-hint" role="status" className={showCharacterHint
          ? `mt-2 text-xs ${overCharacterLimit ? "text-rust" : "text-right text-ink/55"}`
          : "sr-only"}>
          {showCharacterHint && (overCharacterLimit
            ? `Remove ${-remainingCharacters} ${remainingCharacters === -1 ? "character" : "characters"} to stay within the 1,200-character limit.`
            : `${remainingCharacters} ${remainingCharacters === 1 ? "character" : "characters"} remaining`)}
        </p>
        <div role="group" aria-label="Scene idea tools" className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
          <button
            type="button"
            onClick={generateIdea}
            disabled={loading || generatingIdea}
            aria-busy={generatingIdea}
            className={`inline-flex min-h-9 items-center justify-center gap-2 border px-2.5 py-2 text-xs font-bold text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              generatingIdea
                ? "cursor-wait border-ink/40 bg-acid/25"
                : "border-ink/25 enabled:hover:border-ink enabled:hover:bg-acid disabled:cursor-not-allowed disabled:opacity-50"
            }`}
          >
            {generatingIdea ? (
              <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-ink/25 border-t-ink motion-safe:animate-spin" />
            ) : (
              <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round">
                <path d="m8 1.5 1.7 4.8L14.5 8l-4.8 1.7L8 14.5 6.3 9.7 1.5 8l4.8-1.7Z" />
              </svg>
            )}
            <span className="grid">
              <span className={`col-start-1 row-start-1 ${generatingIdea ? "invisible" : ""}`}>Generate scene idea</span>
              <span className={`col-start-1 row-start-1 ${generatingIdea ? "" : "invisible"}`}>Generating idea…</span>
            </span>
          </button>
          <VoiceNotePanel disabled={loading || generatingIdea} remainingChars={remainingCharacters - (input.sceneIdea.trim() ? 2 : 0)} onAppend={(text) => update("sceneIdea", [input.sceneIdea.trim(), text].filter(Boolean).join("\n\n"))} />
        </div>
        <span role="status" className="sr-only">{generatingIdea ? "Generating a scene idea." : ""}</span>
        {ideaError ? <p role="alert" className="mt-2 text-xs text-rust">{ideaError}</p> : null}
      </div>

      <div className="space-y-4">
        <SelectField label="Visual style" value={input.visualStyle} options={VISUAL_STYLES} onChange={value => update("visualStyle", value as StoryboardInput["visualStyle"])} />
      </div>
      <fieldset>
        <legend className="text-sm font-bold">Scene settings</legend>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <SelectField label="Genre" value={input.genre} options={GENRES} onChange={value => update("genre", value as StoryboardInput["genre"])} />
          <SelectField label="Duration" value={input.duration} options={DURATIONS} onChange={value => update("duration", value as StoryboardInput["duration"])} />
          <SelectField label="Tone" value={input.tone} options={TONES} onChange={value => update("tone", value as StoryboardInput["tone"])} />
          <SelectField label="Panels" value={String(input.panelCount)} options={PANEL_COUNTS.map(String)} onChange={value => update("panelCount", Number(value) as StoryboardInput["panelCount"])} />
        </div>
      </fieldset>

      <details>
        <summary className="cursor-pointer text-sm font-bold">Add visual references (optional)</summary>
        <div className="mt-4">
          <ReferenceImagePanel references={references} summary={visualSummary} disabled={loading || generatingIdea}
            onReferencesChange={onReferencesChange} onSummaryChange={onVisualSummaryChange} onBusyChange={setReferencesBusy} />
        </div>
      </details>
      </fieldset>

      {hasStoryboard && <div className="space-y-1 text-xs text-ink/65">
        {hasUnappliedChanges && <p role="status" className="font-bold text-rust">Changes not applied</p>}
        <p>Generating a new storyboard replaces this board and its images. Settings apply to the new board.</p>
      </div>}
      <button
        type="submit"
        data-testid="generate-button"
        disabled={
          loading || generatingIdea || referencesBusy || overCharacterLimit || !input.sceneIdea.trim()
        }
        aria-disabled={
          loading || generatingIdea || referencesBusy || overCharacterLimit || !input.sceneIdea.trim()
        }
        className="group flex w-full items-center justify-between border-[1.5px] border-ink bg-ink px-5 py-4 text-left text-paper shadow-[5px_5px_0_#d8ff52] transition hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#d8ff52] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="font-bold">
          {loading
            ? "Generating storyboard..."
            : hasStoryboard ? "Generate new storyboard" : "Generate storyboard"}
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
