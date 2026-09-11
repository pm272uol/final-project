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
