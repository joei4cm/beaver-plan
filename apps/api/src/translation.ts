import { Hono } from "hono";
import {
  createTranslationStack,
  decodeAudioBase64,
  encodeAudioBase64,
  getStreamingProviderSettings,
  listPhrasebook,
  normalizePair,
  offlinePhraseTranslate,
  PRIMARY_TRANSLATION_LOCALES,
  reportTranslationCapabilities,
  runLiveTurn,
  runPartialAsr,
  TRANSLATION_LOCALES,
  type LanguagePair,
  type PhraseCategory,
} from "@beaver/core";
import type { Bindings } from "./env.js";

export const translationRoutes = new Hono<{ Bindings: Bindings }>();

function featureOn(env: Bindings): boolean {
  return (env.FEATURE_TRANSLATION ?? "true") !== "false";
}

function stackFrom(env: Bindings) {
  return createTranslationStack({
    openaiApiKey: env.OPENAI_API_KEY,
    openaiBaseUrl: env.OPENAI_BASE_URL,
    openaiChatModel: env.OPENAI_CHAT_MODEL,
    openaiAsrModel: env.OPENAI_ASR_MODEL,
    openaiTtsModel: env.OPENAI_TTS_MODEL,
    openaiTtsVoice: env.OPENAI_TTS_VOICE,
    deepgramApiKey: env.DEEPGRAM_API_KEY,
    asrProvider: env.ASR_PROVIDER,
    llmProvider: env.LLM_PROVIDER,
    ttsProvider: env.TTS_PROVIDER,
  });
}

function pairFromBody(body: {
  sourceLocale?: string;
  targetLocale?: string;
  pair?: { sourceLocale?: string; targetLocale?: string };
}): LanguagePair {
  return normalizePair(
    body.pair?.sourceLocale ?? body.sourceLocale,
    body.pair?.targetLocale ?? body.targetLocale,
  );
}

translationRoutes.get("/v1/translation/status", (c) => {
  const enabled = featureOn(c.env);
  const stack = stackFrom(c.env);
  return c.json({
    ...reportTranslationCapabilities(stack, enabled),
    locales: TRANSLATION_LOCALES,
    primaryLocales: PRIMARY_TRANSLATION_LOCALES,
    streaming: getStreamingProviderSettings(),
    keys: {
      openai: Boolean(c.env.OPENAI_API_KEY),
      deepgram: Boolean(c.env.DEEPGRAM_API_KEY),
    },
  });
});

translationRoutes.get("/v1/translation/locales", (c) => {
  return c.json({
    locales: TRANSLATION_LOCALES,
    primaryLocales: PRIMARY_TRANSLATION_LOCALES,
  });
});

/** Documented streaming / partial-ASR provider settings (no secrets). */
translationRoutes.get("/v1/translation/streaming", (c) => {
  return c.json({
    ...getStreamingProviderSettings(),
    keys: {
      openai: Boolean(c.env.OPENAI_API_KEY),
      deepgram: Boolean(c.env.DEEPGRAM_API_KEY),
    },
    notes: {
      chunked:
        "Clients use MediaRecorder timeslices + POST /v1/translation/partial for optimistic transcripts, then finalize with /turn.",
      deepgram:
        "Connect to deepgram.liveUrl?listenQuery with Authorization: Token <DEEPGRAM_API_KEY> for live interim results.",
      openaiRealtime:
        "Use OpenAI Realtime WS after minting an ephemeral secret server-side; Whisper remains the batch finalizer.",
    },
  });
});

/** Cached travel phrasebook — works without LLM keys (offline-friendly). */
translationRoutes.get("/v1/translation/phrasebook", (c) => {
  const sourceLocale = c.req.query("sourceLocale") ?? "zh-CN";
  const targetLocale = c.req.query("targetLocale") ?? "en";
  const category = c.req.query("category") as PhraseCategory | undefined;
  const phrases = listPhrasebook(sourceLocale, targetLocale, category);
  return c.json({
    pair: normalizePair(sourceLocale, targetLocale),
    count: phrases.length,
    phrases,
  });
});

/** Offline stub: phrasebook lookup without calling live LLM. */
translationRoutes.post("/v1/translation/offline-assist", async (c) => {
  const body = await c.req.json<{
    text?: string;
    sourceLocale?: string;
    targetLocale?: string;
  }>();
  const text = (body.text ?? "").trim();
  if (!text) return c.json({ error: "text_required" }, 400);
  const pair = pairFromBody(body);
  const hit = offlinePhraseTranslate(text, pair.sourceLocale, pair.targetLocale);
  if (!hit) {
    return c.json({
      hit: false,
      pair,
      sourceText: text,
      translatedText: null,
      queuedSuggested: true,
    });
  }
  return c.json({
    hit: true,
    pair: hit.pair,
    sourceText: hit.sourceText,
    translatedText: hit.translatedText,
    phraseId: hit.id,
    category: hit.category,
    queuedSuggested: false,
  });
});

/** Chunked / interim ASR for optimistic UI while the mic is held. */
translationRoutes.post("/v1/translation/partial", async (c) => {
  if (!featureOn(c.env)) return c.json({ error: "translation_disabled" }, 503);

  const body = await c.req.json<{
    audioBase64?: string;
    mimeType?: string;
    locale?: string;
    targetLocale?: string;
    sessionId?: string;
    sequence?: number;
    demoTurnIndex?: number;
  }>();

  const stack = stackFrom(c.env);
  const audio = body.audioBase64
    ? decodeAudioBase64(body.audioBase64)
    : new Uint8Array();

  try {
    const partial = await runPartialAsr(stack, {
      audio,
      mimeType: body.mimeType ?? "audio/webm",
      locale: body.locale,
      targetLocale: body.targetLocale,
      sessionId: body.sessionId,
      sequence: body.sequence,
      demoTurnIndex: body.demoTurnIndex,
    });
    return c.json({
      ...partial,
      mode: stack.mode,
      sessionId: body.sessionId ?? null,
      sequence: body.sequence ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "partial_asr_failed";
    return c.json({ error: message, mode: stack.mode }, 502);
  }
});

/** Plain text translate. */
translationRoutes.post("/v1/translation/translate", async (c) => {
  if (!featureOn(c.env)) return c.json({ error: "translation_disabled" }, 503);

  const body = await c.req.json<{
    text?: string;
    sourceLocale?: string;
    targetLocale?: string;
    mode?: "live" | "batch";
  }>();

  const text = (body.text ?? "").trim();
  if (!text) return c.json({ error: "text_required" }, 400);

  const pair = pairFromBody(body);
  const stack = stackFrom(c.env);

  try {
    const result = await stack.translate.translate({
      text,
      sourceLocale: pair.sourceLocale,
      targetLocale: pair.targetLocale,
      mode: body.mode ?? "live",
    });
    return c.json({
      text: result.text,
      provider: result.provider,
      pair,
      mode: stack.mode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "translate_failed";
    return c.json({ error: message, mode: stack.mode }, 502);
  }
});

/** ASR only. */
translationRoutes.post("/v1/translation/asr", async (c) => {
  if (!featureOn(c.env)) return c.json({ error: "translation_disabled" }, 503);

  const body = await c.req.json<{
    audioBase64?: string;
    mimeType?: string;
    locale?: string;
    demoTurnIndex?: number;
  }>();

  const stack = stackFrom(c.env);

  if (!body.audioBase64 && stack.mode === "demo") {
    const pair = normalizePair(body.locale, "en");
    const turn = await runLiveTurn(stack, {
      pair,
      demoTurnIndex: body.demoTurnIndex ?? 0,
      withTts: false,
    });
    return c.json({
      text: turn.sourceText,
      provider: turn.asrProvider,
      mode: stack.mode,
    });
  }

  if (!body.audioBase64) return c.json({ error: "audio_required" }, 400);

  try {
    const audio = decodeAudioBase64(body.audioBase64);
    if (stack.asr.id === "demo-asr") {
      const pair = normalizePair(body.locale, "en");
      const turn = await runLiveTurn(stack, {
        pair,
        demoTurnIndex: body.demoTurnIndex ?? 0,
        withTts: false,
      });
      return c.json({
        text: turn.sourceText,
        provider: "demo-asr",
        mode: "demo",
      });
    }
    const result = await stack.asr.transcribe({
      audio,
      mimeType: body.mimeType ?? "audio/webm",
      locale: body.locale,
    });
    return c.json({ ...result, mode: stack.mode });
  } catch (err) {
    const message = err instanceof Error ? err.message : "asr_failed";
    return c.json({ error: message, mode: stack.mode }, 502);
  }
});

/** TTS only. */
translationRoutes.post("/v1/translation/tts", async (c) => {
  if (!featureOn(c.env)) return c.json({ error: "translation_disabled" }, 503);

  const body = await c.req.json<{
    text?: string;
    locale?: string;
    voice?: string;
  }>();

  const text = (body.text ?? "").trim();
  if (!text) return c.json({ error: "text_required" }, 400);

  const stack = stackFrom(c.env);
  try {
    const result = await stack.tts.synthesize({
      text,
      locale: body.locale ?? "en",
      voice: body.voice,
    });
    return c.json({
      audioBase64: result.audio ? encodeAudioBase64(result.audio) : null,
      mimeType: result.mimeType,
      provider: result.provider,
      speakLocally: result.speakLocally,
      mode: stack.mode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "tts_failed";
    return c.json({ error: message, mode: stack.mode }, 502);
  }
});

/**
 * Full conversation turn — mic audio and/or typed text → translate → TTS.
 * Chunked near-real-time: clients call this per utterance.
 */
translationRoutes.post("/v1/translation/turn", async (c) => {
  if (!featureOn(c.env)) return c.json({ error: "translation_disabled" }, 503);

  const body = await c.req.json<{
    text?: string;
    audioBase64?: string;
    mimeType?: string;
    sourceLocale?: string;
    targetLocale?: string;
    withTts?: boolean;
    demoTurnIndex?: number;
    pair?: { sourceLocale?: string; targetLocale?: string };
  }>();

  const pair = pairFromBody(body);
  const stack = stackFrom(c.env);

  try {
    const audio = body.audioBase64
      ? decodeAudioBase64(body.audioBase64)
      : undefined;

    const result = await runLiveTurn(stack, {
      pair,
      text: body.text,
      audio,
      audioMimeType: body.mimeType,
      withTts: body.withTts !== false,
      demoTurnIndex: body.demoTurnIndex,
    });

    return c.json({
      sourceText: result.sourceText,
      translatedText: result.translatedText,
      pair: result.pair,
      asrProvider: result.asrProvider,
      translateProvider: result.translateProvider,
      mode: result.mode,
      tts: result.tts
        ? {
            audioBase64: result.tts.audio
              ? encodeAudioBase64(result.tts.audio)
              : null,
            mimeType: result.tts.mimeType,
            provider: result.tts.provider,
            speakLocally: result.tts.speakLocally,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "turn_failed";
    return c.json({ error: message, mode: stack.mode }, 502);
  }
});

/** Camera OCR / scene caption assist. */
translationRoutes.post("/v1/translation/vision", async (c) => {
  if (!featureOn(c.env)) return c.json({ error: "translation_disabled" }, 503);

  const body = await c.req.json<{
    imageBase64?: string;
    mimeType?: string;
    mode?: "ocr" | "caption";
    sourceLocale?: string;
    targetLocale?: string;
  }>();

  const stack = stackFrom(c.env);
  const pair = normalizePair(body.sourceLocale, body.targetLocale);
  const mode = body.mode === "caption" ? "caption" : "ocr";

  try {
    const image = body.imageBase64
      ? decodeAudioBase64(body.imageBase64)
      : new Uint8Array();

    if (!body.imageBase64 && stack.vision.id !== "demo-vision") {
      return c.json({ error: "image_required" }, 400);
    }

    const result = await stack.vision.assist({
      image,
      mimeType: body.mimeType ?? "image/jpeg",
      mode,
      sourceLocale: pair.sourceLocale,
      targetLocale: pair.targetLocale,
    });

    return c.json({
      sourceText: result.sourceText,
      translatedText: result.translatedText ?? null,
      provider: result.provider,
      mode: stack.mode,
      visionMode: mode,
      pair,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "vision_failed";
    return c.json({ error: message, mode: stack.mode }, 502);
  }
});
