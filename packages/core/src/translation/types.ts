/** Live translation domain types (Slice E). */

export type TranslationMode = "live" | "batch";

export type TranslationChannel = "mic" | "camera" | "text";

export type TranslationLocale =
  | "zh-CN"
  | "en"
  | "ja"
  | "ko"
  | "fr"
  | "es"
  | "de"
  | "th"
  | "vi";

export const TRANSLATION_LOCALES: readonly TranslationLocale[] = [
  "zh-CN",
  "en",
  "ja",
  "ko",
  "fr",
  "es",
  "de",
  "th",
  "vi",
] as const;

export type LanguagePair = {
  sourceLocale: TranslationLocale;
  targetLocale: TranslationLocale;
};

export type TranslationRequest = {
  text: string;
  sourceLocale: string;
  targetLocale: string;
  mode: TranslationMode;
};

export type TranslationResult = {
  text: string;
  provider: string;
};

export type AsrRequest = {
  /** Raw audio bytes (PCM/WAV/webm/mp3/m4a). */
  audio: Uint8Array;
  mimeType: string;
  locale?: string;
};

export type AsrResult = {
  text: string;
  provider: string;
  confidence?: number;
};

export type TtsRequest = {
  text: string;
  locale: string;
  /** Optional voice id when the provider supports it. */
  voice?: string;
};

export type TtsResult = {
  /** Empty when the client should speak locally (demo / Edge fallback). */
  audio: Uint8Array | null;
  mimeType: string;
  provider: string;
  /** Hint for clients: use device SpeechSynthesis / expo-speech. */
  speakLocally: boolean;
};

export type VisionAssistMode = "ocr" | "caption";

export type VisionAssistRequest = {
  image: Uint8Array;
  mimeType: string;
  mode: VisionAssistMode;
  sourceLocale?: string;
  targetLocale?: string;
};

export type VisionAssistResult = {
  /** Detected / described text in source (or scene language). */
  sourceText: string;
  /** Translated assist line when targetLocale provided. */
  translatedText?: string;
  provider: string;
};

export type LiveTurnRequest = {
  pair: LanguagePair;
  /** Prefer mic audio; fall back to typed text. */
  audio?: Uint8Array;
  audioMimeType?: string;
  text?: string;
  /** When true, also synthesize speech for the translation. */
  withTts?: boolean;
  /** Demo cue index for scripted bilingual turns. */
  demoTurnIndex?: number;
};

export type LiveTurnResult = {
  sourceText: string;
  translatedText: string;
  pair: LanguagePair;
  asrProvider: string;
  translateProvider: string;
  tts?: TtsResult;
  mode: "live" | "demo";
};

/** Conceptual session — clients own the UX state; BFF is stateless. */
export type TranslationSession = {
  id: string;
  mode: TranslationMode;
  pair: LanguagePair;
  channel: TranslationChannel;
  createdAt: string;
};

export function isTranslationLocale(value: string): value is TranslationLocale {
  return (TRANSLATION_LOCALES as readonly string[]).includes(value);
}

export function swapPair(pair: LanguagePair): LanguagePair {
  return { sourceLocale: pair.targetLocale, targetLocale: pair.sourceLocale };
}

export function normalizePair(
  source?: string | null,
  target?: string | null,
): LanguagePair {
  const sourceLocale: TranslationLocale = isTranslationLocale(source ?? "")
    ? (source as TranslationLocale)
    : "zh-CN";
  let targetLocale: TranslationLocale = isTranslationLocale(target ?? "")
    ? (target as TranslationLocale)
    : "en";
  if (targetLocale === sourceLocale) {
    targetLocale = sourceLocale === "zh-CN" ? "en" : "zh-CN";
  }
  return { sourceLocale, targetLocale };
}
