import { expect, test, type Page } from "@playwright/test";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
async function renderImages(page: Page, firstOnly = false) {
  await page.route("**/api/generate-panel-image", async route => {
    const { panel, imageContext } = route.request().postDataJSON();
    await route.fulfill({ json: {
      panelNumber: panel.panelNumber, imagePrompt: panel.imagePrompt, negativePrompt: "",
      imageUrl: image, imageStatus: "complete", imageProvider: "replicate", imageModel: "fixture",
      imageBibleVersion: imageContext.visualBible.version, imageWidth: 1, imageHeight: 1,
      imageGeneratedAt: new Date().toISOString(), imageGenerationDurationMs: 1,
    } });
  });
  if (firstOnly) {
    await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
    await expect(page.getByTestId("panel-image-1").getByRole("img", { name: /^Generated storyboard image/ })).toBeVisible();
  } else {
    await page.getByTestId("generate-all-images").click();
    await expect(page.getByRole("button", { name: "Images ready", exact: true })).toBeVisible();
  }
}

test("previews one shot, polls completion and offers the MP4", async ({ page }) => {
  await page.route("**/api/videos", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { replicate: true } });
    const body = route.request().postDataJSON();
    expect(body.provider).toBeUndefined();
    expect(body.shots[0].image).toBe(image);
    expect(body.shots).toHaveLength(1);
    expect(body.shots[0].prompt).not.toContain("data:image");
    return route.fulfill({ status: 202, json: { id: "test-job", status: "queued", completedShots: 0, totalShots: 1, message: "Queued", clips: [] } });
  });
  await page.route("**/api/videos/test-job", route => route.fulfill({ json: {
    id: "test-job", status: "complete", completedShots: 1, totalShots: 1, message: "Storyboard video ready.", clips: [], videoUrl: "/test-video.mp4",
  } }));
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A cat watches the sunrise from a windowsill.");
  await page.getByTestId("generate-button").click();
  const video = page.getByRole("region", { name: "Experimental storyboard video" });
  await expect(video).toBeVisible({ timeout: 20_000 });
  await expect(video).toContainText("Wan 2.2 5B Fast");
  await expect(video.getByRole("button", { name: "Preview first shot" })).toBeDisabled();
  await renderImages(page, true);
  await expect(video.getByRole("button", { name: "Generate storyboard video" })).toBeDisabled();
  await expect(video.getByLabel("Video backend")).toHaveCount(0);
  await video.getByRole("button", { name: "Preview first shot" }).click();
  await expect(video).toContainText("Storyboard video ready.");
  await expect(video.getByRole("link", { name: "Download storyboard MP4" })).toHaveAttribute("href", "/test-video.mp4?download=1");
  await expect(video.locator("video")).toHaveAttribute("src", "/test-video.mp4");
});

test("submits all panel images at 720p and can cancel an active job", async ({ page }) => {
  let cancelled = false;
  await page.route("**/api/videos", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { replicate: true } });
    const body = route.request().postDataJSON();
    expect(body.provider).toBeUndefined();
    expect(body.quality).toBe("standard");
    expect(body.shots.every((shot: { image: string }) => shot.image === image)).toBe(true);
    expect(body.shots).toHaveLength(4);
    return route.fulfill({ status: 202, json: { id: "cancel-job", status: "running", completedShots: 0, totalShots: 4, message: "Generating…", clips: [] } });
  });
  await page.route("**/api/videos/cancel-job", route => {
    if (route.request().method() === "DELETE") cancelled = true;
    return route.fulfill({ json: { id: "cancel-job", status: cancelled ? "cancelled" : "running", completedShots: 0, totalShots: 4,
      message: cancelled ? "Video generation cancelled." : "Generating…", clips: [] } });
  });
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A cat watches the sunrise from a windowsill.");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  const video = page.getByRole("region", { name: "Experimental storyboard video" });
  await renderImages(page);
  await video.getByLabel("Video quality").selectOption("standard");
  await video.getByRole("button", { name: "Generate storyboard video" }).click();
  await expect(video.getByLabel("Video quality")).toBeDisabled();
  await video.getByRole("button", { name: "Cancel video" }).click();
  await expect(video).toContainText("Video generation cancelled.");
  await expect(video.getByRole("button", { name: "Generate storyboard video" })).toBeEnabled();
});
