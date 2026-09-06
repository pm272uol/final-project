import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createLLMProvider } from "@/lib/llm/create-provider";
import { getLLMConfig } from "@/lib/llm/config";
for (const provider of ["ollama", "vercel"] as const) {
  describe.skipIf(process.env.LLM_INTEGRATION !== provider)(
    `${provider} live structured generation`,
    () => {
      it(
        "returns validated JSON",
        async () => {
          const llm = createLLMProvider(
            getLLMConfig({ ...process.env, LLM_PROVIDER: provider }),
          );
          const result = await llm.generateStructured({
            operation: "evaluation",
            messages: [
              {
                role: "user",
                content: 'Return JSON containing {"status":"ok"}.',
              },
            ],
            schema: z.object({ status: z.literal("ok") }),
            temperature: 0,
          });
          expect(result.data.status).toBe("ok");
          expect(result.provider).toBe(provider);
        },
        Number(process.env.LLM_TIMEOUT_MS ?? 120000) + 5000,
      );
    },
  );
}
