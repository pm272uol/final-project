import { expect, test } from "@playwright/test";

test("reviews and appends a voice transcript without overwriting scene edits", async ({ page }) => {
  await page.route("**/api/transcribe", async route => {
    expect(route.request().postDataBuffer()?.toString()).not.toContain('name="provider"');
    await route.fulfill({ json: { text: "A projectionist finds a hidden frame.", provider: "groq", model: "whisper-large-v3-turbo", language: "en", durationMs: 100 } });
  });
  await page.route("**/api/transcribe/config", route => route.fulfill({ json: { provider: "groq" } }));
  await page.goto("/");
  const scene = page.getByLabel("01 / Scene idea", { exact: true });
  await scene.fill("Existing idea.");
  await page.getByRole("button", { name: "Record scene idea", exact: true }).click();
  await page.getByText("Upload a saved voice note instead", { exact: true }).click();
  await expect(page.getByText("Audio is sent to Groq", { exact: false })).toBeVisible();
  await page.getByLabel("Audio file (up to 20 MB)").setInputFiles({ name: "note.wav", mimeType: "audio/wav", buffer: Buffer.from("mock audio") });
  await page.getByRole("button", { name: "Transcribe audio", exact: true }).click();
  await expect(page.getByLabel("Review transcript")).toHaveValue("A projectionist finds a hidden frame.");
  await expect(scene).toHaveValue("Existing idea.");
  await page.getByLabel("Review transcript").fill("A revised voice note.");
  await page.getByRole("button", { name: "Add to scene idea" }).click();
  await expect(scene).toHaveValue("Existing idea.\n\nA revised voice note.");
});

test("preserves scene text when local transcription fails", async ({ page }) => {
  await page.route("**/api/transcribe", route => route.fulfill({ status: 503, json: { error: "Local Whisper setup is required." } }));
  await page.goto("/");
  const scene = page.getByLabel("01 / Scene idea", { exact: true });
  await scene.fill("Keep this scene.");
  await page.getByRole("button", { name: "Record scene idea", exact: true }).click();
  await page.getByText("Upload a saved voice note instead", { exact: true }).click();
  await page.getByLabel("Audio file (up to 20 MB)").setInputFiles({ name: "note.wav", mimeType: "audio/wav", buffer: Buffer.from("mock") });
  await page.getByRole("button", { name: "Transcribe audio", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Local Whisper setup" })).toContainText("Local Whisper setup is required.");
  await expect(scene).toHaveValue("Keep this scene.");
});

test("requires shortening a transcript that would exceed the scene limit", async ({ page }) => {
  await page.route("**/api/transcribe", route => route.fulfill({ json: { text: "A new scene.", provider: "local", model: "mlx-community/whisper-large-v3-turbo", language: "en", durationMs: 100 } }));
  await page.goto("/");
  const scene = page.getByLabel("01 / Scene idea", { exact: true });
  await scene.fill("x".repeat(1190));
  await page.getByRole("button", { name: "Record scene idea", exact: true }).click();
  await page.getByText("Upload a saved voice note instead", { exact: true }).click();
  await page.getByLabel("Audio file (up to 20 MB)").setInputFiles({ name: "note.wav", mimeType: "audio/wav", buffer: Buffer.from("mock") });
  await page.getByRole("button", { name: "Transcribe audio", exact: true }).click();
  const append = page.getByRole("button", { name: "Add to scene idea" });
  await expect(append).toBeDisabled();
  await expect(page.getByText("Shorten the transcript or scene idea", { exact: false })).toBeVisible();
  await page.getByLabel("Review transcript").fill("A scene.");
  await expect(append).toBeEnabled();
  await append.click();
  await expect(scene).toHaveValue("x".repeat(1190) + "\n\nA scene.");
});
