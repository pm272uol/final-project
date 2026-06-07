"use client";

import { useMemo, useState } from "react";
import { EvaluationPanel } from "@/components/EvaluationPanel";
import { JsonPreview } from "@/components/JsonPreview";
import { SceneInputForm } from "@/components/SceneInputForm";
import { StoryboardOutput } from "@/components/StoryboardOutput";
import { evaluateStoryboard } from "@/lib/evaluator";
import { DEFAULT_INPUT } from "@/lib/storyboardSchema";
import type { StoryboardInput, StoryboardPackage } from "@/types/storyboard";

export default function Home() {
  const [input, setInput] = useState<StoryboardInput>(DEFAULT_INPUT);
  const [storyboard, setStoryboard] = useState<StoryboardPackage | null>(null);
  const [requestedPanelCount, setRequestedPanelCount] = useState(
    DEFAULT_INPUT.panelCount,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

    try {
      const response = await fetch("/api/generate-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) throw new Error("The storyboard could not be generated.");

      const data = (await response.json()) as {
        mode: "mock";
        storyboard: StoryboardPackage;
      };
      setStoryboard(data.storyboard);
      setRequestedPanelCount(input.panelCount);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="noise min-h-screen">
      <nav className="border-b-[1.5px] border-ink bg-paper/90 px-5 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center bg-ink text-acid">
              F
            </span>
            <span className="font-bold tracking-tight">Framewright</span>
          </div>
          <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-wider">
            <span className="h-2 w-2 bg-rust" />
            Mock engine / v0.1
          </div>
        </div>
      </nav>

      <header className="border-b-[1.5px] border-ink bg-paper/75 px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-[1500px]">
          <p className="mono mb-4 text-xs uppercase tracking-[0.2em] text-rust">
            Visual pre-production for short films
          </p>
          <h1 className="display max-w-5xl text-6xl leading-[0.88] tracking-tight sm:text-8xl lg:text-[7.5rem]">
            Turn a rough scene into a{" "}
            <span className="italic text-rust">shootable</span> sequence.
          </h1>
          <div className="mt-8 flex max-w-3xl items-start gap-4">
            <span className="mt-2 block h-[1.5px] w-12 shrink-0 bg-ink" />
            <p className="text-sm leading-relaxed text-ink/65 sm:text-base">
              Shape story beats, camera direction, visual prompts, continuity,
              and production notes. No model key required in this prototype.
            </p>
          </div>
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
          <SceneInputForm
            input={input}
            loading={loading}
            onChange={setInput}
            onSubmit={generate}
          />
          {error ? (
            <p role="alert" className="mt-5 border border-rust bg-rust/10 p-3 text-sm">
              {error}
            </p>
          ) : null}
        </aside>

        <section className="min-h-[70vh] p-5 sm:p-8 lg:p-10">
          {storyboard && evaluation ? (
            <div className="space-y-8">
              <StoryboardOutput data={storyboard} />
              <EvaluationPanel result={evaluation} />
              <JsonPreview data={storyboard} />
            </div>
          ) : (
            <EmptyState loading={loading} />
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

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex min-h-[58vh] items-center justify-center">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-7 grid h-28 w-40 grid-cols-3 border-[1.5px] border-ink bg-paper shadow-hard">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <span
              key={item}
              className={`border-ink/30 ${item < 3 ? "border-b" : ""} ${
                item % 3 !== 2 ? "border-r" : ""
              } ${loading && item % 2 === 0 ? "bg-acid" : ""}`}
            />
          ))}
        </div>
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-rust">
          {loading ? "Assembling visual beats" : "Your board is empty"}
        </p>
        <h2 className="display mt-2 text-5xl">
          {loading ? "Blocking the scene..." : "Begin with an image."}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-ink/55">
          {loading
            ? "The mock engine is shaping your brief into a structured production package."
            : "Describe the moment you can already see. The orchestrator will map the shots around it."}
        </p>
      </div>
    </div>
  );
}
