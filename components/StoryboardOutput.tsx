"use client";

import { useState } from "react";
import type { StoryboardPackage } from "@/types/storyboard";

export function StoryboardOutput({ data }: { data: StoryboardPackage }) {
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
          {[data.genre, data.tone, data.visualStyle, data.estimatedDuration].map(
            (item) => (
              <span
                key={item}
                className="mono border border-ink bg-paper px-2.5 py-1 text-[10px] uppercase tracking-wider"
              >
                {item}
              </span>
            ),
          )}
        </div>
        <p className="mono mb-2 text-xs uppercase tracking-[0.16em] text-rust">
          Generated treatment
        </p>
        <h2 className="display text-5xl leading-none sm:text-6xl">{data.title}</h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink/70">
          {data.logline}
        </p>
      </header>

      <section>
        <SectionHeading
          index="01"
          title="Storyboard"
          detail={`${data.storyboard.length} frames`}
        />
        <div className="grid gap-6 xl:grid-cols-2">
          {data.storyboard.map((panel) => (
            <PanelCard
              key={panel.panelNumber}
              panel={panel}
              onCopyStatus={announceCopy}
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

function PanelCard({
  panel,
  onCopyStatus,
}: {
  panel: StoryboardPackage["storyboard"][number];
  onCopyStatus: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(panel.imagePrompt);
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
            {panel.imagePrompt}
          </p>
          <p className="mt-3 border-t border-paper/20 pt-3 text-[11px] leading-relaxed text-paper/50">
            Avoid: {panel.negativePrompt}
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
