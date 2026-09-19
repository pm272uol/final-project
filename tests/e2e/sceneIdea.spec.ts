import { expect, test } from "@playwright/test";

test("generates an editable scene idea from an empty textbox without submitting the storyboard", async ({ page }) => {
  const sceneIdea = "A watchmaker finds a clock that counts down to a stranger's arrival.";
  let finish: () => void = () => {};
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/generate-scene-idea", async route => {
    expect(route.request().postData()).toBeNull();
    await pending;
    await route.fulfill({ json: { sceneIdea } });
  });
  let storyboardRequested = false;
  page.on("request", request => {
    if (request.url().includes("/api/generate-storyboard")) storyboardRequested = true;
  });
  await page.goto("/");
  const scene = page.getByLabel("01 / Scene idea", { exact: true });
  await scene.fill("");
  await page.getByLabel("Genre", { exact: true }).selectOption("Fantasy");
  await page.getByRole("button", { name: "Generate scene idea", exact: true }).click();
  await expect(page.getByRole("button", { name: "Generating idea…", exact: true })).toBeDisabled();
  await expect(page.getByTestId("generate-button")).toBeDisabled();
  finish();
  await expect(scene).toHaveValue(sceneIdea);
  await expect(page.getByTestId("generate-button")).toBeEnabled();
  await scene.fill(`${sceneIdea} It begins to ring.`);
  await expect(scene).toHaveValue(`${sceneIdea} It begins to ring.`);
  expect(storyboardRequested).toBe(false);
});

test("keeps the existing scene on failure and allows retry", async ({ page }) => {
  await page.route("**/api/generate-scene-idea", route => route.fulfill({ status: 502, json: { error: "The LLM is unavailable. Try again." } }));
  await page.goto("/");
  const scene = page.getByLabel("01 / Scene idea", { exact: true });
  await scene.fill("Keep my scene.");
  const button = page.getByRole("button", { name: "Generate scene idea", exact: true });
  await button.click();
  await expect(page.getByRole("alert").filter({ hasText: "The LLM is unavailable." })).toBeVisible();
  await expect(scene).toHaveValue("Keep my scene.");
  await expect(button).toBeEnabled();
});

test("does not overwrite edits made while an idea is being generated", async ({ page }) => {
  let finish: () => void = () => {};
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/generate-scene-idea", async route => {
    await pending;
    await route.fulfill({ json: { sceneIdea: "A stale suggestion." } });
  });
  await page.goto("/");
  const requested = page.waitForRequest("**/api/generate-scene-idea");
  await page.getByRole("button", { name: "Generate scene idea", exact: true }).click();
  await requested;
  const scene = page.getByLabel("01 / Scene idea", { exact: true });
  await scene.fill("My newer scene idea.");
  finish();
  await expect(page.getByRole("button", { name: "Generate scene idea", exact: true })).toBeEnabled();
  await expect(scene).toHaveValue("My newer scene idea.");
});
