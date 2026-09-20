import { expect, test, type Page } from "@playwright/test";

const saved = (page: Page) => expect(page.getByTestId("workspace-save-status")).toHaveText("Saved in this browser.");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Start over?", exact: true });

test("start over confirms, clears the whole workspace, and stays empty after refresh", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await expect(page.getByTestId("workspace-save-status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start over", exact: true })).toHaveCount(0);
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
  await page.getByRole("button", { name: "Regenerate image for panel 1", exact: true }).click();
  await page.getByRole("button", { name: "Use this image", exact: true }).click();
  await page.getByText("Add visual references (optional)", { exact: true }).click();
  await page.locator("#reference-images").setInputFiles("evaluation/datasets/scenes/SCENE-01/scene-01.png");
  await expect(page.getByTestId("reference-image")).toHaveCount(1);
  await page.getByLabel("Visual style", { exact: true }).selectOption("Noir");
  const brief = page.getByLabel("01 / Scene idea", { exact: true });
  await brief.fill("My unfinished scene.");
  await saved(page);
  const startOver = page.getByRole("button", { name: "Start over", exact: true });
  await startOver.click();
  await expect(dialog(page).getByRole("button", { name: "Keep working" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(startOver).toBeFocused();
  await expect(brief).toHaveValue("My unfinished scene.");
  await expect(page.getByTestId("storyboard-output")).toBeVisible();
  await expect(page.getByTestId("reference-image")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Image history for panel 1", exact: true })).toBeVisible();
  // Reset immediately after an edit to exercise cancellation of a pending autosave.
  await brief.fill("An edit just before starting over.");
  await startOver.click();
  await dialog(page).getByRole("button", { name: "Start over", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(startOver).toHaveCount(0);
  await expect(brief).toHaveValue("");
  await expect(page.getByLabel("Panels", { exact: true })).toHaveValue("6");
  await expect(page.getByLabel("Visual style", { exact: true })).toHaveValue("Cinematic live action");
  await expect(page.getByTestId("storyboard-output")).toHaveCount(0);
  await expect(page.getByTestId("reference-image")).toHaveCount(0);
  await expect(page.getByTestId("workspace-save-status")).toHaveCount(0);
  await page.reload();
  await expect(brief).toBeEnabled();
  await expect(page.getByTestId("workspace-save-status")).toHaveCount(0);
  await expect(brief).toHaveValue("");
  await expect(page.getByText("Your board is empty", { exact: true })).toBeVisible();
  await expect(startOver).toHaveCount(0);
  await expect(page.getByTestId("generate-button")).toBeDisabled();
  await page.getByText("Add visual references (optional)", { exact: true }).click();
  await expect(page.getByTestId("reference-image")).toHaveCount(0);
});

test("failed reset keeps current work and supports retry", async ({ page }) => {
  await page.addInitScript(() => {
    const remove = IDBObjectStore.prototype.delete;
    let failOnce = true;
    IDBObjectStore.prototype.delete = function (...args) {
      if (this.name === "drafts" && failOnce) {
        failOnce = false;
        throw new DOMException("Test quota failure", "QuotaExceededError");
      }
      return remove.apply(this, args);
    };
  });
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  const brief = page.getByLabel("01 / Scene idea", { exact: true });
  await brief.fill("Keep this scene safe.");
  await page.getByTestId("generate-button").click();
  await expect(page.getByTestId("storyboard-output")).toBeVisible();
  await saved(page);
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Start over", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Your current work is unchanged");
  await expect(brief).toHaveValue("Keep this scene safe.");
  await dialog(page).getByRole("button", { name: "Keep working" }).click();
  await saved(page);
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Start over", exact: true }).click();
  await expect(brief).toHaveValue("");
  await expect(page.getByTestId("workspace-save-status")).toHaveCount(0);
});

test("start over is unavailable during idea generation and clears idea undo history", async ({ page }) => {
  let finish: () => void = () => {};
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/generate-scene-idea", async route => {
    await pending;
    await route.fulfill({ json: { sceneIdea: "A fresh generated idea." } });
  });
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await page.getByTestId("generate-button").click();
  await expect(page.getByTestId("storyboard-output")).toBeVisible();
  await page.getByRole("button", { name: "Generate scene idea", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start over", exact: true })).toBeDisabled();
  finish();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Start over", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
  const request = page.waitForRequest("**/api/generate-scene-idea");
  await page.getByRole("button", { name: "Generate scene idea", exact: true }).click();
  expect((await request).postDataJSON().recentSuggestions).toEqual([]);
});
