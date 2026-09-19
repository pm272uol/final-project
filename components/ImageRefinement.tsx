"use client";

import { useEffect, useRef, useState } from "react";
import type { PanelImageVersion } from "@/lib/panelRevision";
import type { StoryboardPanel } from "@/types/storyboard";

export type ImageRevisionActions = {
  onRefineImage: (panelNumber: number, instructions: string, signal: AbortSignal) => Promise<PanelImageVersion>;
  onSelectImage: (panelNumber: number, image: PanelImageVersion) => void;
};

type Props = ImageRevisionActions & { panel: StoryboardPanel; disabled: boolean };
const buttonClass = "border border-ink/30 px-3 py-2 text-xs font-bold transition-colors enabled:hover:bg-acid disabled:cursor-not-allowed disabled:opacity-50";

export function ImageRefinement(props: Props) {
  const [mode, setMode] = useState<"refine" | "history" | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (mode) wasOpen.current = true;
    else if (wasOpen.current && !props.disabled) {
      trigger.current?.focus();
      wasOpen.current = false;
    }
  }, [mode, props.disabled]);
  return <>
    <button type="button" disabled={props.disabled || props.panel.imageApproved}
      className={`${buttonClass} bg-acid`} aria-label={`Refine image for panel ${props.panel.panelNumber}`}
      onClick={event => { trigger.current = event.currentTarget; setMode("refine"); }}>
      Refine image
    </button>
    {!!props.panel.imageHistory?.length && <button type="button" disabled={props.disabled || props.panel.imageApproved}
      className="px-1 py-2 text-xs underline underline-offset-4 disabled:opacity-50"
      aria-label={`Image history for panel ${props.panel.panelNumber}`}
      onClick={event => { trigger.current = event.currentTarget; setMode("history"); }}>
      History ({props.panel.imageHistory.length})
    </button>}
    {mode && <RefinementDialog {...props} mode={mode} onClose={() => setMode(null)} />}
  </>;
}

function RefinementDialog({ panel, disabled, mode, onRefineImage, onSelectImage, onClose }: Props & {
  mode: "refine" | "history"; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [instructions, setInstructions] = useState("");
  const [candidate, setCandidate] = useState<PanelImageVersion | undefined>(
    mode === "history" ? panel.imageHistory?.at(-1) : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    input.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      controller.current?.abort();
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    if (!candidate) input.current?.focus();
  }, [candidate]);

  async function generate() {
    if (!instructions.trim() || disabled || controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    try {
      const result = await onRefineImage(panel.panelNumber, instructions.trim(), active.signal);
      if (!active.signal.aborted) {
        setCandidate(result);
      }
    } catch (failure) {
      if (!active.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not refine this image. Please try again.");
    } finally {
      if (!active.signal.aborted) setBusy(false);
      controller.current = null;
    }
  }

  return <dialog ref={dialog} aria-labelledby="refinement-title" aria-describedby="refinement-description"
    onCancel={event => { event.preventDefault(); onClose(); }}
    className={`m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto border-[1.5px] border-ink bg-paper p-5 text-ink shadow-xl backdrop:bg-black/50 sm:p-6 ${candidate ? "max-w-4xl" : "max-w-xl"}`}>
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <p className="mono text-[10px] uppercase tracking-wider text-rust">Panel {panel.panelNumber}</p>
        <h2 id="refinement-title" className="display mt-1 text-3xl">{mode === "history" ? "Image history" : "Refine image"}</h2>
        <p id="refinement-description" className="mt-2 text-sm text-ink/65">Only this image changes. Keep your current image until you choose another.</p>
      </div>
      <button type="button" aria-label="Close image refinement" className="px-2 py-1 text-xl" onClick={onClose}>×</button>
    </div>

    <div className={`grid gap-4 ${candidate ? "sm:grid-cols-2" : ""}`}>
      <ComparisonImage label="Current" image={panel} compact={!candidate} />
      {candidate && <ComparisonImage label={mode === "history" ? "Previous version" : "New version"} image={candidate} />}
    </div>

    {mode === "history" && <>
      <p className="mt-5 text-xs text-ink/60">Choose a version to compare. History is kept for this session.</p>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2" aria-label="Previous images">
        {[...(panel.imageHistory ?? [])].reverse().map((image, index, images) => <button
          key={`${image.imageGeneratedAt}-${image.imageUrl}`}
          type="button" aria-label={`Compare version ${images.length - index}`}
          aria-pressed={candidate?.imageUrl === image.imageUrl}
          onClick={() => setCandidate(image)}
          className={`w-28 shrink-0 border-2 p-1 ${candidate?.imageUrl === image.imageUrl ? "border-ink bg-acid" : "border-transparent hover:border-ink/40"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.imageUrl} alt={`Version ${images.length - index}`} className="aspect-video w-full object-cover" />
          <span className="mt-1 block text-xs">Version {images.length - index}</span>
        </button>)}
      </div>
    </>}

    {mode === "refine" && candidate && <button type="button" disabled={busy}
      className="mt-3 text-xs underline underline-offset-4 disabled:opacity-50" onClick={() => setCandidate(undefined)}>Edit request</button>}
    {mode === "refine" && !candidate && <form className="mt-5" onSubmit={event => { event.preventDefault(); void generate(); }}>
      <label htmlFor="image-refinement-instructions" className="block text-sm font-bold">What would you like to change?</label>
      <textarea ref={input} id="image-refinement-instructions" className="field mt-2 min-h-24 text-sm" maxLength={1000}
        placeholder="For example, make the lighting warmer and bring the subject closer."
        value={instructions} onChange={event => setInstructions(event.target.value)} disabled={busy} required />
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={disabled || busy || !instructions.trim()} aria-busy={busy}
          className={`${buttonClass} ${candidate ? "" : "bg-ink text-paper enabled:hover:bg-ink/85"}`}>
          {busy ? "Refining image…" : "Generate alternative"}
        </button>
        {busy && <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-ink/20 border-t-ink motion-safe:animate-spin" />}
      </div>
    </form>}

    <p role="status" className="mt-3 text-xs text-ink/65">{busy ? "Creating an alternative. Your current image is safe." : candidate ? "Compare the images, then choose which to keep." : ""}</p>
    {error && <p role="alert" className="mt-3 border border-rust/40 bg-rust/10 p-3 text-sm">{error}</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-ink/20 pt-4">
      <button type="button" className={buttonClass} onClick={onClose}>{busy ? "Cancel" : "Keep current"}</button>
      {mode === "refine" && candidate && <button type="button" disabled={busy || disabled}
        className={buttonClass} onClick={() => void generate()}>{busy ? "Refining image…" : "Try again"}</button>}
      {candidate && <button type="button" disabled={busy || disabled}
        className={`${buttonClass} bg-acid`}
        onClick={() => { onSelectImage(panel.panelNumber, candidate); onClose(); }}>
        Use this image
      </button>}
    </div>
  </dialog>;
}

function ComparisonImage({ label, image, compact = false }: { label: string; image: PanelImageVersion; compact?: boolean }) {
  return <figure className="min-w-0">
    <figcaption className="mb-2 text-xs font-bold">{label}</figcaption>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image.imageUrl} alt={`${label} image for panel ${image.panelNumber}`} className={`aspect-video w-full border border-ink/20 object-contain bg-ink/5 ${compact ? "max-h-40" : "max-h-52"}`} />
    {image.imageRefinement && <p className="mt-2 line-clamp-2 text-xs text-ink/65" title={image.imageRefinement}>{image.imageRefinement}</p>}
  </figure>;
}
