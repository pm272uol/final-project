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

test("exports a dedicated production PDF with shot images and paginated notes", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await page.getByRole("button", { name: "Approve visual direction", exact: true }).click();
  await page.getByRole("button", { name: "Generate reference frame", exact: true }).click();
  await expect(page.getByTestId("panel-image-1").locator("img")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export production PDF", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("storyboard-production.pdf");
  await file.saveAs(testInfo.outputPath("production.pdf"));
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(testInfo.outputPath("production.pdf"));
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThanOrEqual(5);
  await expect(page.getByRole("region", { name: "Project storage" }).getByRole("status")).toContainText("Production PDF exported");
});

test("records continuity reviews and reopens checks after shot edits", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  await page.getByText(/^Continuity issue checklist ·/).click();
  await page.getByLabel("Reviewed shot 1 cast", { exact: true }).check();
  await page.getByLabel("Shot 1 cast review note", { exact: true }).fill("Identity checked against the reference");
  await expect(page.getByLabel("Reviewed shot 1 cast", { exact: true })).toBeChecked();
  await page.getByText("Edit and review panel 1", { exact: true }).click();
  await page.getByLabel("Action for panel 1", { exact: true }).fill("The astronaut walks away from the plant.");
  await page.getByRole("button", { name: "Save panel 1 edits", exact: true }).click();
  await expect(page.getByLabel("Reviewed shot 1 cast", { exact: true })).not.toBeChecked();
});

test("shows unknown estimates until matching measurements and prices are available", async ({ page }) => {
  await page.route("**/api/image-estimate-config", route => route.fulfill({ json: { provider: "replicate", model: "example/model", usdPerImage: null, priceBasis: "Not configured", batchIntervalMs: 12000 } }));
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  const estimates = page.getByRole("region", { name: "Generation estimates" });
  await expect(estimates).toContainText("example/model");
  await expect(estimates.getByRole("row", { name: /Missing images/ }).getByRole("cell")).toHaveText(["6", "Unknown", "Unknown"]);
  await expect(estimates).toContainText("0 distinct successful retained renders");
  await page.getByLabel("Estimate panel").selectOption("2");
  await expect(estimates).toContainText("Only panel 2");
});

test("restoring versions refreshes visual bible drafts and fits comparison on mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  await page.getByLabel("Version name", { exact: true }).fill("Baseline");
  await page.getByRole("button", { name: "Capture version", exact: true }).click();
  const original = await page.getByLabel("palette", { exact: true }).inputValue();
  await page.getByLabel("palette", { exact: true }).fill("An unsaved visual bible draft");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Restore Baseline", exact: true }).click();
  await expect(page.getByLabel("palette", { exact: true })).toHaveValue(original);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
