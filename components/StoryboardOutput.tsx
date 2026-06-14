"use client";

import { useState } from "react";
import type {
  GenerationMetadata,
  StoryboardPackage,
} from "@/types/storyboard";

export function StoryboardOutput({
  data,
  metadata,
  onGeneratePanelImage,
  onGenerateAllImages,
}: {
  data: StoryboardPackage;
  metadata?: GenerationMetadata;
  onGeneratePanelImage: (panelNumber: number) => Promise<void>;
  onGenerateAllImages: () => Promise<void>;
}) {
  const [copyStatus, setCopyStatus] = useState("");

  function announceCopy(message: string) {
    setCopyStatus(message);
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  return (
    <div
      className="animate-rise space-y-8"
      data-testid="storyboard-output"
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {copyStatus}
      </p>
      <header className="border-b-[1.5px] border-ink pb-7">
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            data.genre,
            data.tone,
            data.visualStyle,
            data.estimatedDuration,
            metadata
              ? `${metadata.provider}: ${metadata.model}`
              : "mock engine",
            metadata?.fallbackUsed ? "mock fallback" : null,
          ]
            .filter(Boolean)
            .map((item) => (
              <span
                key={item}
                className="mono border border-ink bg-paper px-2.5 py-1 text-[10px] uppercase tracking-wider"
              >
                {item}
              </span>
            ))}
        </div>
        <p className="mono mb-2 text-xs uppercase tracking-[0.16em] text-rust">
          Generated treatment
        </p>
        <h2 className="display text-5xl leading-none sm:text-6xl">{data.title}</h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink/70">
          {data.logline}
        </p>
        {metadata ? <GenerationDetails metadata={metadata} /> : null}
      </header>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b-[1.5px] border-ink pb-3">
          <div className="flex items-baseline gap-3">
            <span className="mono text-xs text-rust">01</span>
            <h2 className="display text-4xl">Storyboard</h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="mono text-[10px] uppercase tracking-wider text-ink/50">
              {imageProgress(data)}
            </span>
            <button
              type="button"
              onClick={() => void onGenerateAllImages()}
              disabled={data.storyboard.some(
                (panel) => panel.imageStatus === "generating",
              )}
              className="mono border-[1.5px] border-ink bg-acid px-3 py-2 text-[10px] font-bold uppercase tracking-wider shadow-[3px_3px_0_#161813] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-50"
              data-testid="generate-all-images"
            >
              Generate all images
            </button>
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          {data.storyboard.map((panel) => (
            <PanelCard
              key={panel.panelNumber}
              panel={panel}
              onCopyStatus={announceCopy}
              onGenerateImage={onGeneratePanelImage}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading index="02" title="Production bible" detail="Continuity" />
        <div className="grid gap-5 md:grid-cols-2">
          <InfoCard title="Character">
            {data.characters.map((character) => (
              <div key={character.name}>
                <p className="font-bold">{character.name}</p>
                <p className="mono mt-1 text-[10px] uppercase tracking-wider text-rust">
                  {character.role}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/70">
                  {character.visualDescription} {character.personality}
                </p>
              </div>
            ))}
          </InfoCard>
          <InfoCard title="Location">
            {data.locations.map((location) => (
              <div key={location.name}>
                <p className="font-bold">{location.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/70">
                  {location.description}
                </p>
                <p className="mt-2 text-sm italic">{location.mood}</p>
              </div>
            ))}
          </InfoCard>
          <InfoCard title="Continuity notes">
            <NoteList notes={data.continuityNotes} />
          </InfoCard>
          <InfoCard title="Production notes">
            <NoteList notes={data.productionNotes} />
          </InfoCard>
        </div>
      </section>
    </div>
  );
}

function GenerationDetails({
  metadata,
}: {
  metadata: GenerationMetadata;
}) {
  return (
    <dl
      className="mt-6 grid gap-3 border-[1.5px] border-ink bg-paper/80 p-4 text-xs sm:grid-cols-4"
      data-testid="generation-metadata"
    >
      <MetadataItem label="Provider">
        {metadata.provider}
        {metadata.fallbackUsed ? " (fallback)" : ""}
      </MetadataItem>
      <MetadataItem label="Model">{metadata.model}</MetadataItem>
      <MetadataItem label="Duration">{metadata.durationMs}ms</MetadataItem>
      <MetadataItem label="Tokens">
        {metadata.promptTokens ?? "n/a"} / {metadata.completionTokens ?? "n/a"}
      </MetadataItem>
      {metadata.fallbackReason ? (
        <div className="border-t border-ink/15 pt-3 sm:col-span-4">
          <dt className="mono text-[10px] uppercase tracking-wider text-rust">
            Fallback reason
          </dt>
          <dd className="mt-1 text-ink/70">{metadata.fallbackReason}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function MetadataItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="mono text-[10px] uppercase tracking-wider text-rust">
        {label}
      </dt>
      <dd className="mt-1 font-bold">{children}</dd>
    </div>
  );
}

function PanelCard({
  panel,
  onCopyStatus,
  onGenerateImage,
}: {
  panel: StoryboardPackage["storyboard"][number];
  onCopyStatus: (message: string) => void;
  onGenerateImage: (panelNumber: number) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(
        panel.imageGenerationPrompt ?? panel.imagePrompt,
      );
      setCopied(true);
      onCopyStatus(`Image prompt for panel ${panel.panelNumber} copied.`);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      onCopyStatus(
        `Image prompt for panel ${panel.panelNumber} could not be copied.`,
      );
    }
  }

  return (
    <article
      className="paper-card flex h-full min-w-0 flex-col overflow-hidden"
      data-testid="storyboard-panel"
    >
      <div className="flex items-center justify-between border-b-[1.5px] border-ink bg-ink p-3 text-paper">
        <span className="display text-3xl leading-none">
          {String(panel.panelNumber).padStart(2, "0")}
        </span>
        <span className="mono text-[10px] uppercase tracking-[0.15em]">
          {panel.shotType}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <PanelImage
          panel={panel}
          onGenerateImage={onGenerateImage}
        />
        <h3 className="display text-3xl leading-tight">{panel.storyBeat}</h3>

        <dl className="mt-5 space-y-4 text-sm">
          <Detail label="Camera">{panel.cameraDirection}</Detail>
          <Detail label="Action">{panel.action}</Detail>
          <Detail label="Sound">{panel.dialogueOrNarration}</Detail>
        </dl>

        <div className="mt-5 border-l-4 border-acid bg-ink p-4 text-paper">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="mono text-[10px] uppercase tracking-widest text-acid">
              Image prompt
            </span>
            <button
              type="button"
              onClick={copyPrompt}
              aria-label={`Copy image prompt for panel ${panel.panelNumber}`}
              className="mono text-[10px] uppercase underline decoration-paper/40 underline-offset-4 hover:text-acid"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-paper/80">
            {panel.imageGenerationPrompt ?? panel.imagePrompt}
          </p>
          <p className="mt-3 border-t border-paper/20 pt-3 text-[11px] leading-relaxed text-paper/50">
            Avoid:{" "}
            {panel.imageGenerationNegativePrompt ?? panel.negativePrompt}
          </p>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink/55">
          <strong className="text-ink">Production:</strong>{" "}
          {panel.productionNote}
        </p>
      </div>
    </article>
  );
}

function PanelImage({
  panel,
  onGenerateImage,
}: {
  panel: StoryboardPackage["storyboard"][number];
  onGenerateImage: (panelNumber: number) => Promise<void>;
}) {
  const generating = panel.imageStatus === "generating";
  const complete = panel.imageStatus === "complete" && panel.imageUrl;
  const failed = panel.imageStatus === "failed";

  return (
    <div
      className="mb-5 overflow-hidden border-[1.5px] border-ink bg-paper-deep"
      data-testid={`panel-image-${panel.panelNumber}`}
      aria-busy={generating}
    >
      <div className="relative aspect-video">
        {complete ? (
          // Provider domains are dynamic and Replicate URLs are temporary.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={panel.imageUrl}
            alt={`Generated storyboard image for panel ${panel.panelNumber}: ${panel.storyBeat}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center bg-[linear-gradient(135deg,rgba(22,24,19,.08),transparent_60%)] p-6 text-center">
            <div>
              <span className="display text-5xl text-ink/20">
                {String(panel.panelNumber).padStart(2, "0")}
              </span>
              <p className="mono mt-2 text-[10px] uppercase tracking-[0.16em] text-ink/50">
                {generating
                  ? "Rendering storyboard frame..."
                  : failed
                    ? "Render failed"
                    : "Image not generated"}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t-[1.5px] border-ink px-3 py-2">
        <div className="min-w-0">
          <p className="mono text-[9px] uppercase tracking-wider text-ink/50">
            {complete
              ? `${panel.imageProvider} / ${panel.imageModel}`
              : failed
                ? panel.imageError
                : "1024 x 576 / 16:9"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onGenerateImage(panel.panelNumber)}
          disabled={generating}
          className="mono shrink-0 border border-ink bg-paper px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider hover:bg-acid disabled:cursor-wait disabled:opacity-50"
          aria-label={`${failed ? "Retry" : complete ? "Regenerate" : "Generate"} image for panel ${panel.panelNumber}`}
        >
          {generating
            ? "Generating..."
            : failed
              ? "Retry"
              : complete
                ? "Regenerate"
                : "Generate image"}
        </button>
      </div>
    </div>
  );
}

function imageProgress(data: StoryboardPackage) {
  const completed = data.storyboard.filter(
    (panel) => panel.imageStatus === "complete",
  ).length;
  const generating = data.storyboard.filter(
    (panel) => panel.imageStatus === "generating",
  ).length;

  if (generating > 0) {
    return `${completed}/${data.storyboard.length} complete / ${generating} generating`;
  }
  return `${completed}/${data.storyboard.length} images`;
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.3rem_1fr] gap-3 border-t border-ink/15 pt-3">
      <dt className="mono text-[10px] uppercase tracking-wider text-ink/45">
        {label}
      </dt>
      <dd className="leading-relaxed text-ink/75">{children}</dd>
    </div>
  );
}

function SectionHeading({
  index,
  title,
  detail,
}: {
  index: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between border-b-[1.5px] border-ink pb-3">
      <div className="flex items-baseline gap-3">
        <span className="mono text-xs text-rust">{index}</span>
        <h2 className="display text-4xl">{title}</h2>
      </div>
      <span className="mono text-[10px] uppercase tracking-wider text-ink/50">
        {detail}
      </span>
    </div>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-[1.5px] border-ink bg-paper/80 p-5">
      <p className="mono mb-4 text-[10px] uppercase tracking-[0.16em] text-rust">
        {title}
      </p>
      {children}
    </div>
  );
}

function NoteList({ notes }: { notes: string[] }) {
  return (
    <ul className="space-y-3">
      {notes.map((note, index) => (
        <li key={note} className="grid grid-cols-[1rem_1fr] gap-2 text-sm leading-relaxed text-ink/70">
          <span className="mono text-rust">{index + 1}.</span>
          <span>{note}</span>
        </li>
      ))}
    </ul>
  );
}
