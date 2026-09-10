import type { TranscriptionProvider } from "./options";
import { TranscriptionError } from "./service";

export function getTranscriptionProvider(env: Record<string, string | undefined> = process.env): TranscriptionProvider {
  const provider = env.ASR_PROVIDER ?? "local";
  if (provider !== "local" && provider !== "groq") {
    throw new TranscriptionError("ASR_PROVIDER must be local or groq.", 503);
  }
  return provider;
}
