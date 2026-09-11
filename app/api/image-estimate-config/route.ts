import { getAppConfig } from "@/lib/config";
import { estimateConfig } from "@/lib/generationEstimates";
import { MockImageGenerationService } from "@/lib/image-generation/mockImageGeneration.service";

export async function GET() {
  try {
    const config = getAppConfig();
    const result = estimateConfig(config.imageProvider, config.imageProvider === "mock" ? new MockImageGenerationService().model : config.replicateModel, process.env.IMAGE_ESTIMATE_USD_PER_IMAGE, process.env.IMAGE_ESTIMATE_PRICE_BASIS);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Image estimate configuration is unavailable." }, { status: 503 }); }
}
