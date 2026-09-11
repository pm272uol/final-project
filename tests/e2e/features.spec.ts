import { expect, test } from "@playwright/test";

test("reorders, duplicates, inserts and deletes panels", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  await expect(page.getByTestId("storyboard-panel")).toHaveCount(6);
  await page.getByText("Edit and review panel 1", { exact: true }).click();
  await page.getByRole("button", { name: "Duplicate panel 1", exact: true }).click();
  await expect(page.getByTestId("storyboard-panel")).toHaveCount(7);
  await page.getByText("Edit and review panel 2", { exact: true }).click();
  await page.getByRole("button", { name: "Move panel 2 down", exact: true }).click();
  await page.getByRole("button", { name: "Insert after panel 3", exact: true }).click();
  await expect(page.getByTestId("storyboard-panel")).toHaveCount(8);
  await page.getByText("Edit and review panel 4", { exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Delete panel 4", exact: true }).click();
  await expect(page.getByTestId("storyboard-panel")).toHaveCount(7);
});

test("edits story beats, dialogue, sound and treatment text", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  await page.getByText("Edit and review panel 1", { exact: true }).click();
  await page.getByLabel("Story beat for panel 1", { exact: true }).fill("A new opening beat");
  await page.getByLabel("Dialogue or narration for panel 1", { exact: true }).fill("We have arrived.");
  await page.getByLabel("Sound for panel 1", { exact: true }).fill("Rain on the roof");
  await page.getByRole("button", { name: "Save panel 1 edits", exact: true }).click();
  await expect(page.getByTestId("storyboard-panel").first()).toContainText("A new opening beat");
  await expect(page.getByTestId("storyboard-panel").first()).toContainText("Rain on the roof");
  await page.getByRole("button", { name: "Edit treatment and production bible text" }).click();
  await page.getByLabel("Title", { exact: true }).fill("The revised treatment");
  await page.getByRole("button", { name: "Save treatment edits" }).click();
  await expect(page.getByRole("heading", { name: "The revised treatment", exact: true })).toBeVisible();
});

test("recovers the scene brief and applied storyboard edits after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  await page.getByText("Edit and review panel 1", { exact: true }).click();
  await page.getByLabel("Story beat for panel 1", { exact: true }).fill("Recovered opening");
  await page.getByRole("button", { name: "Save panel 1 edits", exact: true }).click();
  await expect(page.getByRole("region", { name: "Autosave and recovery" })).toContainText("Autosaved at");
  await page.reload();
  await page.getByRole("button", { name: "Restore autosaved workspace" }).click();
  await expect(page.getByTestId("storyboard-panel").first()).toContainText("Recovered opening");
  await expect(page.getByTestId("storyboard-panel")).toHaveCount(6);
});

test("saves durations and previews a timed sequence with transport controls", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  await page.getByLabel("Shot 1 seconds", { exact: true }).fill("0.5");
  await page.getByRole("button", { name: "Save timings", exact: true }).click();
  await expect(page.getByTestId("sequence-total")).toContainText("50.5s");
  await page.getByRole("button", { name: "Play sequence", exact: true }).click();
  await expect(page.getByTestId("playback-frame")).toContainText("Shot 2 / 6");
  await page.getByRole("button", { name: "Pause sequence", exact: true }).click();
  await page.getByRole("button", { name: "Restart sequence", exact: true }).click();
  await expect(page.getByTestId("playback-frame")).toContainText("Shot 1 / 6");
  await page.getByRole("button", { name: "Next shot", exact: true }).click();
  await expect(page.getByTestId("playback-frame")).toContainText("Shot 2 / 6");
});

test("compares independent versions and preserves them through project export and import", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  await page.getByLabel("Version name", { exact: true }).fill("Original cut");
  await page.getByLabel("Input condition label", { exact: true }).fill("Text only");
  await page.getByRole("button", { name: "Capture version", exact: true }).click();
  await page.getByText("Edit and review panel 1", { exact: true }).click();
  await page.getByLabel("Story beat for panel 1", { exact: true }).fill("Changed for second cut");
  await page.getByRole("button", { name: "Save panel 1 edits", exact: true }).click();
  const columns = page.getByTestId("version-comparison").locator(":scope > div");
  await expect(columns.first()).toContainText("Changed for second cut");
  await expect(columns.last()).not.toContainText("Changed for second cut");
  await expect(columns.last()).toContainText("Text only");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project JSON", exact: true }).click();
  const path = await (await download).path();
  page.once("dialog", dialog => dialog.accept());
  await page.getByLabel("Import project JSON").setInputFiles(path!);
  await page.getByLabel("Right version", { exact: true }).selectOption({ label: "Original cut" });
  await expect(columns.last()).toContainText("Text only");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Restore Original cut", exact: true }).click();
  await expect(page.getByTestId("storyboard-panel").first()).not.toContainText("Changed for second cut");
  await expect(page.getByRole("region", { name: "Storyboard versions" })).toContainText("2 / 50 snapshots");
});
