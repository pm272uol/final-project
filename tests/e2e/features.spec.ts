import { expect, test } from "@playwright/test";

test("exports a dedicated production PDF with shot images and paginated notes", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Export production PDF" })).toHaveCount(0);
  await expect(page.getByLabel("Genre", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Duration", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Tone", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Deliverable", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Add visual references (optional)", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Project storage" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Autosave and recovery" })).toHaveCount(0);
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
  await expect(page.getByTestId("panel-image-1").locator("img")).toBeVisible();
  await expect(page.getByRole("region", { name: "PDF export" })).toBeVisible();
  expect(await page.getByRole("region", { name: "PDF export" }).evaluate(element => element === element.parentElement?.lastElementChild)).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export production PDF", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("storyboard-production.pdf");
  await file.saveAs(testInfo.outputPath("production.pdf"));
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(testInfo.outputPath("production.pdf"));
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThanOrEqual(5);
  await expect(page.getByRole("region", { name: "PDF export" }).getByRole("status")).toContainText("Production PDF exported");
});
