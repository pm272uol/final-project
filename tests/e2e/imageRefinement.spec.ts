import { expect, test, type Page } from "@playwright/test";

async function createBoard(page: Page) {
  await page.goto("/");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await page.getByTestId("generate-all-images").click();
  await expect(page.getByRole("button", { name: "Images ready", exact: true })).toBeVisible();
}

const currentImage = (page: Page, panel = 2) => page.getByTestId(`panel-image-${panel}`).getByRole("img", { name: /^Generated storyboard image/ });

test("compares before replacing, preserves other panels, and restores from history", async ({ page }) => {
  await createBoard(page);
  const original = await currentImage(page).getAttribute("src");
  const neighbour = await currentImage(page, 1).getAttribute("src");
  await page.getByRole("button", { name: "Refine image for panel 2", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox")).toHaveCount(1);
  await expect(dialog.getByRole("textbox")).toBeFocused();
  await dialog.getByLabel("What would you like to change?").fill("Make the boat red.");
  const request = page.waitForRequest("**/api/generate-panel-image");
  await dialog.getByRole("button", { name: "Generate alternative", exact: true }).click();
  expect((await request).postDataJSON().refinement).toEqual({ instructions: "Make the boat red.", imageUrl: original });
  const alternative = dialog.getByRole("img", { name: "New version image for panel 2", exact: true });
  await expect(alternative).toBeVisible();
  const candidate = await alternative.getAttribute("src");
  expect(candidate).not.toBe(original);
  await expect(currentImage(page)).toHaveAttribute("src", original!);
  await dialog.getByRole("button", { name: "Use this image", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(currentImage(page)).toHaveAttribute("src", candidate!);
  await expect(currentImage(page, 1)).toHaveAttribute("src", neighbour!);

  await page.getByRole("button", { name: "Image history for panel 2", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Previous version image for panel 2", exact: true })).toHaveAttribute("src", original!);
  await dialog.getByRole("button", { name: "Use this image", exact: true }).click();
  await expect(currentImage(page)).toHaveAttribute("src", original!);
  await page.getByRole("button", { name: "Image history for panel 2", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Previous version image for panel 2", exact: true })).toHaveAttribute("src", candidate!);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Image history for panel 2", exact: true })).toBeFocused();
});

test("keeps rejected candidates in history and supports trying again on a small screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createBoard(page);
  const original = await currentImage(page).getAttribute("src");
  await page.getByRole("button", { name: "Refine image for panel 2", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Use warmer lighting.");
  await dialog.getByRole("button", { name: "Generate alternative", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Edit request", exact: true }).click();
  await expect(dialog.getByRole("textbox")).toHaveValue("Use warmer lighting.");
  await expect(dialog.getByRole("textbox")).toBeFocused();
  await dialog.getByRole("textbox").fill("Make the boat red.");
  await dialog.getByRole("button", { name: "Generate alternative", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Keep current", exact: true }).click();
  await expect(currentImage(page)).toHaveAttribute("src", original!);
  await page.getByRole("button", { name: "Image history for panel 2", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /^Compare version/ })).toHaveCount(3);
});

test("preserves the image on provider errors and cancellation, then allows retry", async ({ page }) => {
  await createBoard(page);
  const original = await currentImage(page).getAttribute("src");
  await page.route("**/api/generate-panel-image", route => route.fulfill({ status: 502, json: { error: "Please try again later." } }));
  await page.getByRole("button", { name: "Refine image for panel 2", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Use warmer lighting.");
  await dialog.getByRole("button", { name: "Generate alternative", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Please try again later.");
  await expect(currentImage(page)).toHaveAttribute("src", original!);
  await page.unroute("**/api/generate-panel-image");
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/generate-panel-image", async route => {
    await pending;
    await route.fulfill({ status: 502, json: { error: "Cancelled test response" } });
  });
  const requested = page.waitForRequest("**/api/generate-panel-image");
  await dialog.getByRole("button", { name: "Generate alternative", exact: true }).click();
  await requested;
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  release();
  await expect(dialog).not.toBeVisible();
  await expect(currentImage(page)).toHaveAttribute("src", original!);
  await expect(page.getByRole("button", { name: "Refine image for panel 2", exact: true })).toBeEnabled();
  await page.unroute("**/api/generate-panel-image");
  await page.getByRole("button", { name: "Refine image for panel 2", exact: true }).click();
  await dialog.getByRole("textbox").fill("Use warmer lighting.");
  await dialog.getByRole("button", { name: "Generate alternative", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
});
