"use client";

import { useEffect, useRef, useState } from "react";
import { readRecovery, writeRecovery, type Workspace } from "@/lib/workspace";

/** Restore before saving, and serialize writes so an older image cannot overwrite a newer one. */
export function useWorkspaceRecovery(workspace: Workspace, onRestore: (saved: Workspace) => Promise<void>) {
  const [ready, setReady] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [status, setStatus] = useState("Restoring your workspace…");
  const [retry, setRetry] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const dirty = useRef(false);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = await readRecovery();
        if (!active) return;
        if (saved) await onRestore(saved.workspace);
        if (!active) return;
        setStatus(saved ? "Workspace restored from this browser." : "Saved in this browser.");
        setSavingEnabled(true);
      } catch {
        if (active) setStatus("Couldn't restore saved work. Automatic saving is paused; reload to try again.");
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, [onRestore]);

  useEffect(() => {
    if (!ready || !savingEnabled) return;
    const version = ++revision.current;
    let queued = false;
    dirty.current = true;
    setStatus("Saving…");
    const save = () => {
      if (queued) return;
      queued = true;
      queue.current = queue.current.then(async () => {
        try {
          await writeRecovery(workspace);
          if (version === revision.current) {
            dirty.current = false;
            setSaveFailed(false);
            setStatus("Saved in this browser.");
          }
        } catch {
          if (version === revision.current) {
            setSaveFailed(true);
            setStatus("Couldn't save in this browser. Keep this tab open to preserve your work.");
          }
        }
      });
    };
    const timer = window.setTimeout(save, 250);
    const hide = () => { if (document.visibilityState === "hidden") { clearTimeout(timer); save(); } };
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty.current) { clearTimeout(timer); save(); event.preventDefault(); event.returnValue = ""; }
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("beforeunload", leave);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("beforeunload", leave);
    };
  }, [workspace, ready, savingEnabled, retry]);

  return { ready, status, saveFailed, retrySave: () => setRetry(value => value + 1) };
}
