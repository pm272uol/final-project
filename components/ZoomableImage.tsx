"use client";

import { useEffect, useId, useRef, useState } from "react";

export function ZoomableImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-label={`Enlarge ${alt}`} aria-haspopup="dialog" title="Click to enlarge"
      className="block h-full w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      onClick={() => setOpen(true)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className} />
    </button>
    {open && <ImagePreview src={src} alt={alt} onClose={() => setOpen(false)} />}
  </>;
}

function ImagePreview({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    className="m-auto max-h-[95dvh] w-[calc(100%-2rem)] max-w-7xl overflow-y-auto border border-ink bg-paper p-3 text-ink shadow-xl backdrop:bg-black/75 sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 id={titleId} className="text-sm font-bold">{alt}</h2>
      <button type="button" onClick={onClose} aria-label="Close enlarged image" className="shrink-0 px-3 py-2 text-xl">×</button>
    </div>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} className="max-h-[78dvh] w-full object-contain" />
  </dialog>;
}
