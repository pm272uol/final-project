import { z } from "zod";

const providerSchema = z.enum(["ollama", "mock"]);
const booleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const configSchema = z.object({
  provider: providerSchema.default("ollama"),
  ollamaBaseUrl: z
    .string()
    .url()
    .default("http://127.0.0.1:11434"),
  ollamaModel: z.string().trim().min(1).default("gemma4:latest"),
  ollamaTimeoutMs: z.coerce.number().int().positive().default(180_000),
  mockFallback: booleanSchema.default(true),
  maxRequestBytes: z.coerce.number().int().positive().default(16_384),
});

export type AppConfig = z.infer<typeof configSchema>;

export function getAppConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return configSchema.parse({
    provider: environment.STORYBOARD_PROVIDER,
    ollamaBaseUrl: environment.OLLAMA_BASE_URL,
    ollamaModel: environment.OLLAMA_MODEL,
    ollamaTimeoutMs: environment.OLLAMA_TIMEOUT_MS,
    mockFallback: environment.STORYBOARD_MOCK_FALLBACK,
    maxRequestBytes: environment.STORYBOARD_MAX_REQUEST_BYTES,
  });
}
