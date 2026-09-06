import { z } from "zod";
const schema = z
  .object({
    provider: z.enum(["ollama", "vercel"]).default("ollama"),
    model: z.string().trim().min(1),
    baseUrl: z.url(),
    apiKey: z.string().trim().optional(),
    timeoutMs: z.coerce.number().int().positive(),
    pricing: z
      .object({
        inputPerMillion: z.preprocess(
          (value) => (value === "" ? undefined : value),
          z.coerce.number().finite().nonnegative(),
        ),
        outputPerMillion: z.preprocess(
          (value) => (value === "" ? undefined : value),
          z.coerce.number().finite().nonnegative(),
        ),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.provider === "vercel" && !value.apiKey)
      ctx.addIssue({
        code: "custom",
        message: "AI_GATEWAY_API_KEY is required for vercel",
        path: ["apiKey"],
      });
    if (!/^https?:\/\//.test(value.baseUrl))
      ctx.addIssue({
        code: "custom",
        message: "LLM URL must use HTTP or HTTPS",
        path: ["baseUrl"],
      });
  });
export type LLMConfig = z.infer<typeof schema>;
export function getLLMConfig(
  env: Record<string, string | undefined> = process.env,
): LLMConfig {
  const provider =
    env.LLM_PROVIDER ??
    (env.STORYBOARD_PROVIDER === "vercel" ? "vercel" : "ollama");
  return schema.parse({
    provider,
    model:
      provider === "vercel"
        ? (env.AI_GATEWAY_MODEL ?? "google/gemma-4-26b-a4b-it")
        : (env.OLLAMA_MODEL ?? "gemma4:e4b"),
    baseUrl:
      provider === "vercel"
        ? (env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1")
        : (env.OLLAMA_BASE_URL ?? "http://localhost:11434"),
    apiKey: env.AI_GATEWAY_API_KEY,
    timeoutMs: env.LLM_TIMEOUT_MS ?? env.OLLAMA_TIMEOUT_MS ?? 120000,
    pricing:
      provider === "vercel" &&
      (env.AI_GATEWAY_INPUT_PER_MILLION || env.AI_GATEWAY_OUTPUT_PER_MILLION)
        ? {
            inputPerMillion: env.AI_GATEWAY_INPUT_PER_MILLION,
            outputPerMillion: env.AI_GATEWAY_OUTPUT_PER_MILLION,
          }
        : undefined,
  });
}
