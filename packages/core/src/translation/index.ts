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
  PRIMARY_TRANSLATION_LOCALES,
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
  runPartialAsr,
  encodeAudioBase64,
  decodeAudioBase64,
} from "./pipeline.js";

export {
  TRAVEL_PHRASEBOOK,
  PHRASE_CATEGORIES,
  listPhrasebook,
  findPhraseById,
  lookupPhrase,
  offlinePhraseTranslate,
  type PhraseCategory,
  type PhraseEntry,
  type PhrasebookLookup,
} from "./phrasebook.js";

export {
  DEFAULT_STREAMING_CHUNK_MS,
  getStreamingProviderSettings,
  deepgramLiveUrl,
  type StreamingAsrMode,
  type StreamingProviderSettings,
  type PartialTranscript,
  type PartialAsrRequest,
} from "./streaming.js";

export {
  enqueueTranslation,
  listQueuedTranslations,
  markQueuedFlushed,
  removeQueuedTranslation,
  pendingQueueCount,
  type QueuedTranslation,
  type OfflineQueueStore,
} from "./offline-queue.js";
