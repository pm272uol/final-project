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

  await page
    .getByRole("button", { name: "Generate image for panel 1" })
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

  await page
    .getByRole("button", { name: "Generate image for panel 1" })
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

  await page.getByRole("button", { name: "Retry image for panel 1" }).click();
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
