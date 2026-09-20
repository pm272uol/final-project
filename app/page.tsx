"use client";

import { requestPanelImage } from "@/lib/requestPanelImage";
import { sceneImageReferences, uploadedVisualReferences } from "@/lib/image-generation/sceneReferences";
import type { ReferenceImageDraft } from "@/components/ReferenceImagePanel";
import { imageEstimateConfigSchema, type ImageEstimateConfig } from "@/lib/generationEstimates";
import { PdfExport } from "@/components/PdfExport";
import { choosePanelImage, pendingPanels, rememberPanelImage, replacePanelImage, type PanelImageVersion } from "@/lib/panelRevision";
import { createVisualBible } from "@/lib/visualBible";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceRecovery } from "@/lib/useWorkspaceRecovery";
import type { Workspace } from "@/lib/workspace";
import { EvaluationPanel } from "@/components/EvaluationPanel";
import { GenerationStatus } from "@/components/GenerationStatus";
import { JsonPreview } from "@/components/JsonPreview";
import { SceneInputForm } from "@/components/SceneInputForm";
import { StartOverButton } from "@/components/StartOverButton";
import { StoryboardOutput } from "@/components/StoryboardOutput";
import { StoryboardVideo } from "@/components/StoryboardVideo";
import { evaluateStoryboard } from "@/lib/evaluator";
import { DEFAULT_INPUT } from "@/lib/storyboardOptions";
import type {
  GenerationMetadata,
  StoryboardGenerationResponse,
  StoryboardGenerationStreamEvent,
  StoryboardInput,
  StoryboardPackage,
  VisualReference,
} from "@/types/storyboard";

export default function Home() {
  const [formRevision, setFormRevision] = useState(0);
  const [formBusy, setFormBusy] = useState(false);
  const [outputRevision, setOutputRevision] = useState(0);
  const [estimateConfig, setEstimateConfig] = useState<ImageEstimateConfig | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/image-estimate-config", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) return; const parsed = imageEstimateConfigSchema.safeParse(await response.json());
      if (parsed.success && !controller.signal.aborted) setEstimateConfig(parsed.data);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  const [input, setInput] = useState<StoryboardInput>({ ...DEFAULT_INPUT, sceneIdea: "" });
  const [references, setReferences] = useState<ReferenceImageDraft[]>([]);
  const [visualSummary, setVisualSummary] = useState("");
  const [projectInput, setProjectInput] = useState<StoryboardInput | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardPackage | null>(null);
  const [generationMetadata, setGenerationMetadata] =
    useState<GenerationMetadata | null>(null);
  const [requestedPanelCount, setRequestedPanelCount] = useState<number>(
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
  const batchPause = useRef<AbortController | null>(null);
  const batchCancelled = useRef(false);
  const generationController = useRef<AbortController | null>(null);
  const imageGenerationControllers = useRef(
    new Map<number, AbortController>(),
  );

  const restoreWorkspace = useCallback(async (saved: Workspace) => {
    const restoredReferences = await Promise.all(saved.references.map(async reference => {
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(reference.blob);
      });
      return { ...reference, imageUrl, previewUrl: imageUrl };
    }));
    setInput({ ...saved.input, targetFormat: "Storyboard + shot list" });
    setProjectInput(saved.projectInput);
    setStoryboard(saved.storyboard);
    setGenerationMetadata(saved.metadata);
    setRequestedPanelCount(saved.projectInput?.panelCount ?? saved.input.panelCount);
    setVisualSummary(saved.visualSummary);
    setReferences(restoredReferences);
    setStatusMessage("Workspace restored from this browser.");
    setOutputRevision(value => value + 1);
  }, []);
  const workspace = useMemo<Workspace>(() => ({
    input, projectInput, storyboard, metadata: generationMetadata, projectId: null, versions: [], visualSummary,
    references: references.map(({ id, blob, purpose }) => ({ id, blob, purpose })),
  }), [input, projectInput, storyboard, generationMetadata, visualSummary, references]);
  const recovery = useWorkspaceRecovery(workspace, restoreWorkspace);
  async function startOver() {
    if (!recovery.ready || loading || batchGenerating || formBusy || imageGenerationControllers.current.size) return;
    const freshInput = { ...DEFAULT_INPUT, sceneIdea: "" };
    await recovery.resetWorkspace(() => {
      setInput(freshInput);
      setProjectInput(null);
      setStoryboard(null);
      setGenerationMetadata(null);
      setReferences([]);
      setVisualSummary("");
      setRequestedPanelCount(DEFAULT_INPUT.panelCount);
      setActivePanelCount(DEFAULT_INPUT.panelCount);
      setError("");
      setErrorDetails([]);
      setStreamedOutput("");
      setProgressMessage("Preparing the storyboard prompt...");
      setStatusMessage("Workspace cleared. Ready for a new scene idea.");
      setOutputRevision(value => value + 1);
      setFormRevision(value => value + 1);
    });
  }
  const hasUnappliedChanges = Boolean(projectInput && (
    Object.entries(input).some(([key, value]) => key !== "visualReferenceSummary" && value !== projectInput[key as keyof StoryboardInput]) ||
    visualSummary.trim() !== (projectInput.visualReferenceSummary ?? "").trim()
  ));

  const evaluation = useMemo(
    () =>
      storyboard
        ? evaluateStoryboard(storyboard, requestedPanelCount)
        : null,
    [requestedPanelCount, storyboard],
  );

  async function generate() {
    if (!recovery.ready || generationController.current || imageGenerationControllers.current.size || batchGenerating) return;
    setLoading(true);
    setError("");
    setErrorDetails([]);
    setStreamedOutput("");
    setActivePanelCount(input.panelCount);
    setProgressMessage("Preparing the storyboard prompt...");
    setStatusMessage("Generating storyboard with the configured model.");
    const controller = new AbortController();
    generationController.current = controller;

    try {
      const response = await fetch("/api/generate-storyboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({ ...input, visualReferenceSummary: visualSummary.trim() || undefined }),
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

      setOutputRevision(value => value + 1);
      setStoryboard({ ...data.storyboard, visualReferences: uploadedVisualReferences(references) });
      setProjectInput({ ...input, visualReferenceSummary: visualSummary.trim() || undefined });
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

  function imageBoard(source: StoryboardPackage): StoryboardPackage {
    const bible = source.visualBible ?? createVisualBible(source, projectInput ?? input);
    // Rendering uses the current direction. The version records exactly what was used.
    return { ...source,
      visualReferences: sceneImageReferences(source, uploadedVisualReferences(references)),
      visualBible: { ...bible, approvedVersion: bible.version } };
  }

  function changeReferences(next: ReferenceImageDraft[]) {
    setReferences(next);
    setStoryboard(current => current ? { ...current,
      visualReferences: sceneImageReferences(current, uploadedVisualReferences(next)) } : current);
  }

  function cancelImages() {
    batchCancelled.current = true;
    batchPause.current?.abort();
    imageGenerationControllers.current.forEach(controller => controller.abort());
  }

  async function generatePanelImage(panelNumber: number, source = storyboard): Promise<VisualReference | undefined> {
    if (!source) return;
    const renderBoard = imageBoard(source);
    const panel = renderBoard.storyboard.find(
      (item) => item.panelNumber === panelNumber,
    );
    if (!panel || panel.imageApproved || imageGenerationControllers.current.size > 0) return;

    setStoryboard(current => current ? { ...current, visualBible: renderBoard.visualBible, visualReferences: renderBoard.visualReferences } : current);
    const controller = new AbortController();
    imageGenerationControllers.current.set(panelNumber, controller);
    updatePanelImage(panelNumber, {
      imageStatus: "generating",
      imageError: undefined,
    });
    setStatusMessage(`Generating image for panel ${panelNumber}.`);

    try {
      const result = await requestPanelImage(renderBoard, panel, createImageContext(renderBoard), controller.signal);

      if (controller.signal.aborted || imageGenerationControllers.current.get(panelNumber) !== controller) return;
      let reference: VisualReference | undefined;
      if (!renderBoard.visualReferences?.length) {
        reference = { id: crypto.randomUUID(), imageUrl: result.imageUrl!, purpose: "style", source: "generated", approved: true, version: (renderBoard.visualReferences?.length ?? 0) + 1 };
        const activeReference = reference;
        setStoryboard(current => current ? { ...current, visualReferences: [activeReference] } : current);
      }
      updatePanelImage(panelNumber, result, true);
      setStatusMessage(`Image for panel ${panelNumber} generated successfully.`);
      return reference;
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

  async function refinePanelImage(panelNumber: number, instructions: string | undefined, signal: AbortSignal): Promise<PanelImageVersion> {
    const panel = storyboard?.storyboard.find(item => item.panelNumber === panelNumber);
    if (!storyboard || !panel?.imageUrl || panel.imageApproved || imageGenerationControllers.current.size) {
      throw new Error("Wait for the current image generation to finish.");
    }
    const renderBoard = imageBoard(storyboard);
    const controller = new AbortController();
    const combinedSignal = AbortSignal.any([signal, controller.signal]);
    imageGenerationControllers.current.set(panelNumber, controller);
    updatePanelImage(panelNumber, { imageStatus: "generating", imageError: undefined });
    try {
      const result = await requestPanelImage(renderBoard, panel, createImageContext(renderBoard), combinedSignal,
        instructions ? { instructions, imageUrl: panel.imageUrl } : undefined);
      combinedSignal.throwIfAborted();
      const candidate = { ...panel, ...result };
      delete candidate.imageHistory;
      setStoryboard(current => current ? { ...current, storyboard: current.storyboard.map(item =>
        item.panelNumber === panelNumber ? rememberPanelImage(item, candidate) : item) } : current);
      setStatusMessage(`New version of panel ${panelNumber} ready to compare. Your current image is unchanged.`);
      return candidate;
    } finally {
      imageGenerationControllers.current.delete(panelNumber);
      updatePanelImage(panelNumber, { imageStatus: "complete", imageError: undefined });
    }
  }

  function selectPanelImage(panelNumber: number, candidate: PanelImageVersion) {
    if (imageGenerationControllers.current.size || batchGenerating) return;
    setStoryboard(current => current ? { ...current, storyboard: current.storyboard.map(panel =>
      panel.panelNumber === panelNumber ? choosePanelImage(panel, candidate) : panel) } : current);
    setStatusMessage(`Image for panel ${panelNumber} updated. The previous image is available in History.`);
  }

  async function generateAllPanelImages() {
    if (!storyboard || batchGenerating || imageGenerationControllers.current.size) return;
    let renderBoard = imageBoard(storyboard);
    const pending = pendingPanels(storyboard.storyboard, "missing");
    batchCancelled.current = false;
    const pauseController = new AbortController();
    batchPause.current = pauseController;
    setStatusMessage(
      `Generating images for ${pending.length} storyboard panels.`,
    );

    setBatchGenerating(true);
    try {
      for (let index = 0; index < pending.length && !batchCancelled.current; index += 1) {
        const started = Date.now();
        const reference = await generatePanelImage(pending[index].panelNumber, renderBoard);
        if (reference) {
          // Use the same reference ID in persisted state and subsequent requests.
          renderBoard = { ...renderBoard, visualReferences: [reference] };
        }
        // Pace hosted batches for low-credit provider limits; mock runs stay instant.
        if (index + 1 < pending.length && !batchCancelled.current && (estimateConfig ? estimateConfig.provider === "replicate" : storyboard.visualReferences?.some(r => r.approved && r.imageUrl.startsWith("data:image/")))) {
          await new Promise<void>(resolve => { const done = () => { clearTimeout(timer); pauseController.signal.removeEventListener("abort", done); resolve(); }; const timer = window.setTimeout(done, Math.max(0, 12_000 - (Date.now() - started))); pauseController.signal.addEventListener("abort", done, { once: true }); });
        }
      }
    } finally {
      setBatchGenerating(false);
    }
  }

  function updatePanelImage(
    panelNumber: number,
    update: Partial<StoryboardPackage["storyboard"][number]>,
    replace = false,
  ) {
    setStoryboard((current) =>
      current
        ? {
            ...current,
            storyboard: current.storyboard.map((panel) =>
              panel.panelNumber === panelNumber
                ? (replace ? replacePanelImage(panel, update) : { ...panel, ...update })
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
            Storyboard workspace
          </div>
        </div>
      </nav>

      <header className="border-b-[1.5px] border-ink bg-paper/75 px-5 py-7 sm:px-8">
        <div className="mx-auto max-w-[1500px]">
          <h1 className="display text-4xl sm:text-5xl">Your next scene, frame by frame.</h1>
          <p className="mt-3 text-sm text-ink/65">Describe a scene. Build your storyboard. Bring the shots to life.</p>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="border-b-[1.5px] border-ink bg-paper/90 p-5 sm:p-8 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="mb-7">
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-rust">
              Scene brief
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <h2 className="display text-4xl">Set the frame</h2>
              {storyboard && <StartOverButton disabled={!recovery.ready || loading || batchGenerating || formBusy || storyboard.storyboard.some(p => p.imageStatus === "generating")}
                onStartOver={startOver} />}
            </div>
            {recovery.status && <p role="status" data-testid="workspace-save-status" className="mt-2 text-xs text-ink/55">
              {recovery.status}{recovery.saveFailed && <> <button type="button" onClick={recovery.retrySave} className="font-bold underline">Retry save</button></>}
            </p>}
          </div>
          <fieldset disabled={!recovery.ready || batchGenerating || storyboard?.storyboard.some(p => p.imageStatus === "generating")} >
          <SceneInputForm
            key={formRevision}
            onBusyChange={setFormBusy}
            input={input}
            loading={loading}
            onChange={setInput}
            onSubmit={generate}
            onCancel={cancelGeneration}
            references={references}
            visualSummary={visualSummary}
            onReferencesChange={changeReferences}
            onVisualSummaryChange={setVisualSummary}
            hasStoryboard={Boolean(storyboard)}
            hasUnappliedChanges={hasUnappliedChanges}
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
            />
          ) : storyboard && evaluation ? (
            <div className="space-y-8">
              <StoryboardOutput
                key={`storyboard-${outputRevision}`}
                onRefineImage={refinePanelImage}
                onSelectImage={selectPanelImage}
                imagesDisabled={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")}
                onCancelImages={cancelImages}
                imagesBusy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")}
                data={storyboard}
                metadata={generationMetadata ?? undefined}
                onGeneratePanelImage={async panelNumber => { await generatePanelImage(panelNumber); }}
                onGenerateAllImages={generateAllPanelImages}
              />
              <StoryboardVideo key={`video-${outputRevision}`} storyboard={storyboard} />
              <details className="paper-card p-4"><summary className="cursor-pointer font-bold">Technical details</summary><div className="mt-4 space-y-4">
              <EvaluationPanel result={evaluation} />
              <JsonPreview data={storyboard} />
              </div></details>
              <PdfExport key={`pdf-${outputRevision}`} storyboard={storyboard} duration={(projectInput ?? input).duration} busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")} />
            </div>
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      <footer className="border-t-[1.5px] border-ink bg-ink px-5 py-5 text-paper sm:px-8">
        <div className="mono mx-auto flex max-w-[1500px] flex-wrap justify-between gap-3 text-[10px] uppercase tracking-wider text-paper/55">
          <span>Concept Art & Storyboard Orchestrator</span>
          <span>From scene idea to storyboard</span>
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
      </div>
    </div>
  );
}
