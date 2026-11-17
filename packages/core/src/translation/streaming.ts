/**
 * Lower-latency ASR path settings and helpers.
 *
 * Chunked / partial transcripts: clients send audio timeslices or use
 * on-device interim speech recognition, then finalize via /turn.
 *
 * Full-duplex provider streams (OpenAI Realtime, Deepgram live WS) need
 * live keys and a long-lived connection — documented here so operators
 * can flip them on without inventing config names.
 */

export type StreamingAsrMode =
  /** Hold-to-talk, one utterance per /turn (default MVP). */
  | "utterance"
  /** MediaRecorder timeslices + interim partial ASR posts. */
  | "chunked"
  /** Provider WebSocket / Realtime session (keys required). */
  | "realtime";

export type StreamingProviderSettings = {
  mode: StreamingAsrMode;
  /** Suggested MediaRecorder timeslice (ms) for chunked mode. */
  chunkMs: number;
  /** Prefer browser / device interim SpeechRecognition when available. */
  preferDeviceInterim: boolean;
  deepgram: {
    /** Live streaming endpoint (WebSocket). */
    liveUrl: string;
    model: string;
    interimResults: boolean;
    endpointingMs: number;
    /** Query string for wss listen — operators paste into client/gateway. */
    listenQuery: string;
  };
  openaiRealtime: {
    /** OpenAI Realtime WebSocket (requires OPENAI_API_KEY). */
    url: string;
    /** Model hint for realtime transcription / conversation. */
    model: string;
    /** Input audio format expected by Realtime sessions. */
    inputAudioFormat: "pcm16";
    notes: string;
  };
};

export const DEFAULT_STREAMING_CHUNK_MS = 900;

/**
 * Documented provider settings for lower-latency ASR.
 * Safe to expose via GET /v1/translation/streaming — no secrets.
 */
export function getStreamingProviderSettings(
  overrides: Partial<{
    mode: StreamingAsrMode;
    chunkMs: number;
    deepgramModel: string;
    openaiRealtimeModel: string;
  }> = {},
): StreamingProviderSettings {
  const deepgramModel = overrides.deepgramModel ?? "nova-2";
  const chunkMs = overrides.chunkMs ?? DEFAULT_STREAMING_CHUNK_MS;
  const listenParams = new URLSearchParams({
    model: deepgramModel,
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
    endpointing: "300",
    smart_format: "true",
  });

  return {
    mode: overrides.mode ?? "chunked",
    chunkMs,
    preferDeviceInterim: true,
    deepgram: {
      liveUrl: "wss://api.deepgram.com/v1/listen",
      model: deepgramModel,
      interimResults: true,
      endpointingMs: 300,
      listenQuery: listenParams.toString(),
    },
    openaiRealtime: {
      url: "wss://api.openai.com/v1/realtime",
      model: overrides.openaiRealtimeModel ?? "gpt-4o-realtime-preview",
      inputAudioFormat: "pcm16",
      notes:
        "Mint an ephemeral client secret from the BFF before connecting. Whisper batch (/audio/transcriptions) stays for final utterance turns; Realtime is optional for duplex latency.",
    },
  };
}

export type PartialTranscript = {
  text: string;
  /** false while still listening / streaming. */
  isFinal: boolean;
  provider: string;
  confidence?: number;
};

export type PartialAsrRequest = {
  audio: Uint8Array;
  mimeType: string;
  locale?: string;
  /** Client session id so UI can coalesce partials. */
  sessionId?: string;
  /** Sequence within the hold-to-talk gesture. */
  sequence?: number;
};

/**
 * Build Deepgram live WebSocket URL (auth still via Authorization header / token).
 */
export function deepgramLiveUrl(
  locale?: string,
  model = "nova-2",
): string {
  const lang = locale
    ? locale.startsWith("zh")
      ? "zh"
      : (locale.split("-")[0] ?? "en")
    : "en";
  const url = new URL("wss://api.deepgram.com/v1/listen");
  url.searchParams.set("model", model);
  url.searchParams.set("language", lang);
  url.searchParams.set("interim_results", "true");
  url.searchParams.set("endpointing", "300");
  url.searchParams.set("smart_format", "true");
  return url.toString();
}
