import type { TtsProvider } from "./ports.js";
import type { TtsRequest, TtsResult } from "./types.js";

/**
 * Edge / device TTS — no server audio bytes.
 * Clients should call SpeechSynthesis (web) or expo-speech (mobile).
 * Selected when TTS_PROVIDER=edge (or as a graceful fallback).
 */
export class EdgeTtsProvider implements TtsProvider {
  readonly id = "edge";

  async synthesize(_req: TtsRequest): Promise<TtsResult> {
    return {
      audio: null,
      mimeType: "audio/wav",
      provider: this.id,
      speakLocally: true,
    };
  }
}
