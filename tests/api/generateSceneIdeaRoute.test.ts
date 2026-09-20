import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate-scene-idea/route";
import { sceneIdeaVariationSchema } from "@/lib/sceneIdea";

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
    const result = await response.json();
    expect(result.sceneIdea).toBe(sceneIdea);
    expect(sceneIdeaVariationSchema.safeParse(result.variation).success).toBe(true);
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(sent.messages[0].role).toBe("system");
    expect(sent.messages[0].content).toContain("one simple, original scene idea");
    expect(JSON.parse(sent.messages[1].content)).toEqual({ recentSuggestionsToAvoid: [] });
    expect(sent.format.properties.sceneIdea.maxLength).toBe(200);
  });

  it.each(["", "x".repeat(201)])("rejects unusable model output", async sceneIdea => {
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

  it("uses recent suggestions only as exclusion data and changes every creative axis", async () => {
    const previous = { sceneIdea: "A cook drops a cake.", variation: { cast: 0, setting: 0, action: 0, tone: 0 } };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ model: "test-model", done: true,
      message: { content: JSON.stringify({ sceneIdea: "Two children race a homemade boat through a flooded playground." }) } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await (await POST(ideaRequest({ recentSuggestions: [previous] }))).json();
    expect(Object.values(result.variation).every(value => value !== 0)).toBe(true);
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(JSON.parse(sent.messages[1].content)).toEqual({ recentSuggestionsToAvoid: [previous.sceneIdea] });
    expect(sent.messages[0].content).not.toContain(previous.sceneIdea);
  });

  it.each([{ genre: "Noir" }, { recentSuggestions: Array(7).fill({ sceneIdea: "Old idea" }) },
    { recentSuggestions: [{ sceneIdea: "Old idea", variation: { cast: 999, setting: 0, action: 0, tone: 0 } }] },
  ])("rejects invalid context or scene settings before invoking the model", async body => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await POST(ideaRequest(body))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("also varies mock ideas instead of returning the same fixture on every click", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("STORYBOARD_PROVIDER", "mock");
    const first = await (await POST(ideaRequest())).json();
    const second = await (await POST(ideaRequest({ recentSuggestions: [{ sceneIdea: first.sceneIdea, variation: first.variation }] }))).json();
    expect(second.sceneIdea).not.toBe(first.sceneIdea);
  });

});

function ideaRequest(body?: unknown) {
  return new Request("http://localhost/api/generate-scene-idea", {
    method: "POST",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
}
