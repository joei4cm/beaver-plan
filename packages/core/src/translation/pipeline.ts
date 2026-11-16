import { pickDemoTurn } from "./demo-script.js";
import type { TranslationStack } from "./ports.js";
import type {
  LanguagePair,
  LiveTurnRequest,
  LiveTurnResult,
  TtsResult,
} from "./types.js";

/**
 * One conversation turn: optional ASR → translate → optional TTS.
 * Chunked / near-real-time friendly — callers drive the mic loop.
 */
export async function runLiveTurn(
  stack: TranslationStack,
  req: LiveTurnRequest,
): Promise<LiveTurnResult> {
  const pair = req.pair;
  let sourceText = (req.text ?? "").trim();
  let asrProvider = "text";

  if (!sourceText && req.audio && req.audio.byteLength > 0) {
    if (stack.asr.id === "demo-asr") {
      const turn = pickDemoTurn(pair, req.demoTurnIndex ?? 0);
      sourceText = turn.sourceText;
      asrProvider = stack.asr.id;
    } else {
      const asr = await stack.asr.transcribe({
        audio: req.audio,
        mimeType: req.audioMimeType ?? "audio/webm",
        locale: pair.sourceLocale,
      });
      sourceText = asr.text;
      asrProvider = asr.provider;
    }
  }

  if (!sourceText && stack.mode === "demo") {
    const turn = pickDemoTurn(pair, req.demoTurnIndex ?? 0);
    sourceText = turn.sourceText;
    asrProvider = "demo-asr";
  }

  if (!sourceText) {
    return {
      sourceText: "",
      translatedText: "",
      pair,
      asrProvider,
      translateProvider: stack.translate.id,
      mode: stack.mode,
    };
  }

  let translatedText: string;
  let translateProvider = stack.translate.id;

  if (stack.translate.id === "demo-llm") {
    const turn = pickDemoTurn(pair, req.demoTurnIndex ?? 0);
    // Prefer scripted pair when source matches; else naive tag translate
    translatedText =
      turn.sourceText === sourceText
        ? turn.translatedText
        : (
            await stack.translate.translate({
              text: sourceText,
              sourceLocale: pair.sourceLocale,
              targetLocale: pair.targetLocale,
              mode: "live",
            })
          ).text;
  } else {
    const out = await stack.translate.translate({
      text: sourceText,
      sourceLocale: pair.sourceLocale,
      targetLocale: pair.targetLocale,
      mode: "live",
    });
    translatedText = out.text;
    translateProvider = out.provider;
  }

  let tts: TtsResult | undefined;
  if (req.withTts !== false && translatedText) {
    tts = await stack.tts.synthesize({
      text: translatedText,
      locale: pair.targetLocale,
    });
  }

  return {
    sourceText,
    translatedText,
    pair,
    asrProvider,
    translateProvider,
    tts,
    mode: stack.mode,
  };
}

export function encodeAudioBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === "function") return btoa(binary);
  const BufferCtor = (
    globalThis as {
      Buffer?: {
        from: (d: Uint8Array) => { toString: (e: string) => string };
      };
    }
  ).Buffer;
  if (BufferCtor) return BufferCtor.from(bytes).toString("base64");
  throw new Error("base64_unavailable");
}

export function decodeAudioBase64(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  const BufferCtor = (
    globalThis as {
      Buffer?: {
        from: (d: string, e: string) => Uint8Array;
      };
    }
  ).Buffer;
  if (BufferCtor) return new Uint8Array(BufferCtor.from(b64, "base64"));
  throw new Error("base64_unavailable");
}

export type { LanguagePair };
