export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const AUDIO_ACCEPT = ".wav,.mp3,.m4a,.ogg,.flac,.webm,.mp4";
export type TranscriptionProvider = "local" | "groq";
export type TranscriptionResult = {
  text: string;
  provider: TranscriptionProvider;
  model: string;
  language: "en";
  durationMs: number;
};
