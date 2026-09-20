import { expect, test } from "@playwright/test";

test("previews one shot, polls completion and offers the MP4", async ({ page }) => {
  await page.route("**/api/videos", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { local: true, replicate: true } });
    const body = route.request().postDataJSON();
    expect(body.provider).toBe("replicate");
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
  await expect(video).toBeVisible();
  await expect(video).toContainText("Panel images are not used as input");
  await video.getByRole("button", { name: "Preview first shot" }).click();
  await expect(video).toContainText("Storyboard video ready.");
  await expect(video.getByRole("link", { name: "Download storyboard MP4" })).toHaveAttribute("href", "/test-video.mp4?download=1");
  await expect(video.locator("video")).toHaveAttribute("src", "/test-video.mp4");
});

test("submits all shots locally and can cancel an active job", async ({ page }) => {
  let cancelled = false;
  await page.route("**/api/videos", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { local: true, replicate: false } });
    const body = route.request().postDataJSON();
    expect(body.provider).toBe("local");
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
  await expect(video.getByLabel("Video backend")).toHaveValue("local");
  await video.getByRole("button", { name: "Generate storyboard video" }).click();
  await expect(video.getByLabel("Video backend")).toBeDisabled();
  await video.getByRole("button", { name: "Cancel video" }).click();
  await expect(video).toContainText("Video generation cancelled.");
  await expect(video.getByRole("button", { name: "Generate storyboard video" })).toBeEnabled();
});
