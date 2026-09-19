"use client";

import { generatedStoryboardPanelSchema } from "@/lib/storyboardSchema";
import { GenerationEstimates } from "@/components/GenerationEstimates";
import { imageEstimateConfigSchema, type ImageEstimateConfig } from "@/lib/generationEstimates";
import { ContinuityChecklist } from "@/components/ContinuityChecklist";
import { VersionComparison } from "@/components/VersionComparison";
import { captureVersion, inputCondition, MAX_VERSIONS, type StoryboardVersion } from "@/lib/versions";
import { SequencePlayback } from "@/components/SequencePlayback";
import { TreatmentEditor } from "@/components/TreatmentEditor";
import { PdfExport } from "@/components/PdfExport";
import { pendingPanels, replacePanelImage } from "@/lib/panelRevision";
import { PanelRevisionControls } from "@/components/PanelRevisionControls";
import { relevantReferences } from "@/lib/image-generation/references";
import { ContinuityEditor } from "@/components/ContinuityEditor";
import { ReferenceFrameReview } from "@/components/ReferenceFrameReview";
import { VisualBibleReview } from "@/components/VisualBibleReview";
import { createVisualBible, reviseVisualBible } from "@/lib/visualBible";
import { useEffect, useMemo, useRef, useState } from "react";
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
  VisualReference,
} from "@/types/storyboard";

export default function Home() {
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
  const [versions, setVersions] = useState<StoryboardVersion[]>([]);
  const [input, setInput] = useState<StoryboardInput>(DEFAULT_INPUT);
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
  const [references, setReferences] = useState<ReferenceImageDraft[]>([]);
  const [visualSummary, setVisualSummary] = useState("");
  const batchPause = useRef<AbortController | null>(null);
  const batchCancelled = useRef(false);
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
    if (storyboard && versions.length >= MAX_VERSIONS) { setError("Delete a version before generating again; the snapshot limit is 50."); return; }
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

      if (storyboard) setVersions(current => [...current, captureVersion(projectInput ?? input, storyboard, generationMetadata, `Before generation ${current.length + 1}`, inputCondition(projectInput ?? input))]);
      setOutputRevision(value => value + 1);
      setStoryboard(data.storyboard);
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
    return { ...source, visualBible: { ...bible, approvedVersion: bible.version } };
  }

  function cancelImages() {
    batchCancelled.current = true;
    batchPause.current?.abort();
    imageGenerationControllers.current.forEach(controller => controller.abort());
  }

  async function generatePanelImage(panelNumber: number, referenceFrame = false, sameSeed = false, source = storyboard): Promise<VisualReference | undefined> {
    if (!source) return;
    const renderBoard = imageBoard(source);
    const panel = renderBoard.storyboard.find(
      (item) => item.panelNumber === panelNumber,
    );
    if (!panel || panel.imageApproved || imageGenerationControllers.current.has(panelNumber)) return;

    setStoryboard(current => current ? { ...current, visualBible: renderBoard.visualBible } : current);
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
          panel: generatedStoryboardPanelSchema.strip().parse(panel),
          seed: sameSeed ? panel.imageSeed : undefined,
          references: referenceFrame ? [] : relevantReferences(renderBoard, panel),
          imageContext: createImageContext(renderBoard),
        }),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => null)) as
        | (PanelImageGenerationResponse & { error?: string; validationIssues?: string[] })
        | null;

      if (!response.ok || !result) {
        throw new Error(
          result?.validationIssues?.join(" ") || result?.error || "Image generation failed. Please retry this panel.",
        );
      }

      if (controller.signal.aborted || imageGenerationControllers.current.get(panelNumber) !== controller) return;
      let reference: VisualReference | undefined;
      if (referenceFrame || !renderBoard.visualReferences?.some(r => r.purpose === "style" && r.approved)) {
        reference = { id: crypto.randomUUID(), imageUrl: result.imageUrl, purpose: "style", approved: true, version: (renderBoard.visualReferences?.length ?? 0) + 1 };
        const activeReference = reference;
        setStoryboard(current => current ? { ...current, visualReferences: [
          ...(current.visualReferences ?? []).map(r => r.purpose === "style" ? { ...r, approved: false } : r),
          activeReference,
        ] } : current);
      }
      updatePanelImage(panelNumber, {
        imageReferenceIds: result.imageReferenceIds,
        imageModelVersion: result.imageModelVersion,
        imageSettings: result.imageSettings,
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
      }, true);
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

  async function generateAllPanelImages(mode: "missing" | "failed" | "selected" = "missing") {
    if (!storyboard || batchGenerating || imageGenerationControllers.current.size) return;
    let renderBoard = imageBoard(storyboard);
    const pending = pendingPanels(storyboard.storyboard, mode);
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
        const reference = await generatePanelImage(pending[index].panelNumber, false, false, renderBoard);
        if (reference) {
          // Use the same reference ID in persisted state and subsequent requests.
          renderBoard = { ...renderBoard, visualReferences: [...(renderBoard.visualReferences ?? []).map(r => r.purpose === "style" ? { ...r, approved: false } : r), reference] };
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
              <StoryboardOutput
                imagesDisabled={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")}
                onCancelImages={cancelImages}
                imagesBusy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")}
                data={storyboard}
                metadata={generationMetadata ?? undefined}
                onGeneratePanelImage={async panelNumber => { await generatePanelImage(panelNumber); }}
                onGenerateAllImages={generateAllPanelImages}
              />
              <details className="paper-card p-4"><summary className="cursor-pointer font-bold">Edit storyboard</summary><div className="mt-4 space-y-4">
              <TreatmentEditor key={outputRevision} data={storyboard} busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")} onChange={setStoryboard} />
              <PanelRevisionControls data={storyboard} busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")} onChange={board => { setStoryboard(board); setRequestedPanelCount(board.storyboard.length); }} onGenerate={(n, sameSeed) => void generatePanelImage(n, false, sameSeed)} onBatch={mode => void generateAllPanelImages(mode)}  onReset={() => { if (window.confirm("Discard the current scene? Export a PDF first to keep a copy.")) { setStoryboard(null); setGenerationMetadata(null); setProjectInput(null); setVersions([]); } }} />
              </div></details>
              <details className="paper-card p-4"><summary className="cursor-pointer font-bold">Style and references</summary><div className="mt-4 space-y-4">
              {storyboard.visualBible && <VisualBibleReview
                key={`${outputRevision}-${storyboard.visualBible.version}-${storyboard.visualBible.approvedVersion}`}
                bible={storyboard.visualBible}
                busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")}
                onSave={draft => { try { setStoryboard(reviseVisualBible(storyboard, draft)); } catch (error) { setError(error instanceof Error ? error.message : "Invalid visual bible"); } }}
              />}
              <ReferenceFrameReview onUseUploads={references.length ? () => { void Promise.all(references.map(async reference => ({ id: reference.id, purpose: "style" as const, imageUrl: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(reference.blob); }), approved: true, version: 1 }))).then(added => setStoryboard(current => current ? { ...current, visualReferences: [...(current.visualReferences ?? []).filter(r => !added.some(a => a.id === r.id)), ...added] } : current)).catch(() => setError("Could not prepare uploaded references.")); } : undefined} data={storyboard} busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")} onGenerate={() => void generatePanelImage(1, true)} onChange={visualReferences => setStoryboard({ ...storyboard, visualReferences, storyboard: storyboard.storyboard.map(p => ({ ...p, imageNeedsReview: Boolean(p.imageUrl) })) })} />
              <ContinuityEditor data={storyboard} busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")} onChange={setStoryboard} />
              </div></details>
              <details className="paper-card p-4"><summary className="cursor-pointer font-bold">Preview sequence</summary><div className="mt-4 space-y-4">
              <SequencePlayback data={storyboard} target={(projectInput ?? input).duration} busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")} onChange={setStoryboard} />
              </div></details>
              <details className="paper-card p-4"><summary className="cursor-pointer font-bold">Versions</summary><div className="mt-4 space-y-4">
              <VersionComparison input={projectInput ?? input} data={storyboard} metadata={generationMetadata} versions={versions} busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")} onChange={setVersions} onRestore={version => {
                setVersions([...versions, captureVersion(projectInput ?? input, storyboard, generationMetadata, `Before restore ${versions.length + 1}`, inputCondition(projectInput ?? input))]);
                setOutputRevision(value => value + 1);
                setStoryboard(structuredClone(version.storyboard)); setInput(version.input); setProjectInput(version.input); setVisualSummary(version.input.visualReferenceSummary ?? ""); setGenerationMetadata(version.metadata); setRequestedPanelCount(version.storyboard.storyboard.length);
                references.forEach(r => URL.revokeObjectURL(r.previewUrl)); setReferences([]);
              }} />
              </div></details>
              <details className="paper-card p-4"><summary className="cursor-pointer font-bold">Technical details</summary><div className="mt-4 space-y-4">
              <GenerationEstimates data={storyboard} config={estimateConfig} metadata={generationMetadata} />
              <ContinuityChecklist data={storyboard} busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")} onChange={setStoryboard} />
              <EvaluationPanel result={evaluation} />
              <JsonPreview data={storyboard} />
              </div></details>
              <PdfExport key={outputRevision} storyboard={storyboard} duration={(projectInput ?? input).duration} busy={batchGenerating || storyboard.storyboard.some(p => p.imageStatus === "generating")} />
            </div>
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      <footer className="border-t-[1.5px] border-ink bg-ink px-5 py-5 text-paper sm:px-8">
        <div className="mono mx-auto flex max-w-[1500px] flex-wrap justify-between gap-3 text-[10px] uppercase tracking-wider text-paper/55">
          <span>Framewright / Storyboard Orchestrator</span>
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
        <h2 className="display mt-2 text-5xl">Begin with an image.</h2>
        <p className="mt-4 text-sm leading-relaxed text-ink/55">
          Describe the moment you can already see. The orchestrator will map
          the shots around it.
        </p>
      </div>
    </div>
  );
}
