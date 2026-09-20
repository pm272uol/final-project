"use client";

import { useEffect, useRef, useState } from "react";

export function StartOverButton({ disabled, onStartOver }: { disabled: boolean; onStartOver: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" disabled={disabled} aria-haspopup="dialog" onClick={() => setOpen(true)}
      className="shrink-0 px-1 py-2 text-xs font-bold text-ink/65 underline underline-offset-4 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
      Start over
    </button>
    {open && <StartOverDialog onStartOver={onStartOver} onClose={() => setOpen(false)} />}
  </>;
}

function StartOverDialog({ onStartOver, onClose }: { onStartOver: () => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal();
    cancel.current?.focus();
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, []);

  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try { await onStartOver(); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Couldn't start over. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <dialog ref={dialog} aria-labelledby="start-over-title" aria-describedby="start-over-description"
    onCancel={event => { event.preventDefault(); if (!pending.current) onClose(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-md border-[1.5px] border-ink bg-paper p-6 text-ink shadow-xl backdrop:bg-black/50">
    <h2 id="start-over-title" className="display text-3xl">Start over?</h2>
    <p id="start-over-description" className="mt-3 text-sm leading-relaxed text-ink/70">
      Your current storyboard and images will be cleared, along with the brief, references, image history, and saved workspace. Settings will return to their defaults.
    </p>
    {error && <p role="alert" className="mt-4 text-sm text-rust">{error}</p>}
    <div className="mt-6 flex justify-end gap-3">
      <button ref={cancel} type="button" disabled={busy} onClick={onClose}
        className="border border-ink/30 px-4 py-2 text-sm font-bold hover:bg-ink/5 disabled:opacity-50">Keep working</button>
      <button type="button" disabled={busy} onClick={() => void confirm()} aria-busy={busy}
        className="border border-ink bg-ink px-4 py-2 text-sm font-bold text-paper hover:bg-ink/85 disabled:opacity-50">
        {busy ? "Starting over…" : "Start over"}
      </button>
    </div>
  </dialog>;
}
