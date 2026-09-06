import type { z } from "zod";
export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
};
export type LLMProgress =
  { type: "output"; text: string } | { type: "status"; message: string };
export type LLMRequest = {
  operation: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  signal?: AbortSignal;
  onProgress?: (event: LLMProgress) => void;
};
export type StructuredLLMRequest<T> = LLMRequest & {
  schema: z.ZodType<T>;
  validate?: (data: T) => void;
};
export type LLMResponse = {
  text: string;
  provider: "ollama" | "vercel";
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  metrics: {
    durationMs: number;
    inferenceDurationMs?: number;
    timeToFirstTokenMs?: number;
    tokensPerSecond?: number;
    estimatedCostUsd?: number;
  };
};
export type StructuredLLMResponse<T> = LLMResponse & { data: T };
export interface LLMProvider {
  readonly providerName: "ollama" | "vercel";
  readonly modelName: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
  generateStructured<T>(
    request: StructuredLLMRequest<T>,
  ): Promise<StructuredLLMResponse<T>>;
}
export type LLMRunMetrics = {
  timestamp: string;
  operation: string;
  provider: string;
  model: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  timeToFirstTokenMs?: number;
  tokensPerSecond?: number;
  success: boolean;
  error?: string;
};
