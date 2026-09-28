import { expect, test } from "@playwright/test";

const debug = process.env.WORKFLOW_DEBUG === "true";

test("diagnostics are hidden and absent from API responses when disabled", async ({ page, request }) => {
  test.skip(debug, "Checks the default flag-off configuration.");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Workflow diagnostics", exact: true })).toHaveCount(0);
  const response = await request.post("/api/generate-scene-idea", { data: {} });
  expect(await response.json()).not.toHaveProperty("diagnostics");
});

test("captures workflow steps and exports copyable Markdown and JSON", async ({ page }) => {
  test.skip(!debug, "Run with WORKFLOW_DEBUG=true to exercise report capture.");
  await page.goto("/");
  const toggle = page.locator("footer").getByRole("button", { name: "Workflow diagnostics", exact: true });
  await expect(toggle).toHaveAttribute("title", "Workflow diagnostics (0 records)");
  await page.getByRole("button", { name: "Generate scene idea", exact: true }).click();
  await expect(toggle).toHaveAttribute("title", "Workflow diagnostics (1 records)");
  await page.getByTestId("generate-button").click();
  await expect(page.getByTestId("generation-status")).toContainText("Storyboard generated successfully", { timeout: 15000 });
  await expect(toggle).toHaveAttribute("title", "Workflow diagnostics (2 records)");
  await page.getByRole("button", { name: "Generate image for panel 1", exact: true }).click();
  await expect(page.getByTestId("generation-status")).toContainText("Image for panel 1 generated successfully.");
  await expect(toggle).toHaveAttribute("title", "Workflow diagnostics (3 records)");
  await toggle.click();
  const panel = page.getByRole("complementary", { name: "Workflow diagnostics" });
  await panel.getByText("2. scene generation · mock · success", { exact: true }).click();
  await expect(panel.getByText("Input and prompts", { exact: true }).nth(1)).toBeVisible();
  await panel.getByRole("button", { name: "Copy report Markdown", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Copied to clipboard.");
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  expect(markdown).toContain("# Workflow model diagnostics");
  expect(markdown).toContain("## 2. scene_generation");
  expect(markdown).toContain('"storyboard":');
  const downloading = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download JSON", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^workflow-diagnostics-.*\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.records).toHaveLength(3);
  expect(exported.records[2]).toMatchObject({ operation: "image_generation", provider: "mock", input: { prompt: expect.any(String) } });
  await panel.getByText("3. image generation · mock · success", { exact: true }).click();
  await panel.getByRole("button", { name: "Copy prompt 1", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exported.records[2].input.prompt);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: () => Promise.reject(new Error("Clipboard denied")) },
  }));
  await panel.getByRole("button", { name: "Copy all JSON", exact: true }).click();
  await expect(panel.getByLabel("Diagnostics to copy")).toHaveValue(JSON.stringify(exported.records, null, 2));
  await panel.getByRole("button", { name: "Clear diagnostics", exact: true }).click();
  await expect(toggle).toHaveAttribute("title", "Workflow diagnostics (0 records)");
  await expect(panel.getByRole("button", { name: "Download JSON", exact: true })).toBeDisabled();
});
