import { expect, it } from "vitest";
import { runVideoProcess } from "@/lib/video-generation/process";

it("returns sanitized process failure with bounded server-only diagnostics", async () => {
  await expect(runVideoProcess(process.execPath,
    ["-e", "process.stderr.write('diagnostic');process.exit(2)"], new AbortController().signal))
    .rejects.toMatchObject({ message: "Video process exited with code 2.", cause: "diagnostic" });
});

it.skipIf(process.platform === "win32")("cancels the worker and its encoder subprocess together", async () => {
  const controller = new AbortController();
  let childPid = 0;
  const program = `const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);
    console.log(child.pid);setInterval(()=>{},1000);`;
  const running = runVideoProcess(process.execPath, ["-e", program], controller.signal, process.env, output => {
    childPid = Number(output.trim());
    controller.abort();
  });
  try {
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    expect(childPid).toBeGreaterThan(0);
    // The parent promise settles after process close; the OS may take a moment
    // to reap the child killed by the same process-group signal.
    await expect.poll(() => {
      try { process.kill(childPid, 0); return false; } catch { return true; }
    }, { timeout: 2000 }).toBe(true);
  } finally { controller.abort(); }
});
