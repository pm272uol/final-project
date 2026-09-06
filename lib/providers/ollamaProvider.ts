import {
  OllamaProvider,
  type OllamaProviderOptions,
} from "@/lib/llm/providers/ollama-provider";
import { LLMStoryboardProvider } from "./llmStoryboardProvider";
// Compatibility entry point for existing callers and integration tests.
export class OllamaStoryboardProvider extends LLMStoryboardProvider {
  constructor(options: OllamaProviderOptions) {
    super(new OllamaProvider(options));
  }
}
export { parseModelJson } from "@/lib/llm/provider";
