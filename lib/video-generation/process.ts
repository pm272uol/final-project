import { spawn } from "node:child_process";

/** Wait for actual process exit before releasing the job's GPU lock. */
export function runVideoProcess(command: string, args: string[], signal: AbortSignal,
  env: NodeJS.ProcessEnv = process.env, onOutput?: (text: string) => void): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", chunk => onOutput?.(chunk.toString()));
    let diagnostic = "";
    child.stderr.on("data", chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-4000); });
    const abort = () => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch { /* The process may already have exited. */ }
    };
    signal.addEventListener("abort", abort, { once: true });
    process.once("exit", abort);
    if (signal.aborted) abort();
    child.once("error", error => { signal.removeEventListener("abort", abort); process.removeListener("exit", abort); reject(error); });
    child.once("close", code => {
      signal.removeEventListener("abort", abort);
      process.removeListener("exit", abort);
      if (signal.aborted) reject(signal.reason);
      else if (code !== 0) reject(new Error(`Video process exited with code ${code}.`, { cause: diagnostic }));
      else resolve();
    });
  });
}
