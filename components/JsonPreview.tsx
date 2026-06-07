import type { StoryboardPackage } from "@/types/storyboard";

export function JsonPreview({ data }: { data: StoryboardPackage }) {
  return (
    <details className="group border-[1.5px] border-ink bg-ink text-paper">
      <summary className="flex cursor-pointer list-none items-center justify-between p-5">
        <span>
          <span className="mono block text-[10px] uppercase tracking-[0.16em] text-acid">
            Developer view
          </span>
          <span className="display text-3xl">Raw JSON package</span>
        </span>
        <span className="mono text-xl transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <pre className="max-h-[34rem] overflow-auto border-t border-paper/20 bg-[#0d0e0b] p-5 text-xs leading-relaxed text-paper/75">
        <code>{JSON.stringify(data, null, 2)}</code>
      </pre>
    </details>
  );
}
