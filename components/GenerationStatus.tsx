"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inspectGenerationOutput } from "@/lib/generationProgress";

export function GenerationStatus({
  message,
  output,
  requestedPanelCount,
}: {
  message: string;
  output: string;
  requestedPanelCount: number;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const outputRef = useRef<HTMLPreElement>(null);
  const progress = useMemo(() => inspectGenerationOutput(output), [output]);
  const validating = /validat/i.test(message);
  const currentStage = getCurrentStage({
    message,
    output,
    panelCount: progress.panelCount,
    requestedPanelCount,
    validating,
  });
  const stages = [
    {
      label: "Prompt",
      detail: "Brief prepared",
      state: output ? "complete" : "active",
    },
    {
      label: "Treatment",
      detail: progress.title ? "Treatment drafted" : "Title and logline",
      state: progress.title ? "complete" : output ? "active" : "pending",
    },
    {
      label: "World",
      detail:
        progress.characters.length || progress.locations.length
          ? `${progress.characters.length} cast / ${progress.locations.length} sets`
          : "Cast and locations",
      state:
        progress.characters.length || progress.locations.length
          ? "complete"
          : progress.title
            ? "active"
            : "pending",
    },
    {
      label: "Panels",
      detail: `${progress.panelCount} of ${requestedPanelCount} drafted`,
      state:
        progress.panelCount >= requestedPanelCount
          ? "complete"
          : progress.panelCount > 0
            ? "active"
            : "pending",
    },
    {
      label: "Validate",
      detail: validating ? "Checking package" : "Schema and continuity",
      state: validating ? "active" : "pending",
    },
  ] as const;

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div
      className="animate-rise mx-auto flex min-h-[58vh] max-w-4xl flex-col justify-center"
      data-testid="generation-progress"
    >
      <div className="border-[1.5px] border-ink bg-paper/95 shadow-[7px_7px_0_#161813]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-ink bg-ink px-4 py-3 text-paper sm:px-5">
          <div className="flex items-center gap-3">
            <ActivityIndicator />
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-acid">
              Local model working
            </span>
          </div>
          <span className="mono text-[10px] uppercase tracking-wider text-paper/55">
            {formatElapsed(elapsedSeconds)}
          </span>
        </header>

        <div className="border-b-[1.5px] border-ink p-4 sm:p-5">
          <p className="mono text-[10px] uppercase tracking-wider text-rust">
            Current stage
          </p>
          <p
            className="display mt-2 text-3xl leading-tight sm:text-4xl"
            aria-live="polite"
            data-testid="generation-progress-message"
          >
            {currentStage}
          </p>
          {progress.latestStoryBeat ? (
            <p className="mt-3 text-sm text-ink/55">
              Latest beat: {progress.latestStoryBeat}
            </p>
          ) : (
            <p className="mt-3 text-sm text-ink/55">{message}</p>
          )}
        </div>

        <ol className="grid border-b-[1.5px] border-ink sm:grid-cols-5">
          {stages.map((stage, index) => (
            <li
              key={stage.label}
              className={`min-w-0 border-ink p-4 ${
                index < stages.length - 1
                  ? "border-b sm:border-b-0 sm:border-r"
                  : ""
              } ${
                stage.state === "active"
                  ? "bg-acid"
                  : stage.state === "pending"
                    ? "text-ink/40"
                    : ""
              }`}
              data-state={stage.state}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-[9px] uppercase tracking-wider">
                  {String(index + 1).padStart(2, "0")} / {stage.label}
                </span>
                <span className="mono text-[10px]" aria-hidden="true">
                  {stage.state === "complete"
                    ? "OK"
                    : stage.state === "active"
                      ? "NOW"
                      : "--"}
                </span>
              </div>
              <p className="mt-2 truncate text-xs font-bold" title={stage.detail}>
                {stage.detail}
              </p>
            </li>
          ))}
        </ol>

        <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
          <ProgressCard
            label="Working title"
            value={progress.title ?? "Waiting for treatment"}
          />
          <ProgressCard
            label="Characters"
            value={
              progress.characters.length
                ? progress.characters.join(", ")
                : "Waiting for cast"
            }
          />
          <ProgressCard
            label="Locations"
            value={
              progress.locations.length
                ? progress.locations.join(", ")
                : "Waiting for setting"
            }
          />
        </div>

        <details className="border-t-[1.5px] border-ink bg-ink text-paper">
          <summary className="mono cursor-pointer px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-paper/65 hover:text-acid sm:px-5">
            Technical output - {output.length.toLocaleString()} characters
          </summary>
          <div className="border-t border-paper/20 p-4 sm:p-5">
            <pre
              ref={outputRef}
              className="h-56 overflow-auto whitespace-pre-wrap break-words border border-paper/20 bg-black/25 p-4 font-mono text-[11px] leading-relaxed text-paper/70"
              data-testid="generation-stream-output"
              aria-label="Streaming technical output from the local model"
            >
              {output || "Waiting for the first response chunk..."}
            </pre>
          </div>
        </details>
      </div>
      <p className="mt-5 text-center text-xs leading-relaxed text-ink/50">
        Milestones are inferred from completed fields in the model response.
        The full package is validated before the storyboard is shown.
      </p>
    </div>
  );
}

function ProgressCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-ink/25 bg-white/30 p-3">
      <p className="mono text-[9px] uppercase tracking-wider text-rust">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-bold" title={value}>
        {value}
      </p>
    </div>
  );
}

function ActivityIndicator() {
  return (
    <span className="flex items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="h-3 w-1 animate-pulse bg-acid"
          style={{ animationDelay: `${bar * 180}ms` }}
        />
      ))}
    </span>
  );
}

function getCurrentStage({
  message,
  output,
  panelCount,
  requestedPanelCount,
  validating,
}: {
  message: string;
  output: string;
  panelCount: number;
  requestedPanelCount: number;
  validating: boolean;
}) {
  if (validating) return "Checking the finished storyboard...";
  if (panelCount >= requestedPanelCount) {
    return "Finishing continuity and production notes...";
  }
  if (panelCount > 0) {
    return `Drafting panel ${Math.min(
      panelCount + 1,
      requestedPanelCount,
    )} of ${requestedPanelCount}...`;
  }
  if (output.includes('"locations"')) return "Establishing locations...";
  if (output.includes('"characters"')) return "Defining the cast...";
  if (output) return "Shaping the treatment...";
  return message;
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}
