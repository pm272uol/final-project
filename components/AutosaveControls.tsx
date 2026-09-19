"use client";
import { useEffect, useRef, useState } from "react";
import { readRecovery, writeRecovery, type Recovery, type Workspace } from "@/lib/workspace";

export function AutosaveControls({ workspace, onRestore }: { workspace: Workspace; onRestore: (workspace: Workspace) => void }) {
  const [loaded, setLoaded] = useState(false), [recovery, setRecovery] = useState<Recovery | null>(null);
  const [status, setStatus] = useState("Checking for recovery…"), [failed, setFailed] = useState(false);
  const dirty = useRef(false), queue = useRef(Promise.resolve()), current = useRef(workspace), revision = useRef(0);
  current.current = workspace;
  useEffect(() => {
    let active = true;
    void readRecovery().then(saved => { if (active) { setRecovery(saved); setLoaded(true); } }).catch(() => { if (active) { setStatus("Recovery could not be read. Export a backup before clearing recovery."); setFailed(true); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!loaded || recovery) return;
    const version = ++revision.current;
    dirty.current = true; setStatus("Unsaved changes…");
    const save = () => {
      const snapshot = current.current;
      queue.current = queue.current.then(async () => {
        try { const savedAt = await writeRecovery(snapshot); if (version === revision.current) { dirty.current = false; setFailed(false); setStatus(`Autosaved at ${new Date(savedAt).toLocaleTimeString()}`); } }
        catch { setFailed(true); setStatus("Autosave failed. Save or export your project to protect your work."); }
      });
    };
    const timer = window.setTimeout(save, 400);
    const leave = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ""; } };
    const hide = () => { if (document.visibilityState === "hidden" && dirty.current) { clearTimeout(timer); save(); } };
    window.addEventListener("beforeunload", leave); document.addEventListener("visibilitychange", hide);
    return () => { clearTimeout(timer); window.removeEventListener("beforeunload", leave); document.removeEventListener("visibilitychange", hide); };
  }, [workspace, loaded, recovery]);
  return <section className="my-3 space-y-2 text-xs text-ink/60" aria-label="Autosave and recovery">
    <p role="status">{recovery ? `Recovery available from ${new Date(recovery.savedAt).toLocaleString()}. Choose an option to resume autosave.` : status}</p>
    {recovery && <div className="flex flex-wrap gap-2">
      <button className="border p-2" onClick={() => { onRestore(recovery.workspace); setRecovery(null); }}>Restore autosaved workspace</button>
      <button className="border p-2" onClick={() => { if (window.confirm("Discard the autosaved workspace?")) setRecovery(null); }}>Discard recovery</button>
    </div>}
    {failed && <button className="border p-2" onClick={() => { if (window.confirm("Clear recovery and retry autosave? Export a backup first.")) void writeRecovery(null).then(() => { setLoaded(true); setRecovery(null); setFailed(false); setStatus("Recovery cleared. Edit to resume autosave."); }).catch(() => setStatus("Browser storage is unavailable. Export a project backup.")); }}>Clear recovery and retry</button>}
  </section>;
}
