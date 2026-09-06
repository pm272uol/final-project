import { getLLMConfig, type LLMConfig } from "./config.ts";
import { OllamaProvider } from "./providers/ollama-provider.ts";
import { VercelAIGatewayProvider } from "./providers/vercel-ai-gateway-provider.ts";
export function createLLMProvider(
  config: LLMConfig = getLLMConfig(),
  fetchImplementation?: typeof fetch,
) {
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider({ ...config, fetchImplementation });
    case "vercel": {
      if (!config.apiKey)
        throw new Error("AI_GATEWAY_API_KEY is required for vercel");
      return new VercelAIGatewayProvider({
        ...config,
        apiKey: config.apiKey,
        fetchImplementation,
      });
    }
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
