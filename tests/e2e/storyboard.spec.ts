import { expect, test } from "@playwright/test";

test("generates a complete scene-aware storyboard package", async ({ page }) => {
  await page.goto("/");

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
  await expect(page.getByTestId("storyboard-output")).toContainText(
    "deterministic-scene-aware-v1",
  );
  await expect(
    page.getByRole("heading", { name: "Production ready" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Copy image prompt for panel 1" })
    .click();
  await expect(
    page.getByTestId("storyboard-output").getByRole("status"),
  ).toContainText("Image prompt for panel 1 copied.");

  await page.getByRole("button", { name: "Approve visual direction" }).click();
  await page
    .getByRole("button", { name: "Generate reference frame", exact: true })
    .click();
  await expect(
    page.getByTestId("generation-status"),
  ).toContainText("Image for panel 1 generated successfully.");
  await expect(
    page.getByTestId("panel-image-1").locator("img"),
  ).toHaveAttribute("src", /\/api\/mock-panel-image\?seed=/);
  await expect(page.getByTestId("panel-image-1")).toContainText(
    "mock / deterministic-storyboard-placeholder-v1",
  );

  await page.getByRole("button", { name: "Approve this reference", exact: true }).click();
  await page.getByTestId("generate-all-images").click();
  await expect(
    page.getByTestId("storyboard-output").locator("img"),
  ).toHaveCount(4);

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
  await page.getByTestId("generate-button").click();
  await expect(page.getByTestId("storyboard-panel")).toHaveCount(6);

  await page.getByRole("button", { name: "Approve visual direction" }).click();
  await page
    .getByRole("button", { name: "Generate reference frame", exact: true })
    .click();
  await expect(page.getByTestId("panel-image-1")).toContainText(
    "Image generation failed. Please retry this panel.",
  );
  await expect(
    page.getByRole("button", { name: "Regenerate image for panel 2" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate image for panel 2" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Generate reference frame", exact: true }).click();
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
  await page.getByTestId("generate-button").click();

  const error = page.getByTestId("generation-error");
  await expect(error).toContainText("did not match the required output schema");
  await expect(error).toContainText("storyboard.0.imagePrompt");
  await expect(error).toContainText("Expected exactly 6 panels");
  await expect(page.getByTestId("generation-status")).toContainText(
    "Generation failed.",
  );
});

test("analyzes local visual references into an editable summary", async ({
  page,
}) => {
  await page.route("**/api/analyze-references", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary:
          "Low-key amber lighting, asymmetrical framing, and weathered industrial production design.",
      }),
    });
  });
  await page.goto("/");

  await page.locator("#reference-images").setInputFiles({
    name: "private-sketch.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgQIAKfNhWQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });

  await expect(page.getByTestId("reference-image")).toHaveCount(1);
  await expect(page.getByTestId("generate-button")).toBeDisabled();
  await page.getByTestId("analyze-references").click();

  const summary = page.getByLabel("Combined visual direction");
  await expect(summary).toHaveValue(
    "Low-key amber lighting, asymmetrical framing, and weathered industrial production design.",
  );
  await summary.fill(
    "Low-key blue lighting, asymmetrical framing, and weathered industrial production design.",
  );
  await expect(page.getByTestId("generate-button")).toBeEnabled();
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

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );

    expect(hasHorizontalOverflow).toBe(false);
    await expect(page.getByTestId("generate-button")).toBeVisible();
  });
}

test("requires bible approval and flags images after editing", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("generate-button").click();
  const generate = page.getByRole("button", { name: "Generate image for panel 1", exact: true });
  await expect(generate).toBeDisabled();
  await page.getByLabel("palette", { exact: true }).fill("Muted blues and amber highlights");
  await page.getByRole("button", { name: "Save visual bible" }).click();
  await expect(page.getByText("Version 2 · Awaiting approval")).toBeVisible();
  await page.getByRole("button", { name: "Approve visual direction" }).click();
  await page.getByRole("button", { name: "Generate reference frame", exact: true }).click();
  await page.getByRole("button", { name: "Approve this reference", exact: true }).click();
  await expect(page.getByTestId("panel-image-1").locator("img")).toBeVisible();
  const original = await page.getByTestId("panel-image-1").locator("img").getAttribute("src");
  await page.getByLabel("palette", { exact: true }).fill("Warm earth tones");
  await page.getByRole("button", { name: "Save visual bible" }).click();
  await expect(page.getByTestId("panel-image-1")).toContainText("Needs review · rendered with visual bible v2");
  await expect(page.getByTestId("panel-image-1").locator("img")).toHaveAttribute("src", original!);
  await expect(page.getByTestId("generate-all-images")).toBeDisabled();
  await page.getByRole("button", { name: "Approve visual direction" }).click();
  await page.getByRole("button", { name: "Regenerate image for panel 1" }).click();
  await expect(page.getByTestId("panel-image-1")).not.toContainText("Needs review");
});

test("preserves locks and failed replacements, restores alternatives and reopens durable projects", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await page.getByRole("button", { name: "Approve visual direction" }).click();
  await page.getByRole("button", { name: "Generate reference frame", exact: true }).click();
  await page.getByRole("button", { name: "Approve this reference", exact: true }).click();
  await page.getByTestId("generate-all-images").click();
  await expect(page.getByTestId("storyboard-output").locator("img")).toHaveCount(4);
  await page.getByText("Edit and review panel 2", { exact: true }).click();
  await page.getByLabel("Approve and lock panel 2", { exact: true }).check();
  const locked = await page.getByTestId("panel-image-2").locator("img").getAttribute("src");
  await page.getByTestId("generate-all-images").click();
  await expect(page.getByTestId("panel-image-2").locator("img")).toHaveAttribute("src", locked!);
  const original = await page.getByTestId("panel-image-3").locator("img").getAttribute("src");
  await page.route("**/api/generate-panel-image", route => route.fulfill({ status: 502, json: { error: "Replacement test failure" } }));
  await page.getByRole("button", { name: "Regenerate image for panel 3", exact: true }).click();
  await expect(page.getByTestId("panel-image-3")).toContainText("Replacement test failure");
  await expect(page.getByTestId("panel-image-3").locator("img")).toHaveAttribute("src", original!);
  await page.unroute("**/api/generate-panel-image");
  await page.getByRole("button", { name: "Retry image for panel 3", exact: true }).click();
  await expect(page.getByTestId("panel-image-3")).not.toContainText("Replacement test failure");
  await page.getByText("Edit and review panel 3", { exact: true }).click();
  await page.getByRole("button", { name: "Restore alternative 1", exact: true }).click();
  await expect(page.getByTestId("panel-image-3").locator("img")).toHaveAttribute("src", original!);
  await page.getByLabel("Action for panel 3", { exact: true }).fill("The astronaut lifts the tiny plant toward the window.");
  await page.getByRole("button", { name: "Save panel 3 edits", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("region", { name: "Project storage" }).getByRole("status")).toContainText("Saved");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export contact sheet", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("storyboard-contact-sheet.png");
  await page.reload();
  await page.getByRole("button", { name: "Browse saved projects", exact: true }).click();
  await page.getByRole("region", { name: "Project storage" }).getByRole("button", { name: /^Open / }).click();
  await expect(page.getByTestId("panel-image-2")).toContainText("Approved · locked");
  await expect(page.getByTestId("panel-image-3").locator("img")).toHaveAttribute("src", original!);
  await expect(page.getByRole("button", { name: "Active approved reference", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("cancels the batch without discarding the reference or starting remaining shots", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Panels", { exact: true }).selectOption("4");
  await page.getByTestId("generate-button").click();
  await page.getByRole("button", { name: "Approve visual direction" }).click();
  await page.getByRole("button", { name: "Generate reference frame", exact: true }).click();
  await page.getByRole("button", { name: "Approve this reference", exact: true }).click();
  const reference = await page.getByTestId("panel-image-1").locator("img").getAttribute("src");
  let requests = 0;
  await page.route("**/api/generate-panel-image", async route => { requests++; await new Promise(resolve => setTimeout(resolve, 800)); await route.fulfill({ status: 503, json: { error: "Delayed provider" } }).catch(() => {}); });
  await page.getByTestId("generate-all-images").click();
  await expect.poll(() => requests).toBe(1);
  await page.getByRole("button", { name: "Cancel image generation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeEnabled();
  await expect(page.getByTestId("panel-image-1").locator("img")).toHaveAttribute("src", reference!);
  expect(requests).toBe(1);
  await expect(page.getByRole("button", { name: "Active approved reference", exact: true })).toBeVisible();
});
