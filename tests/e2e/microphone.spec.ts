import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const tracked = window as typeof window & { microphoneStream?: MediaStream };
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints);
      tracked.microphoneStream = stream;
      return stream;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Record scene idea", exact: true }).click();
});

test("records, stops the microphone and transcribes through the selected provider", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/transcribe", async route => {
    requests++;
    const form = await new Response(new Uint8Array(route.request().postDataBuffer()!), {
      headers: { "content-type": route.request().headers()["content-type"] },
    }).formData();
    expect(form.get("provider")).toBeNull();
    const file = form.get("file") as File;
    expect(file.name).toBe("microphone.webm");
    expect(file.size).toBeGreaterThan(0);
    await route.fulfill({ json: { text: "A recorded scene.", provider: "groq", model: "whisper-large-v3-turbo", language: "en", durationMs: 50 } });
  });
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Recording 0:01" })).toBeVisible();
  expect(requests).toBe(0);
  await expect(page.getByLabel("Transcribe with", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Stop and transcribe" }).click();
  await expect(page.getByLabel("Review transcript")).toHaveValue("A recorded scene.");
  expect(requests).toBe(1);
  expect(await page.evaluate(() => (window as typeof window & { microphoneStream: MediaStream }).microphoneStream.getTracks().every(track => track.readyState === "ended"))).toBe(true);
  await expect(page.getByLabel("01 / Scene idea", { exact: true })).toHaveValue("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await page.getByRole("button", { name: "Add to scene idea" }).click();
  await expect(page.getByLabel("01 / Scene idea", { exact: true })).toHaveValue("A tired astronaut discovers a tiny plant growing inside an abandoned space station.\n\nA recorded scene.");
});

test("cancel releases the microphone and sends no transcription", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/transcribe", route => { requests++; return route.abort(); });
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("button", { name: "Stop and transcribe" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel recording" }).click();
  await expect(page.getByText("Recording cancelled. No audio was sent.")).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { microphoneStream: MediaStream }).microphoneStream.getTracks().every(track => track.readyState === "ended"))).toBe(true);
  expect(requests).toBe(0);
  await expect(page.getByRole("button", { name: "Start recording" })).toBeEnabled();
});

test("permission denial leaves upload available", async ({ page }) => {
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); };
  });
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByText("Microphone permission was denied.", { exact: false })).toBeVisible();
  await page.getByText("Upload a saved voice note instead", { exact: true }).click();
  await expect(page.getByLabel("Audio file (up to 20 MB)")).toBeEnabled();
});

test("cancelling pending permission releases a stream that arrives later", async ({ page }) => {
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = constraints => new Promise(resolve => {
      (window as typeof window & { grantMicrophone?: () => Promise<void> }).grantMicrophone = async () => resolve(await original(constraints));
    });
  });
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByText("Waiting for microphone permission…")).toBeVisible();
  await page.getByRole("button", { name: "Cancel recording" }).click();
  await page.evaluate(() => (window as typeof window & { grantMicrophone: () => Promise<void> }).grantMicrophone());
  await expect.poll(() => page.evaluate(() => (window as typeof window & { microphoneStream: MediaStream }).microphoneStream.getTracks().every(track => track.readyState === "ended"))).toBe(true);
  await expect(page.getByRole("button", { name: "Start recording" })).toBeEnabled();
  await expect(page.getByLabel("Review transcript")).toHaveCount(0);
});

test("automatically stops and transcribes at the recording limit", async ({ page }) => {
  await page.route("**/api/transcribe", route => route.fulfill({ json: {
    text: "A timed scene.", provider: "local", model: "mlx-community/whisper-large-v3-turbo", language: "en", durationMs: 50,
  } }));
  await page.clock.install();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("button", { name: "Stop and transcribe" })).toBeVisible();
  // Let the native recorder capture audio before advancing JavaScript timers.
  await expect(page.getByRole("status").filter({ hasText: "Recording 0:01" })).toBeVisible();
  await page.clock.fastForward(120_000);
  await expect(page.getByLabel("Review transcript")).toHaveValue("A timed scene.");
  expect(await page.evaluate(() => (window as typeof window & { microphoneStream: MediaStream }).microphoneStream.getTracks().every(track => track.readyState === "ended"))).toBe(true);
});

test("Escape closes the modal, releases the microphone and restores focus", async ({ page }) => {
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("button", { name: "Stop and transcribe" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { microphoneStream: MediaStream }).microphoneStream.getTracks().every(track => track.readyState === "ended"))).toBe(true);
  await expect(page.getByRole("button", { name: "Record scene idea", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Record scene idea", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start recording" })).toBeEnabled();
});

test("closing while permission is pending releases a late stream", async ({ page }) => {
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = constraints => new Promise(resolve => {
      (window as typeof window & { grantMicrophone?: () => Promise<void> }).grantMicrophone = async () => resolve(await original(constraints));
    });
  });
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByText("Waiting for microphone permission…")).toBeVisible();
  await page.getByRole("button", { name: "Close voice recorder" }).click();
  await page.evaluate(() => (window as typeof window & { grantMicrophone: () => Promise<void> }).grantMicrophone());
  await expect.poll(() => page.evaluate(() => (window as typeof window & { microphoneStream: MediaStream }).microphoneStream.getTracks().every(track => track.readyState === "ended"))).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
