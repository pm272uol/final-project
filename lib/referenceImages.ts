import { z } from "zod";
import type { AppConfig } from "@/lib/config";
import { REFERENCE_PURPOSES } from "@/lib/referenceImageOptions";

const ollamaVisionResponseSchema = z.object({
  message: z.object({
    content: z.string().trim().min(1),
  }),
});

export type ReferenceImageInput = {
  bytes: Uint8Array;
  purpose: (typeof REFERENCE_PURPOSES)[number];
};

export async function analyzeReferenceImages(
  images: ReferenceImageInput[],
  instructions: string,
  config: AppConfig,
  options: {
    signal?: AbortSignal;
    fetchImplementation?: typeof fetch;
  } = {},
) {
  if (config.provider === "mock") {
    return createMockVisualSummary(images, instructions);
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(new Error("Vision analysis timed out.")),
    config.ollamaTimeoutMs,
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await (options.fetchImplementation ?? fetch)(
      `${config.ollamaBaseUrl.replace(/\/$/, "")}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaModel,
          messages: [
            {
              role: "user",
              content: buildVisualSummaryPrompt(images, instructions),
              images: images.map((image) =>
                Buffer.from(image.bytes).toString("base64"),
              ),
            },
          ],
          stream: false,
          options: {
            temperature: 0.15,
            num_ctx: 4096,
          },
        }),
        signal,
      },
    );

    if (!response.ok) {
      const detail = await readOllamaError(response);
      throw new Error(
        `Local visual analysis failed with status ${response.status}: ${detail}`,
      );
    }

    const result = ollamaVisionResponseSchema.safeParse(await response.json());
    if (!result.success) {
      throw new Error("Ollama returned an invalid visual analysis response.");
    }

    return result.data.message.content.slice(0, 2_000);
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        timeoutController.signal.aborted
          ? `Visual analysis did not finish within ${config.ollamaTimeoutMs}ms.`
          : "Visual analysis was cancelled.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildVisualSummaryPrompt(
  images: ReferenceImageInput[],
  instructions: string,
) {
  const purposes = images
    .map((image, index) => `Image ${index + 1}: ${image.purpose}`)
    .join("\n");

  return `Analyze these images together as visual development material for a short film.

Image purposes:
${purposes}

User guidance:
${instructions || "Use all images as general visual guidance."}

Write one concise combined visual direction of 80-160 words. Cover only useful,
observable choices: composition, lighting, color palette, character or wardrobe
language, location and production design, camera language, texture, and recurring
continuity details. Treat sketches as framing and blocking guidance rather than
finished artwork. Resolve conflicts into one coherent direction.

Do not mention images, uploads, filenames, numbering, labels, or source material.
Do not use headings, bullet points, markdown, or introductory language. Return only
the combined visual direction.`;
}

function createMockVisualSummary(
  images: ReferenceImageInput[],
  instructions: string,
) {
  const purposes = [...new Set(images.map((image) => image.purpose.toLowerCase()))];
  const guidance = instructions.trim()
    ? ` Follow this emphasis: ${instructions.trim()}`
    : "";

  return `Use a coherent cinematic direction drawn from the supplied ${purposes.join(
    ", ",
  )} guidance: deliberate composition, controlled contrast, a restrained color palette, tactile production design, consistent character silhouettes, and repeatable lighting cues. Keep camera choices purposeful, preserve spatial continuity, and translate sketch-like marks into practical blocking and framing rather than finished visual detail.${guidance}`.slice(
    0,
    2_000,
  );
}

async function readOllamaError(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: string | { message?: string };
    };
    if (typeof body.error === "string") return body.error;
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText || "Unknown Ollama error";
  }
}
