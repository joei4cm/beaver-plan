import type {
  AsrRequest,
  AsrResult,
  TtsRequest,
  TtsResult,
  TranslationRequest,
  TranslationResult,
  VisionAssistRequest,
  VisionAssistResult,
} from "./types.js";

/** Text translation — OpenAI-compatible LLM or demo. */
export interface TranslationProvider {
  readonly id: string;
  translate(req: TranslationRequest): Promise<TranslationResult>;
}

/** Speech → text. */
export interface AsrProvider {
  readonly id: string;
  transcribe(req: AsrRequest): Promise<AsrResult>;
}

/** Text → speech. */
export interface TtsProvider {
  readonly id: string;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

/** Optional camera OCR / scene caption. */
export interface VisionAssistProvider {
  readonly id: string;
  assist(req: VisionAssistRequest): Promise<VisionAssistResult>;
}

/** Full live-assist stack used by the BFF. */
export type TranslationStack = {
  translate: TranslationProvider;
  asr: AsrProvider;
  tts: TtsProvider;
  vision: VisionAssistProvider;
  mode: "live" | "demo";
};
