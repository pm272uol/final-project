import { diagnosticCall } from "./diagnostics/server";
import { createLLMProvider } from "./llm/create-provider";
import type { AppConfig } from "@/lib/config";
import { REFERENCE_PURPOSES } from "@/lib/referenceImageOptions";

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
    return diagnosticCall("image_analysis", "mock", "deterministic-visual-summary",
      { prompt: buildVisualSummaryPrompt(images, instructions), images: images.map(image => ({ purpose: image.purpose, bytes: image.bytes.length })) },
      () => createMockVisualSummary(images, instructions));
  }

  const llm = createLLMProvider(
    config.llm ?? {
      provider: config.provider,
      model: config.ollamaModel,
      baseUrl: config.ollamaBaseUrl,
      timeoutMs: config.ollamaTimeoutMs,
    },
    options.fetchImplementation,
  );
  const result = await llm.generate({
    operation: "image_analysis",
    signal: options.signal,
    temperature: 0.15,
    contextWindow: 4096,
    messages: [
      {
        role: "user",
        content: buildVisualSummaryPrompt(images, instructions),
        images: images.map((image) =>
          Buffer.from(image.bytes).toString("base64"),
        ),
      },
    ],
  });
  return result.text.slice(0, 2_000);
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
  const purposes = [
    ...new Set(images.map((image) => image.purpose.toLowerCase())),
  ];
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
