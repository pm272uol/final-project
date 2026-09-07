import { z } from "zod";
import { getLLMConfig, type LLMConfig } from "./llm/config";

const providerSchema = z.enum(["ollama", "vercel", "mock"]);
const imageProviderSchema = z.enum(["mock", "replicate"]);
const booleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const configSchema = z.object({
  provider: providerSchema.default("ollama"),
  ollamaBaseUrl: z.string().url().default("http://127.0.0.1:11434"),
  ollamaModel: z.string().trim().min(1).default("gemma4:e4b"),
  ollamaTimeoutMs: z.coerce.number().int().positive().default(300_000),
  mockFallback: booleanSchema.default(true),
  maxRequestBytes: z.coerce.number().int().positive().default(16_384),
  imageProvider: imageProviderSchema.default("mock"),
  replicateApiToken: z.string().trim().optional(),
  replicateModel: z.string().trim().min(1).default("black-forest-labs/flux-2-klein-4b"),
  imageGenerationTimeoutMs: z.coerce.number().int().positive().default(120_000),
  imageMaxRequestBytes: z.coerce.number().int().positive().default(32_000_000),
});

export type AppConfig = z.infer<typeof configSchema> & { llm?: LLMConfig };

export function getAppConfig(
  environment: Record<string, string | undefined> = process.env,
): AppConfig {
  const config = configSchema.parse({
    provider:
      environment.LLM_PROVIDER === "" &&
      environment.STORYBOARD_PROVIDER === "mock"
        ? "mock"
        : (environment.LLM_PROVIDER ?? environment.STORYBOARD_PROVIDER),
    ollamaBaseUrl: environment.OLLAMA_BASE_URL,
    ollamaModel: environment.OLLAMA_MODEL,
    ollamaTimeoutMs: environment.OLLAMA_TIMEOUT_MS,
    mockFallback: environment.LLM_PROVIDER
      ? "false"
      : environment.STORYBOARD_MOCK_FALLBACK,
    maxRequestBytes: environment.STORYBOARD_MAX_REQUEST_BYTES,
    imageProvider: environment.IMAGE_PROVIDER,
    replicateApiToken: environment.REPLICATE_API_TOKEN,
    replicateModel: environment.REPLICATE_MODEL,
    imageGenerationTimeoutMs: environment.IMAGE_GENERATION_TIMEOUT_MS,
    imageMaxRequestBytes: environment.IMAGE_MAX_REQUEST_BYTES,
  });
  return {
    ...config,
    llm: config.provider === "mock" ? undefined : getLLMConfig(environment),
  };
}
