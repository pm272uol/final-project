import type { EvaluationResult } from "@/types/storyboard";

export function EvaluationPanel({ result }: { result: EvaluationResult }) {
  return (
    <section className="paper-card overflow-hidden">
      <div className="grid grid-cols-[auto_1fr] border-b-[1.5px] border-ink">
        <div className="flex min-w-28 flex-col items-center justify-center bg-acid p-5">
          <span className="display text-5xl leading-none">{result.score}</span>
          <span className="mono mt-1 text-[10px] uppercase tracking-wider">
            / 100
          </span>
        </div>
        <div className="p-5">
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-rust">
            Rule-based evaluation
          </p>
          <h2 className="display mt-1 text-3xl">
            {result.passed ? "Production ready" : "Needs another pass"}
          </h2>
          <p className="mt-2 text-sm text-ink/60">
            Structural completeness and practical filmmaking detail.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2">
        {result.checks.map((check) => (
          <div
            key={check.id}
            className="flex gap-3 border-b border-ink/15 p-4 sm:odd:border-r"
          >
            <span
              className={`mono flex h-5 w-5 shrink-0 items-center justify-center border border-ink text-xs ${
                check.passed ? "bg-ink text-acid" : "bg-rust text-white"
              }`}
            >
              {check.passed ? "✓" : "!"}
            </span>
            <div>
              <p className="text-xs font-bold">{check.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink/50">
                {check.message}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
