export type {
  AsrRequest,
  AsrResult,
  LanguagePair,
  LiveTurnRequest,
  LiveTurnResult,
  TranslationChannel,
  TranslationLocale,
  TranslationMode,
  TranslationRequest,
  TranslationResult,
  TranslationSession,
  TtsRequest,
  TtsResult,
  VisionAssistMode,
  VisionAssistRequest,
  VisionAssistResult,
} from "./types.js";
export {
  TRANSLATION_LOCALES,
  isTranslationLocale,
  normalizePair,
  swapPair,
} from "./types.js";

export type {
  AsrProvider,
  TtsProvider,
  TranslationProvider,
  TranslationStack,
  VisionAssistProvider,
} from "./ports.js";

export {
  DemoAsrProvider,
  DemoTranslationProvider,
  DemoTtsProvider,
  DemoVisionAssistProvider,
} from "./demo.js";
export {
  demoTurnsFor,
  demoTranslateText,
  demoVisionAssist,
  localeLabel,
  pickDemoTurn,
  type DemoTurn,
} from "./demo-script.js";

export {
  OpenAiTranslationProvider,
  OpenAiWhisperAsrProvider,
  OpenAiTtsProvider,
  OpenAiVisionAssistProvider,
  type OpenAiCompatConfig,
} from "./openai.js";
export { DeepgramAsrProvider, type DeepgramConfig } from "./deepgram.js";
export { EdgeTtsProvider } from "./edge-tts.js";

export {
  createTranslationStack,
  reportTranslationCapabilities,
  type TranslationKeyBag,
  type TranslationCapabilityReport,
} from "./factory.js";

export {
  runLiveTurn,
  encodeAudioBase64,
  decodeAudioBase64,
} from "./pipeline.js";
