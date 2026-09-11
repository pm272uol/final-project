import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/image-estimate-config/route";
afterEach(() => vi.unstubAllEnvs());
it("exposes only public estimate inputs and never provider credentials", async () => {
  vi.stubEnv("LLM_PROVIDER", ""); vi.stubEnv("STORYBOARD_PROVIDER", "mock"); vi.stubEnv("IMAGE_PROVIDER", "replicate");
  vi.stubEnv("REPLICATE_API_TOKEN", "private-test-token"); vi.stubEnv("REPLICATE_MODEL", "example/model");
  vi.stubEnv("IMAGE_ESTIMATE_USD_PER_IMAGE", "0.03"); vi.stubEnv("IMAGE_ESTIMATE_PRICE_BASIS", "Provider quote today");
  const response = await GET(), data = await response.json();
  expect(data).toEqual({ provider: "replicate", model: "example/model", usdPerImage: 0.03, priceBasis: "Provider quote today", batchIntervalMs: 12000 });
  expect(JSON.stringify(data)).not.toContain("private-test-token");
});
