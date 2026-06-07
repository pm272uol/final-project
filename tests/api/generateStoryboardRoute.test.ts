import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/generate-storyboard/route";
import { createGenerateStoryboardResponse } from "@/lib/generateStoryboard";
import { createMockStoryboard } from "@/lib/mockStoryboard";
import { validInput } from "../fixtures";

describe("POST /api/generate-storyboard", () => {
  it("returns a scene-aware mock storyboard for valid input", async () => {
    const response = await POST(jsonRequest(validInput));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("mock");
    expect(body.storyboard.title).toBe("The Frame Of Tomorrow");
    expect(body.storyboard.storyboard).toHaveLength(validInput.panelCount);
  });

  it("returns a friendly validation error for invalid input", async () => {
    const response = await POST(jsonRequest({ ...validInput, panelCount: 5 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("valid creative constraints");
    expect(body.code).toBe("INVALID_STORYBOARD_INPUT");
    expect(body.validationIssues).toEqual(
      expect.arrayContaining([expect.stringContaining("panelCount")]),
    );
  });

  it("returns a friendly error when the request body is malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/generate-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"sceneIdea":',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("not valid JSON");
  });

  it("rejects generated output that fails the storyboard schema", async () => {
    const response = await createGenerateStoryboardResponse(
      validInput,
      (input) => {
        const storyboard = createMockStoryboard(input);
        storyboard.storyboard[0].imagePrompt = "";
        storyboard.storyboard.pop();
        return storyboard;
      },
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("STORYBOARD_SCHEMA_VALIDATION_FAILED");
    expect(body.error).toContain("required output schema");
    expect(body.validationIssues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("storyboard.0.imagePrompt"),
        expect.stringContaining("Expected exactly 4 panels"),
      ]),
    );
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/generate-storyboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
