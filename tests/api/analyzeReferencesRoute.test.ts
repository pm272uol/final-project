import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyze-references/route";

describe("POST /api/analyze-references", () => {
  beforeEach(() => {
    vi.stubEnv("STORYBOARD_PROVIDER", "mock");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns one combined local summary for valid references", async () => {
    const formData = new FormData();
    formData.append(
      "images",
      new File([new Uint8Array([1, 2, 3])], "private-name.png", {
        type: "image/png",
      }),
    );
    formData.append("purposes", "Mood");
    formData.append("instructions", "Favor the lighting.");

    const response = await POST(
      new Request("http://localhost/api/analyze-references", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toContain("mood guidance");
    expect(body.summary).toContain("Favor the lighting.");
    expect(body.summary).not.toContain("private-name.png");
  });

  it("rejects unsupported image types", async () => {
    const formData = new FormData();
    formData.append(
      "images",
      new File(["not an image"], "reference.gif", { type: "image/gif" }),
    );
    formData.append("purposes", "Mood");

    const response = await POST(
      new Request("http://localhost/api/analyze-references", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.code).toBe("INVALID_REFERENCE_TYPE");
  });

  it("requires at least one reference", async () => {
    const response = await POST(
      new Request("http://localhost/api/analyze-references", {
        method: "POST",
        body: new FormData(),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_REFERENCE_COUNT");
  });
});
