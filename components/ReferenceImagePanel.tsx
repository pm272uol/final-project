"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACCEPTED_REFERENCE_TYPES,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGES,
  REFERENCE_PURPOSES,
} from "@/lib/referenceImageOptions";

export type ReferenceImageDraft = {
  id: string;
  blob: Blob;
  previewUrl: string;
  purpose: (typeof REFERENCE_PURPOSES)[number];
};

export function ReferenceImagePanel({
  references,
  summary,
  disabled,
  onReferencesChange,
  onSummaryChange,
}: {
  references: ReferenceImageDraft[];
  summary: string;
  disabled: boolean;
  onReferencesChange: (references: ReferenceImageDraft[]) => void;
  onSummaryChange: (summary: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const referencesRef = useRef(references);
  const [instructions, setInstructions] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  referencesRef.current = references;

  useEffect(
    () => () => {
      referencesRef.current.forEach((reference) =>
        URL.revokeObjectURL(reference.previewUrl),
      );
    },
    [],
  );

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");

    const availableSlots = MAX_REFERENCE_IMAGES - references.length;
    const selected = Array.from(files).slice(0, availableSlots);
    if (files.length > availableSlots) {
      setError(`You can use up to ${MAX_REFERENCE_IMAGES} references.`);
    }

    const additions: ReferenceImageDraft[] = [];
    for (const file of selected) {
      if (
        !ACCEPTED_REFERENCE_TYPES.includes(
          file.type as (typeof ACCEPTED_REFERENCE_TYPES)[number],
        )
      ) {
        setError("References must be JPEG, PNG, or WebP images.");
        continue;
      }
      if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
        setError("Each reference must be 8 MB or smaller.");
        continue;
      }

      try {
        const blob = await sanitizeImage(file);
        additions.push({
          id: crypto.randomUUID(),
          blob,
          previewUrl: URL.createObjectURL(blob),
          purpose: "Mood",
        });
      } catch {
        setError("One reference could not be prepared. Try another image.");
      }
    }

    if (additions.length > 0) {
      onReferencesChange([...references, ...additions]);
      onSummaryChange("");
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function updatePurpose(
    id: string,
    purpose: ReferenceImageDraft["purpose"],
  ) {
    onReferencesChange(
      references.map((reference) =>
        reference.id === id ? { ...reference, purpose } : reference,
      ),
    );
    onSummaryChange("");
  }

  function removeReference(id: string) {
    const reference = references.find((item) => item.id === id);
    if (reference) URL.revokeObjectURL(reference.previewUrl);
    const next = references.filter((item) => item.id !== id);
    onReferencesChange(next);
    onSummaryChange("");
  }

  function moveReference(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= references.length) return;

    const next = [...references];
    [next[index], next[destination]] = [next[destination], next[index]];
    onReferencesChange(next);
    onSummaryChange("");
  }

  async function analyze() {
    setAnalyzing(true);
    setError("");

    try {
      const formData = new FormData();
      references.forEach((reference, index) => {
        formData.append(
          "images",
          reference.blob,
          `reference-${index + 1}.jpg`,
        );
        formData.append("purposes", reference.purpose);
      });
      formData.set("instructions", instructions);

      const response = await fetch("/api/analyze-references", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as
        | { summary?: string; error?: string }
        | null;

      if (!response.ok || !body?.summary) {
        throw new Error(
          body?.error ?? "The local visual analysis could not be completed.",
        );
      }

      onSummaryChange(body.summary);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The local visual analysis failed.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="label">03 / Visual references</legend>
      <p className="mb-3 text-xs leading-relaxed text-ink/55">
        Images are stripped of metadata in your browser and sent to the configured
        analysis provider. Cloud mode sends them to an external service.
      </p>

      {references.length > 0 ? (
        <div className="mb-3 grid grid-cols-2 gap-3">
          {references.map((reference, index) => (
            <article
              key={reference.id}
              className="min-w-0 border-[1.5px] border-ink bg-paper"
              data-testid="reference-image"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={reference.previewUrl}
                alt={`Visual reference ${index + 1}`}
                className="aspect-[4/3] w-full border-b-[1.5px] border-ink object-cover"
              />
              <div className="space-y-2 p-2">
                <label className="sr-only" htmlFor={`reference-${reference.id}`}>
                  Purpose for visual reference {index + 1}
                </label>
                <select
                  id={`reference-${reference.id}`}
                  value={reference.purpose}
                  onChange={(event) =>
                    updatePurpose(
                      reference.id,
                      event.target.value as ReferenceImageDraft["purpose"],
                    )
                  }
                  className="w-full border border-ink bg-white/50 px-2 py-1.5 text-xs"
                >
                  {REFERENCE_PURPOSES.map((purpose) => (
                    <option key={purpose}>{purpose}</option>
                  ))}
                </select>
                <div className="grid grid-cols-3 gap-1">
                  <SmallButton
                    label="Move left"
                    disabled={index === 0}
                    onClick={() => moveReference(index, -1)}
                  >
                    ←
                  </SmallButton>
                  <SmallButton
                    label="Move right"
                    disabled={index === references.length - 1}
                    onClick={() => moveReference(index, 1)}
                  >
                    →
                  </SmallButton>
                  <SmallButton
                    label="Remove reference"
                    onClick={() => removeReference(reference.id)}
                  >
                    ×
                  </SmallButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_REFERENCE_TYPES.join(",")}
        multiple
        disabled={disabled || references.length >= MAX_REFERENCE_IMAGES}
        className="sr-only"
        id="reference-images"
        onChange={(event) => void addFiles(event.target.files)}
      />
      <label
        htmlFor="reference-images"
        aria-disabled={disabled || references.length >= MAX_REFERENCE_IMAGES}
        className={`block border-[1.5px] border-dashed border-ink px-4 py-4 text-center text-xs font-bold transition ${
          disabled || references.length >= MAX_REFERENCE_IMAGES
            ? "cursor-not-allowed opacity-45"
            : "cursor-pointer hover:bg-acid"
        }`}
      >
        {references.length >= MAX_REFERENCE_IMAGES
          ? "Maximum of 4 references added"
          : `Add sketches or reference images (${references.length}/4)`}
      </label>

      {references.length > 0 ? (
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold" htmlFor="reference-guidance">
              Optional guidance
            </label>
            <input
              id="reference-guidance"
              className="field text-sm"
              maxLength={500}
              value={instructions}
              onChange={(event) => {
                setInstructions(event.target.value);
                onSummaryChange("");
              }}
              placeholder="Use the lighting, not the wardrobe..."
            />
          </div>
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={analyzing || disabled}
            className="w-full border-[1.5px] border-ink bg-acid px-4 py-3 text-sm font-bold transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="analyze-references"
          >
            {analyzing
              ? "Analyzing locally..."
              : summary
                ? "Re-analyze references"
                : "Analyze references locally"}
          </button>
        </div>
      ) : null}

      {summary ? (
        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-bold" htmlFor="visual-summary">
            Combined visual direction
          </label>
          <textarea
            id="visual-summary"
            className="field min-h-32 resize-y text-sm leading-relaxed"
            maxLength={2_000}
            value={summary}
            onChange={(event) => onSummaryChange(event.target.value)}
          />
          <p className="mt-1.5 text-[11px] text-ink/50">
            Editable. Storyboard prompts use this summary, not the uploads.
          </p>
        </div>
      ) : references.length > 0 ? (
        <p className="mt-2 text-[11px] text-ink/50">
          Analyze the references before generating the storyboard.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs font-bold text-rust" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function SmallButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="border border-ink px-1 py-1 text-xs font-bold hover:bg-ink hover:text-paper disabled:opacity-25"
    >
      {children}
    </button>
  );
}

async function sanitizeImage(file: File) {
  const source = await decodeImage(file);
  const maxDimension = 2_048;
  const scale = Math.min(
    1,
    maxDimension / Math.max(source.width, source.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    source.close();
    throw new Error("Canvas is unavailable.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
  source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Image encoding failed.");
  return blob;
}

async function decodeImage(file: File): Promise<{
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to the broadly supported image element decoder.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image decoding failed."));
      image.src = url;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
