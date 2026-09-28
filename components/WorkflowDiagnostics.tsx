"use client";

import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { clearDiagnostics, getDiagnostics, subscribeDiagnostics } from "@/lib/diagnostics/client";
import { diagnosticPrompts, diagnosticsMarkdown, type DiagnosticRecord } from "@/lib/diagnostics/types";

const emptyRecords: DiagnosticRecord[] = [];
const json = (value: unknown) => JSON.stringify(value, null, 2) ?? "null";
const DiagnosticsEnabled = createContext(false);

export function WorkflowDiagnosticsProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <DiagnosticsEnabled.Provider value={enabled}>{children}</DiagnosticsEnabled.Provider>;
}

export function WorkflowDiagnostics() {
  const enabled = useContext(DiagnosticsEnabled);
  const records = useSyncExternalStore(subscribeDiagnostics, getDiagnostics, () => emptyRecords);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [manualCopy, setManualCopy] = useState("");

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setManualCopy("");
      setMessage("Copied to clipboard.");
    } catch {
      setManualCopy(text);
      setMessage("Clipboard unavailable. Select and copy the text below.");
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([json({ exportedAt: new Date().toISOString(), records })], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `workflow-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const button = "border border-ink/40 bg-paper px-3 py-2 text-xs font-bold disabled:opacity-40";
  if (!enabled) return null;
  return (
    <aside aria-label="Workflow diagnostics" className="font-sans normal-case tracking-normal">
      {open && <section id="workflow-diagnostics" aria-labelledby="diagnostics-heading" className="fixed bottom-14 right-4 z-50 max-h-[80vh] w-[760px] max-w-[calc(100vw-2rem)] overflow-y-auto border-[1.5px] border-ink bg-paper p-5 text-ink shadow-hard">
        <div className="flex items-center justify-between gap-3">
          <h2 id="diagnostics-heading" className="text-xl font-bold">Workflow diagnostics</h2>
          <button className={button} onClick={() => setOpen(false)}>Close diagnostics</button>
        </div>
        <p className="my-3 text-sm text-ink/70">Debug mode records model inputs, prompts, schemas and outputs for this tab. Copy Markdown for your report or export JSON. Binary media appears as metadata; mock runs are labelled. Records clear on reload.</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={!records.length} onClick={() => void copy(diagnosticsMarkdown(records))}>Copy report Markdown</button>
          <button className={button} disabled={!records.length} onClick={() => void copy(json(records))}>Copy all JSON</button>
          <button className={button} disabled={!records.length} onClick={download}>Download JSON</button>
          <button className={button} disabled={!records.length} onClick={() => { clearDiagnostics(); setManualCopy(""); setMessage("Diagnostics cleared."); }}>Clear diagnostics</button>
        </div>
        <p role="status" className="my-2 text-sm">{message}</p>
        {manualCopy && <textarea aria-label="Diagnostics to copy" readOnly value={manualCopy} onFocus={event => event.target.select()} className="mb-3 h-40 w-full border border-ink p-2 font-mono text-xs" />}
        {!records.length && <p className="py-5 text-sm">Run a workflow step to capture its model input and output.</p>}
        <div className="space-y-3">
          {records.map((record, index) => <details key={record.id} className="border border-ink/30 p-3">
            <summary className="cursor-pointer text-sm font-bold">{index + 1}. {record.operation.replaceAll("_", " ")} · {record.provider} · {record.status}</summary>
            <p className="my-2 break-words text-xs">Model: {record.model}<br />{record.startedAt} · {record.durationMs} ms</p>
            <button className={button} onClick={() => void copy(diagnosticsMarkdown([record]))}>Copy this step</button>
            {record.error && <p className="my-3 whitespace-pre-wrap text-sm text-rust">{record.error}</p>}
            {diagnosticPrompts(record.input).map((prompt, promptIndex) => <details key={promptIndex} className="mt-3" open>
              <summary className="cursor-pointer text-sm font-bold">{prompt.role === "prompt" ? "Prompt" : `${prompt.role} prompt`}</summary>
              <button className={`${button} my-2`} onClick={() => void copy(prompt.content)}>Copy prompt {promptIndex + 1}</button>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border border-ink/20 bg-white/60 p-3 text-xs">{prompt.content}</pre>
            </details>)}
            <DiagnosticValue title="Input and prompts" value={record.input} copy={copy} button={button} />
            <DiagnosticValue title="Output" value={record.output ?? null} copy={copy} button={button} />
          </details>)}
        </div>
      </section>}
      <button type="button" aria-label="Workflow diagnostics" title={`Workflow diagnostics (${records.length} records)`} aria-expanded={open} aria-controls="workflow-diagnostics" onClick={() => setOpen(value => !value)} className="flex h-7 w-7 items-center justify-center rounded text-paper/45 transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" />
        </svg>
      </button>
    </aside>
  );
}

function DiagnosticValue({ title, value, copy, button }: { title: string; value: unknown; copy: (value: string) => Promise<void>; button: string }) {
  return <details className="mt-3" open>
    <summary className="cursor-pointer text-sm font-bold">{title}</summary>
    <button className={`${button} my-2`} onClick={() => void copy(json(value))}>Copy {title.toLowerCase()}</button>
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border border-ink/20 bg-white/60 p-3 text-xs">{json(value)}</pre>
  </details>;
}
