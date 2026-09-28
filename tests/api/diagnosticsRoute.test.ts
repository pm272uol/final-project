import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as storyboard } from "@/app/api/generate-storyboard/route";
import { POST as idea } from "@/app/api/generate-scene-idea/route";
import { validInput } from "../fixtures";

beforeEach(() => {
  vi.stubEnv("WORKFLOW_DEBUG", "true");
  vi.stubEnv("LLM_PROVIDER", "");
  vi.stubEnv("STORYBOARD_PROVIDER", "mock");
});
afterEach(() => vi.unstubAllEnvs());

describe("diagnostic API transport", () => {
  it("attaches diagnostics to the completed streaming storyboard", async () => {
    const response = await storyboard(new Request("http://localhost/api/generate-storyboard", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify(validInput),
    }));
    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
    const complete = events.find(event => event.type === "complete");
    expect(complete.data.diagnostics).toEqual([expect.objectContaining({
      operation: "scene_generation", provider: "mock", status: "success", input: expect.objectContaining({ sceneIdea: validInput.sceneIdea }),
      output: expect.objectContaining({ storyboard: expect.any(Object) }),
    })]);
  });

  it("returns diagnostics for JSON routes only while enabled", async () => {
    const request = () => new Request("http://localhost/api/generate-scene-idea", { method: "POST", body: "{}" });
    const enabled = await (await idea(request())).json();
    expect(enabled.diagnostics[0]).toMatchObject({ operation: "scene_idea_generation", provider: "mock", output: enabled.sceneIdea });
    vi.stubEnv("WORKFLOW_DEBUG", "false");
    const disabled = await (await idea(request())).json();
    expect(disabled).not.toHaveProperty("diagnostics");
  });
});
