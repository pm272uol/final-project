import { expect, test } from "@playwright/test";

test("reviews and appends a voice transcript without overwriting scene edits", async ({ page }) => {
  await page.route("**/api/transcribe", async route => {
    expect(route.request().postDataBuffer()?.toString()).toContain("groq");
    await route.fulfill({ json: { text: "A projectionist finds a hidden frame.", provider: "groq", model: "whisper-large-v3-turbo", language: "en", durationMs: 100 } });
  });
  await page.goto("/");
  const scene = page.getByLabel("01 / Scene idea", { exact: true });
  await scene.fill("Existing idea.");
  await page.getByText("Use an English voice note", { exact: true }).click();
  await page.getByLabel("Transcribe with", { exact: true }).selectOption("groq");
  await expect(page.getByText("Transcribing sends this audio to Groq.", { exact: false })).toBeVisible();
  await page.getByLabel("Audio file (up to 20 MB)").setInputFiles({ name: "note.wav", mimeType: "audio/wav", buffer: Buffer.from("mock audio") });
  await page.getByRole("button", { name: "Transcribe with Groq", exact: true }).click();
  await expect(page.getByLabel("Review transcript")).toHaveValue("A projectionist finds a hidden frame.");
  await expect(scene).toHaveValue("Existing idea.");
  await page.getByLabel("Review transcript").fill("A revised voice note.");
  await scene.fill("Edited while reviewing.");
  await page.getByRole("button", { name: "Add to scene idea" }).click();
  await expect(scene).toHaveValue("Edited while reviewing.\n\nA revised voice note.");
});

test("preserves scene text when local transcription fails", async ({ page }) => {
  await page.route("**/api/transcribe", route => route.fulfill({ status: 503, json: { error: "Local Whisper setup is required." } }));
  await page.goto("/");
  const scene = page.getByLabel("01 / Scene idea", { exact: true });
  await scene.fill("Keep this scene.");
  await page.getByText("Use an English voice note", { exact: true }).click();
  await page.getByLabel("Audio file (up to 20 MB)").setInputFiles({ name: "note.wav", mimeType: "audio/wav", buffer: Buffer.from("mock") });
  await page.getByRole("button", { name: "Transcribe locally", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Local Whisper setup" })).toContainText("Local Whisper setup is required.");
  await expect(scene).toHaveValue("Keep this scene.");
});

test("requires shortening a transcript that would exceed the scene limit", async ({ page }) => {
  await page.route("**/api/transcribe", route => route.fulfill({ json: { text: "A new scene.", provider: "local", model: "mlx-community/whisper-large-v3-turbo", language: "en", durationMs: 100 } }));
  await page.goto("/");
  const scene = page.getByLabel("01 / Scene idea", { exact: true });
  await scene.fill("x".repeat(1190));
  await page.getByText("Use an English voice note", { exact: true }).click();
  await page.getByLabel("Audio file (up to 20 MB)").setInputFiles({ name: "note.wav", mimeType: "audio/wav", buffer: Buffer.from("mock") });
  await page.getByRole("button", { name: "Transcribe locally", exact: true }).click();
  const append = page.getByRole("button", { name: "Add to scene idea" });
  await expect(append).toBeDisabled();
  await expect(page.getByText("Shorten the transcript or scene idea", { exact: false })).toBeVisible();
  await page.getByLabel("Review transcript").fill("A scene.");
  await expect(append).toBeEnabled();
  await append.click();
  await expect(scene).toHaveValue("x".repeat(1190) + "\n\nA scene.");
});
