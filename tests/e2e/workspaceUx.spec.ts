import { expect, test, type Page } from "@playwright/test";

const selectedImage = (page: Page) => page.getByTestId("panel-image-1").getByRole("img", { name: /^Generated storyboard image/ });
const saved = (page: Page) => expect(page.getByTestId("workspace-save-status")).toHaveText("Saved in this browser.");

test("regeneration compares first, and refresh restores images, history, references and unapplied edits", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await expect(page.getByRole("button", { name: "Generate new storyboard", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
  await expect(selectedImage(page)).toBeVisible();
  const original = await selectedImage(page).getAttribute("src");
  await page.getByText("Add visual references (optional)", { exact: true }).click();
  await page.locator("#reference-images").setInputFiles("evaluation/datasets/scenes/SCENE-01/scene-01.png");
  await expect(page.getByTestId("reference-image")).toHaveCount(1);
  await page.getByRole("button", { name: "Regenerate image for panel 1", exact: true }).click();
  const comparison = page.getByRole("dialog", { name: "Regenerate image", exact: true });
  await expect(comparison.getByRole("textbox")).toHaveCount(0);
  await expect(comparison.getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
  const alternative = await comparison.getByRole("img", { name: "New version image for panel 1", exact: true }).getAttribute("src");
  expect(alternative).not.toBe(original);
  await expect(selectedImage(page)).toHaveAttribute("src", original!);
  await comparison.getByRole("button", { name: "Use this image", exact: true }).click();
  await expect(selectedImage(page)).toHaveAttribute("src", alternative!);
  await page.getByLabel("Visual style", { exact: true }).selectOption("Noir");
  await expect(page.getByText("Changes not applied", { exact: true })).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(selectedImage(page)).toHaveAttribute("src", alternative!);
  await expect(page.getByLabel("Visual style", { exact: true })).toHaveValue("Noir");
  await expect(page.getByText("Changes not applied", { exact: true })).toBeVisible();
  await expect(page.getByTestId("storyboard-output").getByText("Cinematic live action", { exact: true })).toBeVisible();
  await page.getByText("Add visual references (optional)", { exact: true }).click();
  await expect(page.getByTestId("reference-image")).toHaveCount(1);

  await page.getByRole("button", { name: "Image history for panel 1", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Image history", exact: true });
  await expect(history.getByRole("img", { name: "Previous version image for panel 1", exact: true })).toHaveAttribute("src", original!);
  await history.getByRole("button", { name: "Enlarge Previous version image for panel 1", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Previous version image for panel 1", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(history).toBeVisible();
  await expect(history.getByRole("button", { name: "Enlarge Previous version image for panel 1", exact: true })).toBeFocused();
  await history.getByRole("button", { name: "Use this image", exact: true }).click();
  await expect(selectedImage(page)).toHaveAttribute("src", original!);
  const request = page.waitForRequest("**/api/generate-panel-image");
  await page.getByRole("button", { name: "Regenerate image for panel 1", exact: true }).click();
  const payload = (await request).postDataJSON();
  expect(payload.references[0].imageUrl).toMatch(/^data:image\/jpeg;base64,/);
  expect(payload.refinement).toBeUndefined();
  await expect(comparison.getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
  await comparison.getByRole("button", { name: "Keep current", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate image for panel 1", exact: true })).toBeFocused();
  expect(consoleErrors).toEqual([]);
});

test("an enlarged board image fits a small screen and returns focus when closed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
  const enlarge = page.getByRole("button", { name: /^Enlarge Generated storyboard image for panel 1:/ });
  await enlarge.click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByRole("img")).toBeVisible();
  expect(await viewer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await viewer.getByRole("button", { name: "Close enlarged image", exact: true }).click();
  await expect(viewer).toHaveCount(0);
  await expect(enlarge).toBeFocused();
});

test("a browser storage failure is visible and saving can be retried", async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    let failOnce = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "drafts" && failOnce) {
        failOnce = false;
        throw new DOMException("Test quota failure", "QuotaExceededError");
      }
      return put.apply(this, args);
    };
  });
  await page.goto("/");
  await expect(page.getByTestId("workspace-save-status")).toContainText("Couldn't save in this browser.");
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await saved(page);
  await expect(page.getByRole("button", { name: "Retry save", exact: true })).toHaveCount(0);
});

test("undo restores the previous brief, including an empty draft, which survives refresh", async ({ page }) => {
  await page.route("**/api/generate-scene-idea", route => route.fulfill({ json: { sceneIdea: "A new generated idea." } }));
  await page.goto("/");
  const brief = page.getByLabel("01 / Scene idea", { exact: true });
  await brief.fill("My original idea.");
  await page.getByRole("button", { name: "Generate scene idea", exact: true }).click();
  await expect(brief).toHaveValue("A new generated idea.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(brief).toHaveValue("My original idea.");
  await brief.fill("");
  await page.getByRole("button", { name: "Generate scene idea", exact: true }).click();
  await expect(brief).toHaveValue("A new generated idea.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(brief).toHaveValue("");
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(brief).toHaveValue("");
  await expect(page.getByTestId("generate-button")).toBeDisabled();
});

test("progress uses plain language and keeps provider output inside Technical details", async ({ page }) => {
  let finish: () => void = () => {};
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/generate-storyboard", async route => {
    await pending;
    await route.fulfill({ status: 503, json: { error: "Test provider unavailable" } });
  });
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  await expect(page.getByTestId("generation-progress-message")).toHaveText("Writing your storyboard…");
  await expect(page.getByText("Preparing the storyboard prompt...", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Schema and continuity", { exact: true })).toHaveCount(0);
  await page.getByText("Technical details", { exact: true }).click();
  await expect(page.getByText("Preparing the storyboard prompt...", { exact: true })).toBeVisible();
  finish();
  await expect(page.getByTestId("generation-error")).toContainText("Test provider unavailable");
});

test("refresh during image generation recovers without leaving the board busy", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  await page.route("**/api/generate-panel-image", () => new Promise(() => {}));
  await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
  await expect(page.getByTestId("panel-image-1").getByRole("status")).toHaveText("Generating image…");
  await saved(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Generate image for panel 1", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Generate new storyboard", exact: true })).toBeEnabled();
});
