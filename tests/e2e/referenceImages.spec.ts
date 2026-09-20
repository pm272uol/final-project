import { expect, test } from "@playwright/test";
import type { PanelImageGenerationRequest } from "../../types/storyboard";

const referenceFile = "evaluation/datasets/scenes/SCENE-01/scene-01.png";

test("uploads guide every frame without analysis and removal restores the first-frame reference", async ({ page }) => {
  const requests: PanelImageGenerationRequest[] = [];
  await page.route("**/api/generate-panel-image", async route => {
    requests.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await page.getByText("Add visual references (optional)", { exact: true }).click();
  await page.locator("#reference-images").setInputFiles([referenceFile, "evaluation/datasets/scenes/SCENE-02/scene-02.png"]);
  await expect(page.getByTestId("reference-image")).toHaveCount(2);
  await page.getByLabel("Purpose for visual reference 2").selectOption("Character");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await page.getByTestId("generate-all-images").click();
  await expect(page.getByTestId("generate-all-images")).toHaveText("Images ready");
  expect(requests).toHaveLength(4);
  expect(requests[0].references).toHaveLength(2);
  expect(requests[0].references?.map(reference => reference.purpose)).toEqual(["style", "character"]);
  for (const request of requests) {
    expect(request.references).toEqual(requests[0].references);
    expect(request.references?.every(reference => reference.source === "upload" && reference.imageUrl.startsWith("data:image/jpeg;base64,"))).toBe(true);
  }
  const firstFrame = await page.getByTestId("panel-image-1").locator("img").getAttribute("src");
  await page.getByRole("button", { name: "Remove reference", exact: true }).first().click();
  await page.getByRole("button", { name: "Remove reference", exact: true }).click();
  await page.getByRole("button", { name: "Regenerate image for panel 3", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
  expect(requests[4].references).toHaveLength(1);
  expect(requests[4].references?.[0]).toMatchObject({ source: "generated", imageUrl: firstFrame });
});

test("uploads added after generation guide both refinement and subsequent regeneration", async ({ page }) => {
  const requests: PanelImageGenerationRequest[] = [];
  await page.route("**/api/generate-panel-image", async route => {
    requests.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await page.getByTestId("generate-button").click();
  await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refine image for panel 1", exact: true })).toBeEnabled();
  const currentImage = await page.getByTestId("panel-image-1").locator("img").getAttribute("src");
  await page.getByText("Add visual references (optional)", { exact: true }).click();
  await page.locator("#reference-images").setInputFiles(referenceFile);
  await expect(page.getByTestId("reference-image")).toHaveCount(1);
  await page.getByRole("button", { name: "Refine image for panel 1", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Match the colours in the uploaded reference.");
  await dialog.getByRole("button", { name: "Generate alternative", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
  expect(requests[0].references).toEqual([]);
  expect(requests[1].refinement?.imageUrl).toBe(currentImage);
  expect(requests[1].references).toHaveLength(1);
  expect(requests[1].references?.[0].source).toBe("upload");
  await dialog.getByRole("button", { name: "Keep current", exact: true }).click();
  await page.getByRole("button", { name: "Regenerate image for panel 1", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
  expect(requests[2].references).toEqual(requests[1].references);
  await dialog.getByRole("button", { name: "Keep current", exact: true }).click();
  await page.getByTestId("analyze-references").click();
  await expect(page.getByLabel("Combined visual direction")).not.toHaveValue("");
  const storyboardRequest = page.waitForRequest("**/api/generate-storyboard");
  await page.getByTestId("generate-button").click();
  expect((await storyboardRequest).postDataJSON().visualReferenceSummary).toContain("guidance");
});
