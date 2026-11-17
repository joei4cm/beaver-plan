import {
  DemoAsrProvider,
  DemoTranslationProvider,
  DemoTtsProvider,
  DemoVisionAssistProvider,
} from "./demo.js";
import { DeepgramAsrProvider } from "./deepgram.js";
import { EdgeTtsProvider } from "./edge-tts.js";
import {
  OpenAiTranslationProvider,
  OpenAiTtsProvider,
  OpenAiVisionAssistProvider,
  OpenAiWhisperAsrProvider,
  type OpenAiCompatConfig,
} from "./openai.js";
import type { TranslationStack } from "./ports.js";

export type TranslationKeyBag = {
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiChatModel?: string;
  openaiAsrModel?: string;
  openaiTtsModel?: string;
  openaiTtsVoice?: string;
  deepgramApiKey?: string;
  /** openai | deepgram | demo — default auto */
  asrProvider?: string;
  /** openai | demo — default auto */
  llmProvider?: string;
  /** openai | edge | demo — default auto */
  ttsProvider?: string;
  fetch?: typeof fetch;
};

function openaiCfg(keys: TranslationKeyBag): OpenAiCompatConfig | null {
  if (!keys.openaiApiKey) return null;
  return {
    apiKey: keys.openaiApiKey,
    baseUrl: keys.openaiBaseUrl,
    chatModel: keys.openaiChatModel,
    asrModel: keys.openaiAsrModel,
    ttsModel: keys.openaiTtsModel,
    ttsVoice: keys.openaiTtsVoice,
    fetch: keys.fetch,
  };
}

/**
 * Build ASR → LLM → TTS (+ vision) stack.
 * Missing keys → demo adapters so the product stays demoable.
 */
export function createTranslationStack(
  keys: TranslationKeyBag = {},
): TranslationStack {
  const openai = openaiCfg(keys);
  const asrPref = (keys.asrProvider ?? "auto").toLowerCase();
  const llmPref = (keys.llmProvider ?? "auto").toLowerCase();
  const ttsPref = (keys.ttsProvider ?? "auto").toLowerCase();

  let livePieces = 0;

  // LLM
  let translate;
  if (llmPref === "demo" || !openai) {
    translate = new DemoTranslationProvider();
  } else {
    translate = new OpenAiTranslationProvider(openai);
    livePieces += 1;
  }

  // ASR
  let asr;
  if (asrPref === "demo") {
    asr = new DemoAsrProvider();
  } else if (
    (asrPref === "deepgram" || (asrPref === "auto" && keys.deepgramApiKey)) &&
    keys.deepgramApiKey
  ) {
    asr = new DeepgramAsrProvider({
      apiKey: keys.deepgramApiKey,
      fetch: keys.fetch,
    });
    livePieces += 1;
  } else if (openai && asrPref !== "deepgram") {
    asr = new OpenAiWhisperAsrProvider(openai);
    livePieces += 1;
  } else {
    asr = new DemoAsrProvider();
  }

  // TTS
  let tts;
  if (ttsPref === "demo") {
    tts = new DemoTtsProvider();
  } else if (ttsPref === "edge") {
    tts = new EdgeTtsProvider();
    // edge is usable without keys — count as configured assist, not demo-only
    livePieces += 1;
  } else if (openai && (ttsPref === "openai" || ttsPref === "auto")) {
    tts = new OpenAiTtsProvider(openai);
    livePieces += 1;
  } else if (ttsPref === "auto") {
    tts = new EdgeTtsProvider();
  } else {
    tts = new DemoTtsProvider();
  }

  // Vision — needs OpenAI-compatible vision chat
  let vision;
  if (openai && llmPref !== "demo") {
    vision = new OpenAiVisionAssistProvider(openai);
    livePieces += 1;
  } else {
    vision = new DemoVisionAssistProvider();
  }

  const mode: "live" | "demo" =
    livePieces > 0 && translate.id !== "demo-llm" ? "live" : "demo";

  // If only edge TTS is live but LLM is demo, still report demo for honesty
  const honestMode: "live" | "demo" =
    translate.id === "demo-llm" && asr.id.startsWith("demo") ? "demo" : mode;

  return {
    translate,
    asr,
    tts,
    vision,
    mode: honestMode,
  };
}

export type TranslationCapabilityReport = {
  mode: "live" | "demo";
  asr: string;
  llm: string;
  tts: string;
  vision: string;
  featureEnabled: boolean;
  /** Default lower-latency path: chunked partials + device interim. */
  streamingMode: "utterance" | "chunked" | "realtime";
  offlineAssist: "phrasebook";
};

export function reportTranslationCapabilities(
  stack: TranslationStack,
  featureEnabled = true,
): TranslationCapabilityReport {
  return {
    mode: stack.mode,
    asr: stack.asr.id,
    llm: stack.translate.id,
    tts: stack.tts.id,
    vision: stack.vision.id,
    featureEnabled,
    streamingMode: "chunked",
    offlineAssist: "phrasebook",
  };
}
