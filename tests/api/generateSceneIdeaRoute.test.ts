import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate-scene-idea/route";

describe("POST /api/generate-scene-idea", () => {
  beforeEach(() => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_MODEL", "test-model");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("generates a simple starter idea without requiring a brief or scene settings", async () => {
    const sceneIdea = "A lighthouse keeper sees a second beam shining up from beneath the sea.";
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      model: "test-model", done: true, message: { content: JSON.stringify({ sceneIdea }) },
    }));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(ideaRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sceneIdea });
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(sent.prompt).toContain("one simple, original scene idea");
    expect(sent.prompt).toContain("Choose any subject and setting");
    expect(sent.format.properties.sceneIdea.maxLength).toBe(1200);
  });

  it.each(["", "x".repeat(1201)])("rejects unusable model output", async sceneIdea => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      model: "test-model", done: true, message: { content: JSON.stringify({ sceneIdea }) },
    })));
    const response = await POST(ideaRequest());
    expect(response.status).toBe(502);
    expect(await response.json()).toHaveProperty("error");
  });

  it("reports provider failures without silently returning a mock idea", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const response = await POST(ideaRequest());
    expect(response.status).toBe(502);
    expect(await response.json()).toHaveProperty("error");
  });

});

function ideaRequest() {
  return new Request("http://localhost/api/generate-scene-idea", {
    method: "POST",
  });
}
