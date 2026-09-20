import { expect, test, type Page } from "@playwright/test";

async function expand(page: Page, title: string) {
  const section = page.locator("details").filter({ has: page.locator(":scope > summary", { hasText: title }) }).first();
  if (await section.getAttribute("open") === null) await section.locator(":scope > summary").click();
}

test("generates a complete scene-aware storyboard package", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");

  await page
    .getByLabel("01 / Scene idea", { exact: true })
    .fill(
      "A night-shift projectionist finds a frame of tomorrow hidden in an old film reel.",
    );
  await page.getByLabel("Genre", { exact: true }).selectOption("Thriller");
  await page
    .getByLabel("Visual style", { exact: true })
    .selectOption("Noir");
  await page.getByLabel("Tone", { exact: true }).selectOption("Mysterious");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();

  await expect(page.getByTestId("generation-status")).toContainText(
    "Storyboard generated successfully with 4 panels using mock.",
    { timeout: 15_000 },
  );
  await expect(
    page.getByRole("heading", { name: "The Frame Of Tomorrow" }),
  ).toBeVisible();
  await expect(page.getByTestId("storyboard-panel")).toHaveCount(4);
  await expect(page.getByTestId("storyboard-output")).toContainText(
    "Night-Shift Projectionist",
  );
  await expect(page.getByTestId("storyboard-output")).not.toContainText(
    "Astronaut",
  );
  await expect(page.getByText("Generation details", { exact: true })).toHaveCount(0);
  await expand(page, "Technical details");
  await expect(
    page.getByRole("heading", { name: "Production ready" }),
  ).toBeVisible();

  await page.getByTestId("storyboard-panel").first().getByText("Image prompt", { exact: true }).click();
  await page
    .getByRole("button", { name: "Copy image prompt for panel 1" })
    .click();
  await expect(
    page.getByTestId("storyboard-output").getByRole("status"),
  ).toContainText("Image prompt for panel 1 copied.");

  await page
    .getByRole("button", { name: "Generate image for panel 1", exact: true })
    .click();
  await expect(
    page.getByTestId("generation-status"),
  ).toContainText("Image for panel 1 generated successfully.");
  await expect(
    page.getByTestId("panel-image-1").locator("img"),
  ).toHaveAttribute("src", /\/api\/mock-panel-image\?seed=/);
  await expect(page.getByTestId("panel-image-1")).toContainText(
    "1024 × 576",
  );

  await page.getByTestId("generate-all-images").click();
  await expect(
    page.getByTestId("storyboard-output").locator("img"),
  ).toHaveCount(4);

  await expand(page, "Technical details");
  await page.getByText("Raw JSON package").click();
  await expect(page.locator("details pre")).toContainText(
    '"title": "The Frame Of Tomorrow"',
  );
  await expect(page.locator("details pre")).toContainText(
    '"imageStatus": "complete"',
  );
});

test("isolates a failed panel image and allows retry", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/generate-panel-image", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Image generation failed. Please retry this panel.",
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await page.getByTestId("generate-button").click();
  await expect(page.getByTestId("storyboard-panel")).toHaveCount(6);

  await page
    .getByRole("button", { name: "Generate image for panel 1", exact: true })
    .click();
  await expect(page.getByTestId("panel-image-1")).toContainText(
    "Image generation failed. Please retry this panel.",
  );
  await expect(
    page.getByRole("button", { name: "Regenerate image for panel 2" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate image for panel 2" }),
  ).toBeEnabled();

  await page.getByRole("button", { name: "Retry image for panel 1", exact: true }).click();
  await expect(
    page.getByTestId("panel-image-1").locator("img"),
  ).toBeVisible();
});

test("shows generated schema validation failures clearly", async ({ page }) => {
  await page.route("**/api/generate-storyboard", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          "The generated storyboard did not match the required output schema.",
        code: "STORYBOARD_SCHEMA_VALIDATION_FAILED",
        validationIssues: [
          "storyboard.0.imagePrompt: Image prompt is required.",
          "storyboard: Expected exactly 6 panels, received 5.",
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await page.getByTestId("generate-button").click();

  const error = page.getByTestId("generation-error");
  await expect(error).toContainText("did not match the required output schema");
  await expect(error).toContainText("storyboard.0.imagePrompt");
  await expect(error).toContainText("Expected exactly 6 panels");
  await expect(page.getByTestId("generation-status")).toContainText(
    "Generation failed.",
  );
});

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "wide", width: 1440, height: 900 },
]) {
  test(`does not overflow horizontally at the ${viewport.name} layout`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );

    expect(hasHorizontalOverflow).toBe(false);
    await expect(page.getByTestId("generate-button")).toBeVisible();
  });
}

test("preserves existing images when a replacement fails", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
  await page.getByTestId("generate-all-images").click();
  await expect(page.getByTestId("storyboard-output").locator("img")).toHaveCount(4);
  const original = await page.getByTestId("panel-image-3").locator("img").getAttribute("src");
  await page.route("**/api/generate-panel-image", route => route.fulfill({ status: 502, json: { error: "Replacement test failure" } }));
  await page.getByRole("button", { name: "Regenerate image for panel 3", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Regenerate image", exact: true });
  await expect(dialog.getByRole("alert")).toContainText("Replacement test failure");
  await expect(page.getByTestId("panel-image-3").getByRole("img", { name: /^Generated storyboard image/ })).toHaveAttribute("src", original!);
  await page.unroute("**/api/generate-panel-image");
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Keep current", exact: true }).click();
  await expect(page.getByTestId("panel-image-3").locator("img")).toHaveAttribute("src", original!);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("cancels the batch without discarding the reference or starting remaining shots", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
  const reference = await page.getByTestId("panel-image-1").locator("img").getAttribute("src");
  let requests = 0;
  await page.route("**/api/generate-panel-image", async route => { requests++; await new Promise(resolve => setTimeout(resolve, 800)); await route.fulfill({ status: 503, json: { error: "Delayed provider" } }).catch(() => {}); });
  await page.getByTestId("generate-all-images").click();
  await expect.poll(() => requests).toBe(1);
  await page.getByRole("button", { name: "Cancel image generation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export production PDF", exact: true })).toBeEnabled();
  await expect(page.getByTestId("panel-image-1").locator("img")).toHaveAttribute("src", reference!);
  expect(requests).toBe(1);
  await expand(page, "Technical details");
  await page.getByText("Raw JSON package", { exact: true }).click();
  const board = JSON.parse(await page.locator("pre code").innerText());
  expect(board.visualReferences[0].imageUrl).toBe(reference);
});

test("shows production notes and renders a whole board without extra options", async ({ page }) => {
  const requests: Array<{ references: Array<{ id: string; imageUrl: string }>; imageContext: { visualBible: { version: number; approvedVersion: number } } }> = [];
  await page.route("**/api/generate-panel-image", async route => {
    requests.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await expect(page.getByTestId("storyboard-panel")).toHaveCount(4);
  await expect(page.getByRole("region", { name: "Story and production notes" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Story and production notes" }).getByText("Production notes", { exact: true })).toBeVisible();
  await expect(page.getByText("Add visual references (optional)", { exact: true })).toBeVisible();
  for (const label of ["Edit storyboard", "Style and references", "Character and location continuity", "Preview sequence", "Compare versions", "Continuity issue checklist", "Generation estimates"]) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByLabel("palette", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Generation estimates" })).toHaveCount(0);
  await page.getByTestId("generate-all-images").click();
  await expect(page.getByTestId("generate-all-images")).toHaveText("Images ready");
  await expect(page.getByTestId("storyboard-output").locator("img")).toHaveCount(4);
  expect(requests).toHaveLength(4);
  expect(requests[0].references).toEqual([]);
  for (const request of requests.slice(1)) {
    expect(request.references).toHaveLength(1);
    expect(request.references[0].id).toBe(requests[1].references[0].id);
    expect(request.imageContext.visualBible.approvedVersion).toBe(request.imageContext.visualBible.version);
  }
  await expand(page, "Technical details");
  await page.getByText("Raw JSON package", { exact: true }).click();
  const board = JSON.parse(await page.locator("pre code").innerText());
  expect(board.visualReferences[0].id).toBe(requests[1].references[0].id);
  expect(board.visualReferences[0].imageUrl).toBe(board.storyboard[0].imageUrl);
});

test("uses the first successful image even out of order and resets it for a new storyboard", async ({ page }) => {
  const requests: Array<{ references: Array<{ id: string; imageUrl: string }> }> = [];
  await page.route("**/api/generate-panel-image", async route => {
    requests.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.goto("/");
  await page.getByLabel("01 / Scene idea", { exact: true }).fill("A tired astronaut discovers a tiny plant growing inside an abandoned space station.");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await page.getByRole("button", { name: "Generate image for panel 3", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate image for panel 3", exact: true })).toBeEnabled();
  const firstImage = await page.getByTestId("panel-image-3").locator("img").getAttribute("src");
  await page.getByRole("button", { name: "Regenerate image for panel 3", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Use this image", exact: true })).toBeEnabled();
  await page.getByRole("dialog").getByRole("button", { name: "Use this image", exact: true }).click();
  await page.getByTestId("generate-all-images").click();
  await expect(page.getByTestId("generate-all-images")).toHaveText("Images ready");
  expect(requests).toHaveLength(5);
  expect(requests[0].references).toEqual([]);
  for (const request of requests.slice(1)) {
    expect(request.references).toHaveLength(1);
    expect(request.references[0].imageUrl).toBe(firstImage);
    expect(request.references[0].id).toBe(requests[1].references[0].id);
  }
  await page.getByTestId("generate-button").click();
  await expect(page.getByRole("button", { name: "Generate image for panel 1", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate image for panel 1", exact: true })).toBeEnabled();
  expect(requests[5].references).toEqual([]);
});
