"use client";
import { exportProductionPdf } from "@/lib/productionPdf";
import type { StoryboardVersion } from "@/lib/versions";
import type { GenerationMetadata } from "@/types/storyboard";
import { useState } from "react";
import type { StoryboardInput, StoryboardPackage } from "@/types/storyboard";
import { downloadFile, exportContactSheet, listProjects, parseProject, saveProject, type SavedProject } from "@/lib/projects";

export function ProjectControls({ versions, metadata, id, onIdChange, input, storyboard, busy, onOpen }: { versions: StoryboardVersion[]; metadata: GenerationMetadata | null; id: string | null; onIdChange: (id: string) => void; input: StoryboardInput; storyboard: StoryboardPackage | null; busy: boolean; onOpen: (p: SavedProject) => void }) {
  const [exporting, setExporting] = useState(false);
  const [projects, setProjects] = useState<SavedProject[]>([]), [status, setStatus] = useState("");
  const snapshot = (): SavedProject => { if (!storyboard) throw new Error("Generate a storyboard first."); return { formatVersion: 1, id: id ?? crypto.randomUUID(), name: storyboard.title, savedAt: new Date().toISOString(), input, storyboard, versions, metadata }; };
  const run = async (action: () => Promise<void>) => { try { await action(); } catch (error) { setStatus(error instanceof Error ? error.message : "Project operation failed."); } };
  const open = (project: SavedProject) => { if (storyboard && !window.confirm("Replace this scene with the saved project? Save current changes first.")) return; onOpen(project); onIdChange(project.id); setStatus(`Opened ${project.name}.`); };
  return <section className="paper-card p-4 space-y-3" aria-label="Project storage">
    <fieldset disabled={busy || exporting} className="flex flex-wrap gap-3">
      <button disabled={!storyboard} className="border p-2" onClick={() => void run(async () => { const p = snapshot(); await saveProject(p); onIdChange(p.id); setStatus(`Saved ${p.name} in this browser.`); })}>Save project</button>
      <button className="border p-2" onClick={() => void run(async () => { const saved = await listProjects(); setProjects(saved); setStatus(saved.length ? "Choose a saved project." : "No saved projects in this browser."); })}>Browse saved projects</button>
      <button disabled={!storyboard} className="border p-2" onClick={() => void run(async () => {
        setExporting(true); setStatus("Preparing production PDF…");
        try { const warnings = await exportProductionPdf(storyboard!, input.duration); setStatus(warnings.length ? `PDF exported. ${warnings.join("; ")}.` : "Production PDF exported."); } finally { setExporting(false); }
      })}>Export production PDF</button>
      <details><summary className="cursor-pointer border p-2">More file options</summary><div className="mt-3 flex flex-wrap gap-3">
      <button disabled={!storyboard} className="border p-2" onClick={() => void run(async () => { downloadFile("framewright-project.json", new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" })); setStatus("JSON exported with embedded images and generation metadata."); })}>Export project JSON</button>
      <button disabled={!storyboard} className="border p-2" onClick={() => void run(async () => { await exportContactSheet(storyboard!); setStatus("Contact sheet exported."); })}>Export contact sheet</button>
      <button disabled={!storyboard} className="border p-2" onClick={() => window.print()}>Print storyboard</button>
      <button disabled={!storyboard} className="border p-2" onClick={() => void run(async () => { await navigator.clipboard.writeText(JSON.stringify(snapshot(), null, 2)); setStatus("Complete project copied."); })}>Copy complete storyboard</button>
      <label className="border p-2">Import project JSON<input type="file" accept="application/json,.json" className="block max-w-full" onChange={event => { const file = event.target.files?.[0]; if (!file) return; void run(async () => { if (file.size > 150_000_000) throw new Error("Project exceeds 150 MB."); open(parseProject(JSON.parse(await file.text()))); }); event.target.value = ""; }} /></label>
      </div></details>
      {projects.map(p => <button className="border p-2" key={p.id} onClick={() => open(p)}>Open {p.name} · {new Date(p.savedAt).toLocaleString()}</button>)}
    </fieldset>
    <p role="status" className="text-sm">{status}</p>

  </section>;
}
