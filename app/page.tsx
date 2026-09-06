"use client";

import { VisualBibleReview } from "@/components/VisualBibleReview";
import { reviseVisualBible } from "@/lib/visualBible";
import { useMemo, useRef, useState } from "react";
import { EvaluationPanel } from "@/components/EvaluationPanel";
import { GenerationStatus } from "@/components/GenerationStatus";
import { JsonPreview } from "@/components/JsonPreview";
import { SceneInputForm } from "@/components/SceneInputForm";
import type { ReferenceImageDraft } from "@/components/ReferenceImagePanel";
import { StoryboardOutput } from "@/components/StoryboardOutput";
import { evaluateStoryboard } from "@/lib/evaluator";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
import type {
  GenerationMetadata,
  StoryboardGenerationResponse,
  StoryboardGenerationStreamEvent,
  StoryboardInput,
  PanelImageGenerationResponse,
  StoryboardPackage,
} from "@/types/storyboard";

export default function Home() {
  const [input, setInput] = useState<StoryboardInput>(DEFAULT_INPUT);
  const [storyboard, setStoryboard] = useState<StoryboardPackage | null>(null);
  const [generationMetadata, setGenerationMetadata] =
    useState<GenerationMetadata | null>(null);
  const [requestedPanelCount, setRequestedPanelCount] = useState(
    DEFAULT_INPUT.panelCount,
  );
  const [activePanelCount, setActivePanelCount] = useState(
    DEFAULT_INPUT.panelCount,
  );
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState(
    "Ready to generate a storyboard.",
  );
  const [progressMessage, setProgressMessage] = useState(
    "Preparing the storyboard prompt...",
  );
  const [streamedOutput, setStreamedOutput] = useState("");
  const [references, setReferences] = useState<ReferenceImageDraft[]>([]);
  const [visualSummary, setVisualSummary] = useState("");
  const generationController = useRef<AbortController | null>(null);
  const imageGenerationControllers = useRef(
    new Map<number, AbortController>(),
  );

  const evaluation = useMemo(
    () =>
      storyboard
        ? evaluateStoryboard(storyboard, requestedPanelCount)
        : null,
    [requestedPanelCount, storyboard],
  );

  async function generate() {
    setLoading(true);
    setError("");
    setErrorDetails([]);
    setStreamedOutput("");
    setActivePanelCount(input.panelCount);
    setProgressMessage("Preparing the storyboard prompt...");
    setStatusMessage("Generating storyboard with the local model.");
    const controller = new AbortController();
    generationController.current = controller;

    try {
      const response = await fetch("/api/generate-storyboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({
          ...input,
          visualReferenceSummary: visualSummary.trim() || undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as
          | { error?: string; validationIssues?: string[] }
          | null;
        setErrorDetails(failure?.validationIssues ?? []);
        throw new Error(
          failure?.error ?? "The storyboard could not be generated.",
        );
      }

      let data: StoryboardGenerationResponse | undefined;
      await readGenerationStream(response, (event) => {
        if (event.type === "status") {
          setProgressMessage(event.message);
          setStatusMessage(event.message);
        } else if (event.type === "output") {
          setProgressMessage("Receiving structured storyboard data...");
          setStreamedOutput((current) => current + event.text);
        } else if (event.type === "complete") {
          data = event.data;
        } else {
          setErrorDetails(event.validationIssues ?? []);
          throw new Error(event.error);
        }
      });

      if (!data) {
        throw new Error("The model response ended before the storyboard arrived.");
      }

      setStoryboard(data.storyboard);
      setGenerationMetadata(data.metadata);
      setRequestedPanelCount(input.panelCount);
      setStatusMessage(
        `Storyboard generated successfully with ${data.storyboard.storyboard.length} panels using ${data.metadata.provider}.`,
      );
    } catch (caught) {
      const cancelled = controller.signal.aborted;
      const message = cancelled
        ? "Storyboard generation was cancelled."
        : caught instanceof Error
          ? caught.message
          : "Something went wrong.";
      setError(message);
      setStatusMessage(
        cancelled ? "Generation cancelled." : `Generation failed. ${message}`,
      );
    } finally {
      if (generationController.current === controller) {
        generationController.current = null;
      }
      setLoading(false);
    }
  }

  function cancelGeneration() {
    generationController.current?.abort();
  }

  async function generatePanelImage(panelNumber: number) {
    if (!storyboard?.visualBible || storyboard.visualBible.approvedVersion !== storyboard.visualBible.version) return;
    const panel = storyboard.storyboard.find(
      (item) => item.panelNumber === panelNumber,
    );
    if (!panel) return;

    imageGenerationControllers.current.get(panelNumber)?.abort();
    const controller = new AbortController();
    imageGenerationControllers.current.set(panelNumber, controller);
    updatePanelImage(panelNumber, {
      imageStatus: "generating",
      imageError: undefined,
    });
    setStatusMessage(`Generating image for panel ${panelNumber}.`);

    try {
      const response = await fetch("/api/generate-panel-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panel,
          imageContext: createImageContext(storyboard),
        }),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => null)) as
        | (PanelImageGenerationResponse & { error?: string })
        | null;

      if (!response.ok || !result) {
        throw new Error(
          result?.error ?? "Image generation failed. Please retry this panel.",
        );
      }

      updatePanelImage(panelNumber, {
        imageBibleVersion: result.imageBibleVersion,
        imageNeedsReview: false,
        imageStatus: "complete",
        imageUrl: result.imageUrl,
        imageError: undefined,
        imageGenerationPrompt: result.imagePrompt,
        imageGenerationNegativePrompt: result.negativePrompt,
        imageProvider: result.imageProvider,
        imageModel: result.imageModel,
        imageSeed: result.imageSeed,
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight,
        imageGeneratedAt: result.imageGeneratedAt,
        imageGenerationDurationMs: result.imageGenerationDurationMs,
      });
      setStatusMessage(`Image for panel ${panelNumber} generated successfully.`);
    } catch (caught) {
      const message = controller.signal.aborted
        ? "Image generation was cancelled."
        : caught instanceof Error
          ? caught.message
          : "Image generation failed. Please retry this panel.";
      updatePanelImage(panelNumber, {
        imageStatus: "failed",
        imageError: message,
      });
      setStatusMessage(`Panel ${panelNumber} image failed. ${message}`);
    } finally {
      if (imageGenerationControllers.current.get(panelNumber) === controller) {
        imageGenerationControllers.current.delete(panelNumber);
      }
    }
  }

  async function generateAllPanelImages() {
    if (!storyboard?.visualBible || storyboard.visualBible.approvedVersion !== storyboard.visualBible.version) return;
    const pendingPanels = storyboard.storyboard.filter(
      (panel) => panel.imageStatus !== "generating",
    );
    setStatusMessage(
      `Generating images for ${pendingPanels.length} storyboard panels.`,
    );

    setBatchGenerating(true);
    try {
      for (let index = 0; index < pendingPanels.length; index += 2) {
        await Promise.all(
          pendingPanels
            .slice(index, index + 2)
            .map((panel) => generatePanelImage(panel.panelNumber)),
        );
      }
    } finally {
      setBatchGenerating(false);
    }
  }

  function updatePanelImage(
    panelNumber: number,
    update: Partial<StoryboardPackage["storyboard"][number]>,
  ) {
    setStoryboard((current) =>
      current
        ? {
            ...current,
            storyboard: current.storyboard.map((panel) =>
              panel.panelNumber === panelNumber
                ? { ...panel, ...update }
                : panel,
            ),
          }
        : current,
    );
  }

  return (
    <main className="noise min-h-screen">
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="generation-status"
      >
        {statusMessage}
      </p>
      <nav className="border-b-[1.5px] border-ink bg-paper/90 px-5 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center bg-ink text-acid">
              
            </span>
            <span className="font-bold tracking-tight">CM3070</span>
          </div>
          <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-wider">
            <span className="h-2 w-2 bg-rust" />
            Ollama local
          </div>
        </div>
      </nav>

      <header className="border-b-[1.5px] border-ink bg-paper/75 px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-[1500px]">
          <p className="mono mb-4 text-xs uppercase tracking-[0.2em] text-rust">
            Visual pre-production for short films
          </p>
          {/* <h1 className="display max-w-5xl text-6xl leading-[0.88] tracking-tight sm:text-8xl lg:text-[7.5rem]">
            Turn a rough scene into a{" "}
            <span className="italic text-rust">shootable</span> sequence.
          </h1> */}
          <h1 className="display max-w-5xl text-6xl leading-[0.88] tracking-tight sm:text-8xl lg:text-[7.5rem]">
            Final project

          </h1>
          {/* <div className="mt-8 flex max-w-3xl items-start gap-4">
            <span className="mt-2 block h-[1.5px] w-12 shrink-0 bg-ink" />
            <p className="text-sm leading-relaxed text-ink/65 sm:text-base">
              Shape story beats, camera direction, visual prompts, continuity,
              and production notes using local Ollama with a deterministic mock
              fallback.
            </p>
          </div> */}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="border-b-[1.5px] border-ink bg-paper/90 p-5 sm:p-8 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="mb-7">
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-rust">
              Scene brief
            </p>
            <h2 className="display mt-1 text-4xl">Set the frame</h2>
          </div>
          <fieldset disabled={batchGenerating || storyboard?.storyboard.some(p => p.imageStatus === "generating")} >
          <SceneInputForm
            input={input}
            loading={loading}
            onChange={setInput}
            onSubmit={generate}
            onCancel={cancelGeneration}
            references={references}
            visualSummary={visualSummary}
            onReferencesChange={setReferences}
            onVisualSummaryChange={setVisualSummary}
          />
          </fieldset>
          {error ? (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-5 border border-rust bg-rust/10 p-3 text-sm"
              data-testid="generation-error"
            >
              <p className="font-bold">{error}</p>
              {errorDetails.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-rust/30 pt-3 text-xs leading-relaxed">
                  {errorDetails.map((detail) => (
                    <li key={detail} className="grid grid-cols-[0.75rem_1fr] gap-1">
                      <span aria-hidden="true">•</span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </aside>

        <section
          className="min-w-0 min-h-[70vh] p-5 sm:p-8 lg:p-10"
          aria-busy={loading}
        >
          {loading ? (
            <GenerationStatus
              message={progressMessage}
              output={streamedOutput}
              requestedPanelCount={activePanelCount}
              visualSummary={visualSummary}
            />
          ) : storyboard && evaluation ? (
            <div className="space-y-8">
              {storyboard.visualBible && <VisualBibleReview
                key={`${generationMetadata?.durationMs}-${storyboard.visualBible.version}-${storyboard.visualBible.approvedVersion}`}
                bible={storyboard.visualBible}
                busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")}
                onSave={draft => { try { setStoryboard(reviseVisualBible(storyboard, draft)); } catch (error) { setError(error instanceof Error ? error.message : "Invalid visual bible"); } }}
                onApprove={() => setStoryboard({ ...storyboard, visualBible: { ...storyboard.visualBible!, approvedVersion: storyboard.visualBible!.version } })}
              />}
              <StoryboardOutput
                imagesDisabled={batchGenerating || !storyboard.visualBible || storyboard.visualBible.approvedVersion !== storyboard.visualBible.version}
                data={storyboard}
                metadata={generationMetadata ?? undefined}
                onGeneratePanelImage={generatePanelImage}
                onGenerateAllImages={generateAllPanelImages}
              />
              <EvaluationPanel result={evaluation} />
              <JsonPreview data={storyboard} />
            </div>
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      <footer className="border-t-[1.5px] border-ink bg-ink px-5 py-5 text-paper sm:px-8">
        <div className="mono mx-auto flex max-w-[1500px] flex-wrap justify-between gap-3 text-[10px] uppercase tracking-wider text-paper/55">
          <span>Framewright / Storyboard Orchestrator</span>
          <span>Mock generation • Rule-based evaluation</span>
        </div>
      </footer>
    </main>
  );
}

function createImageContext(storyboard: StoryboardPackage) {
  return {
    visualBible: storyboard.visualBible,
    visualStyle: storyboard.visualStyle,
    characterContinuity: storyboard.characters
      .map(
        (character) =>
          `${character.name}: ${character.visualDescription}`,
      )
      .join(" "),
    locationContinuity: storyboard.locations
      .map(
        (location) =>
          `${location.name}: ${location.description} ${location.mood}`,
      )
      .join(" "),
    continuityNotes: storyboard.continuityNotes,
  };
}

async function readGenerationStream(
  response: Response,
  onEvent: (event: StoryboardGenerationStreamEvent) => void,
) {
  if (!response.body) {
    throw new Error("The storyboard response did not include a stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const processLine = (line: string) => {
    if (!line.trim()) return;
    onEvent(JSON.parse(line) as StoryboardGenerationStreamEvent);
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(processLine);
    if (done) break;
  }

  processLine(buffer);
}

function EmptyState() {
  return (
    <div className="flex min-h-[58vh] items-center justify-center">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-7 grid h-28 w-40 grid-cols-3 border-[1.5px] border-ink bg-paper shadow-hard">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <span
              key={item}
              className={`border-ink/30 ${item < 3 ? "border-b" : ""} ${
                item % 3 !== 2 ? "border-r" : ""
              }`}
            />
          ))}
        </div>
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-rust">
          Your board is empty
        </p>
        <h2 className="display mt-2 text-5xl">Begin with an image.</h2>
        <p className="mt-4 text-sm leading-relaxed text-ink/55">
          Describe the moment you can already see. The orchestrator will map
          the shots around it.
        </p>
      </div>
    </div>
  );
}
